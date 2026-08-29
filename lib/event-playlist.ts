import type { SupabaseClient } from '@supabase/supabase-js'

export const MAX_PLAYLIST_SUGGESTIONS = 3
export const MAX_PLAYLIST_SONG_LENGTH = 200

export interface PlaylistSuggestion {
  id: string
  eventId: string
  userId: string
  song: string
  spotifyTrackId: string | null
  createdAt: string
  suggesterName: string
  suggesterPhotoUrl: string | null
}

type PlaylistSuggestionRow = {
  id: string
  event_id: string
  user_id: string
  song: string
  spotify_track_id?: string | null
  created_at: string
  users: { name: string; photo_url: string | null } | null
}

const PLAYLIST_SELECT = 'id,event_id,user_id,song,spotify_track_id,created_at,users(name,photo_url)'

function toSuggestion(row: PlaylistSuggestionRow): PlaylistSuggestion {
  return {
    id: row.id,
    eventId: row.event_id,
    userId: row.user_id,
    song: row.song,
    spotifyTrackId: row.spotify_track_id ?? null,
    createdAt: row.created_at,
    suggesterName: row.users?.name ?? 'Sofra guest',
    suggesterPhotoUrl: row.users?.photo_url ?? null,
  }
}

export function playlistSuggestionCount(suggestions: PlaylistSuggestion[], userId: string): number {
  return suggestions.filter((suggestion) => suggestion.userId === userId).length
}

export function validatePlaylistSong(song: string, currentCount: number): string | null {
  const trimmed = song.trim()
  if (!trimmed) return 'Add a song title and artist.'
  if (trimmed.length > MAX_PLAYLIST_SONG_LENGTH) return `Keep suggestions under ${MAX_PLAYLIST_SONG_LENGTH} characters.`
  if (currentCount >= MAX_PLAYLIST_SUGGESTIONS) return 'You have already added your 3 songs for this Sofra.'
  return null
}

export async function fetchPlaylistSuggestions(supabase: SupabaseClient, eventId: string) {
  try {
    const { data, error } = await supabase
      .from('playlist_suggestions')
      .select(PLAYLIST_SELECT)
      .eq('event_id', eventId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })

    if (error) return { suggestions: [] as PlaylistSuggestion[], error: error.message }
    return { suggestions: ((data ?? []) as unknown as PlaylistSuggestionRow[]).map(toSuggestion), error: null }
  } catch (caught) {
    return { suggestions: [] as PlaylistSuggestion[], error: caught instanceof Error ? caught.message : 'Unexpected request failure' }
  }
}

export async function addPlaylistSuggestion(
  supabase: SupabaseClient,
  params: { eventId: string; userId: string; song: string; spotifyTrackId?: string | null; currentCount: number }
) {
  const validationError = validatePlaylistSong(params.song, params.currentCount)
  if (validationError) return { suggestion: null as PlaylistSuggestion | null, error: validationError }

  try {
    const { data, error } = await supabase
      .from('playlist_suggestions')
      .insert({
        event_id: params.eventId,
        user_id: params.userId,
        song: params.song.trim(),
        spotify_track_id: params.spotifyTrackId?.trim() || null,
      })
      .select(PLAYLIST_SELECT)
      .single()

    if (error || !data) {
      const capped = error?.code === '23514' || error?.message?.includes('at most 3 songs')
      return { suggestion: null, error: capped ? 'You have already added your 3 songs for this Sofra.' : error?.message ?? 'Could not add that song.' }
    }
    return { suggestion: toSuggestion(data as unknown as PlaylistSuggestionRow), error: null }
  } catch (caught) {
    return { suggestion: null, error: caught instanceof Error ? caught.message : 'Unexpected request failure' }
  }
}

export async function removePlaylistSuggestion(
  supabase: SupabaseClient,
  params: { suggestionId: string; eventId: string; userId: string; canManageEvent: boolean }
) {
  try {
    let query = supabase
      .from('playlist_suggestions')
      .delete()
      .eq('id', params.suggestionId)
      .eq('event_id', params.eventId)
    if (!params.canManageEvent) query = query.eq('user_id', params.userId)
    const { error } = await query
    return { error: error?.message ?? null }
  } catch (caught) {
    return { error: caught instanceof Error ? caught.message : 'Unexpected request failure' }
  }
}
