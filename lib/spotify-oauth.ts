import 'server-only'
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { getSiteUrl } from '@/lib/site-url'

const ACCOUNTS_URL = 'https://accounts.spotify.com'
const API_URL = 'https://api.spotify.com/v1'
const REQUEST_TIMEOUT_MS = 7_000
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000
export const SPOTIFY_OAUTH_COOKIE = 'sofra_spotify_oauth_nonce'

type TokenPayload = {
  access_token?: string
  refresh_token?: string
  expires_in?: number
}

export class SpotifyReauthorizationRequiredError extends Error {
  constructor() {
    super('Spotify authorization must be renewed')
    this.name = 'SpotifyReauthorizationRequiredError'
  }
}

export type SpotifyOAuthState = {
  eventId: string
  userId: string
  nonce: string
  expiresAt: number
}

function credentials() {
  const clientId = process.env.SPOTIFY_CLIENT_ID
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('Spotify credentials are not configured')
  return { clientId, clientSecret }
}

function secretKey() {
  const encoded = process.env.SPOTIFY_TOKEN_ENCRYPTION_KEY
  if (!encoded) throw new Error('SPOTIFY_TOKEN_ENCRYPTION_KEY is not configured')
  const key = Buffer.from(encoded, 'base64')
  if (key.length !== 32) throw new Error('SPOTIFY_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key')
  return key
}

function basicAuthorization() {
  const { clientId, clientSecret } = credentials()
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
}

export function spotifyRedirectUri() {
  return `${getSiteUrl()}/api/spotify/callback`
}

export function createSpotifyOAuthState(eventId: string, userId: string) {
  const state: SpotifyOAuthState = {
    eventId,
    userId,
    nonce: randomBytes(18).toString('base64url'),
    expiresAt: Date.now() + OAUTH_STATE_TTL_MS,
  }
  const payload = Buffer.from(JSON.stringify(state)).toString('base64url')
  const signature = createHmac('sha256', secretKey()).update(payload).digest('base64url')
  return { state: `${payload}.${signature}`, nonce: state.nonce }
}

export function verifySpotifyOAuthState(value: string): SpotifyOAuthState | null {
  const [payload, suppliedSignature] = value.split('.')
  if (!payload || !suppliedSignature) return null
  const expected = createHmac('sha256', secretKey()).update(payload).digest()
  let supplied: Buffer
  try { supplied = Buffer.from(suppliedSignature, 'base64url') } catch { return null }
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null
  try {
    const state = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as SpotifyOAuthState
    if (!state.eventId || !state.userId || !state.nonce || state.expiresAt < Date.now()) return null
    return state
  } catch {
    return null
  }
}

export function spotifyAuthorizationUrl(state: string) {
  const { clientId } = credentials()
  const url = new URL(`${ACCOUNTS_URL}/authorize`)
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', spotifyRedirectUri())
  url.searchParams.set('scope', 'playlist-modify-private')
  url.searchParams.set('state', state)
  return url
}

async function tokenRequest(body: URLSearchParams): Promise<TokenPayload> {
  const response = await fetch(`${ACCOUNTS_URL}/api/token`, {
    method: 'POST',
    headers: {
      Authorization: basicAuthorization(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: 'no-store',
  })
  if (!response.ok) {
    const errorBody = await response.json().catch(() => null) as { error?: string } | null
    if (response.status === 400 && errorBody?.error === 'invalid_grant') {
      throw new SpotifyReauthorizationRequiredError()
    }
    throw new Error(`Spotify OAuth token request returned HTTP_${response.status}`)
  }
  return response.json() as Promise<TokenPayload>
}

export async function exchangeSpotifyAuthorizationCode(code: string) {
  const payload = await tokenRequest(new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: spotifyRedirectUri(),
  }))
  if (!payload.access_token || !payload.refresh_token) throw new Error('Spotify authorization response was incomplete')
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt: new Date(Date.now() + Math.max(60, payload.expires_in ?? 3600) * 1000).toISOString(),
  }
}

export async function refreshSpotifyAuthorization(refreshToken: string) {
  const payload = await tokenRequest(new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  }))
  if (!payload.access_token) throw new Error('Spotify refresh response was incomplete')
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? refreshToken,
    expiresAt: new Date(Date.now() + Math.max(60, payload.expires_in ?? 3600) * 1000).toISOString(),
  }
}

export function encryptSpotifyToken(value: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', secretKey(), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`
}

export function decryptSpotifyToken(value: string) {
  const [version, iv, tag, encrypted] = value.split('.')
  if (version !== 'v1' || !iv || !tag || !encrypted) throw new Error('Stored Spotify token is invalid')
  const decipher = createDecipheriv('aes-256-gcm', secretKey(), Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8')
}

async function spotifyUserRequest<T>(path: string, accessToken: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`Spotify API request returned HTTP_${response.status}`)
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export async function fetchSpotifyUserId(accessToken: string) {
  const profile = await spotifyUserRequest<{ id?: string }>('/me', accessToken)
  if (!profile.id) throw new Error('Spotify profile response was incomplete')
  return profile.id
}

export async function createSpotifyPlaylist(params: {
  accessToken: string
  name: string
  description: string
  trackIds: string[]
}) {
  const playlist = await spotifyUserRequest<{ id?: string; external_urls?: { spotify?: string } }>(
    '/me/playlists',
    params.accessToken,
    { method: 'POST', body: JSON.stringify({ name: params.name, description: params.description, public: false }) },
  )
  if (!playlist.id) throw new Error('Spotify playlist response was incomplete')
  for (let start = 0; start < params.trackIds.length; start += 100) {
    const uris = params.trackIds.slice(start, start + 100).map(id => `spotify:track:${id}`)
    await spotifyUserRequest(`/playlists/${encodeURIComponent(playlist.id)}/items`, params.accessToken, {
      method: 'POST', body: JSON.stringify({ uris }),
    })
  }
  return {
    playlistId: playlist.id,
    playlistUrl: playlist.external_urls?.spotify ?? `https://open.spotify.com/playlist/${playlist.id}`,
  }
}
