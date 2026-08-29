import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { searchSpotifyTracks } from '@/lib/spotify'
import {
  createSpotifyPlaylist,
  decryptSpotifyToken,
  encryptSpotifyToken,
  refreshSpotifyAuthorization,
  SpotifyReauthorizationRequiredError,
} from '@/lib/spotify-oauth'

type SpotifyConnectionRow = {
  user_id: string
  spotify_user_id: string
  access_token_ciphertext: string
  refresh_token_ciphertext: string
  token_expires_at: string
}

export async function requireEventHost(admin: SupabaseClient, eventId: string, userId: string) {
  const { data, error } = await admin.from('events').select('host_id,title').eq('id', eventId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data || data.host_id !== userId) return null
  return { title: String(data.title || 'Sofra') }
}

export async function saveSpotifyConnection(admin: SupabaseClient, params: {
  userId: string
  spotifyUserId: string
  accessToken: string
  refreshToken: string
  expiresAt: string
}) {
  const { error } = await admin.from('spotify_connections').upsert({
    user_id: params.userId,
    spotify_user_id: params.spotifyUserId,
    access_token_ciphertext: encryptSpotifyToken(params.accessToken),
    refresh_token_ciphertext: encryptSpotifyToken(params.refreshToken),
    token_expires_at: params.expiresAt,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })
  if (error) throw new Error(error.message)
}

async function usableAccessToken(admin: SupabaseClient, row: SpotifyConnectionRow) {
  const expiresSoon = new Date(row.token_expires_at).getTime() <= Date.now() + 60_000
  if (!expiresSoon) return decryptSpotifyToken(row.access_token_ciphertext)

  const refreshed = await refreshSpotifyAuthorization(decryptSpotifyToken(row.refresh_token_ciphertext))
  const { error } = await admin.from('spotify_connections').update({
    access_token_ciphertext: encryptSpotifyToken(refreshed.accessToken),
    refresh_token_ciphertext: encryptSpotifyToken(refreshed.refreshToken),
    token_expires_at: refreshed.expiresAt,
    updated_at: new Date().toISOString(),
  }).eq('user_id', row.user_id)
  if (error) throw new Error(error.message)
  return refreshed.accessToken
}

export type SpotifyPlaylistExportResult = {
  playlistUrl: string
  matchedCount: number
  unmatchedSongs: string[]
}

export async function exportEventPlaylistToSpotify(admin: SupabaseClient, eventId: string, userId: string): Promise<
  { kind: 'auth-required' } | { kind: 'empty' } | { kind: 'created'; result: SpotifyPlaylistExportResult }
> {
  const event = await requireEventHost(admin, eventId, userId)
  if (!event) throw new Error('FORBIDDEN')

  const { data: connection, error: connectionError } = await admin
    .from('spotify_connections')
    .select('user_id,spotify_user_id,access_token_ciphertext,refresh_token_ciphertext,token_expires_at')
    .eq('user_id', userId)
    .maybeSingle()
  if (connectionError) throw new Error(connectionError.message)
  if (!connection) return { kind: 'auth-required' }

  const { data: suggestions, error: suggestionsError } = await admin
    .from('playlist_suggestions')
    .select('id,song,spotify_track_id')
    .eq('event_id', eventId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
  if (suggestionsError) throw new Error(suggestionsError.message)
  if (!suggestions?.length) return { kind: 'empty' }

  const trackIds: string[] = []
  const unmatchedSongs: string[] = []
  for (const suggestion of suggestions as Array<{ id: string; song: string; spotify_track_id: string | null }>) {
    if (suggestion.spotify_track_id) {
      trackIds.push(suggestion.spotify_track_id)
      continue
    }
    try {
      const [match] = await searchSpotifyTracks(suggestion.song)
      if (!match) {
        unmatchedSongs.push(suggestion.song)
        continue
      }
      trackIds.push(match.id)
      await admin.from('playlist_suggestions').update({ spotify_track_id: match.id }).eq('id', suggestion.id)
    } catch {
      unmatchedSongs.push(suggestion.song)
    }
  }

  let accessToken: string
  try {
    accessToken = await usableAccessToken(admin, connection as SpotifyConnectionRow)
  } catch (error) {
    if (!(error instanceof SpotifyReauthorizationRequiredError)) throw error
    await admin.from('spotify_connections').delete().eq('user_id', userId)
    return { kind: 'auth-required' }
  }
  const playlist = await createSpotifyPlaylist({
    accessToken,
    name: `${event.title} — The Vibe`,
    description: 'Song suggestions gathered around the Sofra table.',
    trackIds,
  })
  return {
    kind: 'created',
    result: { playlistUrl: playlist.playlistUrl, matchedCount: trackIds.length, unmatchedSongs },
  }
}
