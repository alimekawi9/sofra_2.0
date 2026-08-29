import 'server-only'

const TOKEN_URL = 'https://accounts.spotify.com/api/token'
const SEARCH_URL = 'https://api.spotify.com/v1/search'
const REQUEST_TIMEOUT_MS = 5_000

type SpotifyTokenResponse = {
  access_token?: string
  expires_in?: number
}

type SpotifySearchResponse = {
  tracks?: {
    items?: Array<{
      id?: string
      name?: string
      artists?: Array<{ name?: string }>
      album?: { name?: string; images?: Array<{ url?: string; width?: number; height?: number }> }
    }>
  }
}

export interface SpotifyTrackResult {
  id: string
  title: string
  artist: string
  text: string
  album: string
  albumImageUrl: string | null
}

let tokenCache: { value: string; expiresAt: number } | null = null
let tokenRequest: Promise<string> | null = null

function spotifyCredentials() {
  const clientId = process.env.SPOTIFY_CLIENT_ID
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('Spotify credentials are not configured')
  return { clientId, clientSecret }
}

async function requestAccessToken(): Promise<string> {
  const { clientId, clientSecret } = spotifyCredentials()
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`Spotify token request returned HTTP_${response.status}`)
  const body = await response.json() as SpotifyTokenResponse
  if (!body.access_token) throw new Error('Spotify token response was incomplete')
  const lifetimeMs = Math.max(60, body.expires_in ?? 3600) * 1000
  tokenCache = { value: body.access_token, expiresAt: Date.now() + lifetimeMs - 60_000 }
  return body.access_token
}

async function accessToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && tokenCache && tokenCache.expiresAt > Date.now()) return tokenCache.value
  if (!forceRefresh && tokenRequest) return tokenRequest
  tokenRequest = requestAccessToken()
  try {
    return await tokenRequest
  } finally {
    tokenRequest = null
  }
}

function normalizeTracks(payload: SpotifySearchResponse): SpotifyTrackResult[] {
  return (payload.tracks?.items ?? []).flatMap((track) => {
    const id = track.id?.trim()
    const title = track.name?.trim()
    const artist = (track.artists ?? []).map(item => item.name?.trim()).filter(Boolean).join(', ')
    if (!id || !title || !artist) return []
    const image = (track.album?.images ?? []).find(item => item.url)?.url ?? null
    return [{
      id,
      title,
      artist,
      text: `${title} — ${artist}`,
      album: track.album?.name?.trim() ?? '',
      albumImageUrl: image,
    }]
  })
}

async function spotifySearchRequest(query: string, token: string) {
  const url = new URL(SEARCH_URL)
  url.searchParams.set('q', query)
  url.searchParams.set('type', 'track')
  url.searchParams.set('limit', '5')
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: 'no-store',
  })
  return response
}

export async function searchSpotifyTracks(query: string): Promise<SpotifyTrackResult[]> {
  let response = await spotifySearchRequest(query, await accessToken())
  if (response.status === 401) {
    tokenCache = null
    response = await spotifySearchRequest(query, await accessToken(true))
  }
  if (!response.ok) throw new Error(`Spotify search returned HTTP_${response.status}`)
  return normalizeTracks(await response.json() as SpotifySearchResponse).slice(0, 5)
}

export function resetSpotifyTokenCacheForTests() {
  tokenCache = null
  tokenRequest = null
}
