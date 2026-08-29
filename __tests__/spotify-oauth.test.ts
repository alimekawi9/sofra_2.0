/** @jest-environment node */

import {
  createSpotifyOAuthState,
  createSpotifyPlaylist,
  decryptSpotifyToken,
  encryptSpotifyToken,
  refreshSpotifyAuthorization,
  SpotifyReauthorizationRequiredError,
  verifySpotifyOAuthState,
} from '@/lib/spotify-oauth'

const originalKey = process.env.SPOTIFY_TOKEN_ENCRYPTION_KEY
const originalClientId = process.env.SPOTIFY_CLIENT_ID
const originalClientSecret = process.env.SPOTIFY_CLIENT_SECRET

beforeEach(() => {
  process.env.SPOTIFY_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64')
  process.env.SPOTIFY_CLIENT_ID = 'client-id'
  process.env.SPOTIFY_CLIENT_SECRET = 'client-secret'
})

afterEach(() => {
  jest.restoreAllMocks()
  process.env.SPOTIFY_TOKEN_ENCRYPTION_KEY = originalKey
  process.env.SPOTIFY_CLIENT_ID = originalClientId
  process.env.SPOTIFY_CLIENT_SECRET = originalClientSecret
})

it('round-trips an encrypted Spotify token without storing plaintext', () => {
  const encrypted = encryptSpotifyToken('private-access-token')
  expect(encrypted).not.toContain('private-access-token')
  expect(decryptSpotifyToken(encrypted)).toBe('private-access-token')
})

it('signs OAuth state and rejects tampering', () => {
  const { state, nonce } = createSpotifyOAuthState('event-1', 'host-1')
  expect(verifySpotifyOAuthState(state)).toEqual(expect.objectContaining({
    eventId: 'event-1',
    userId: 'host-1',
    nonce,
  }))

  const [payload, signature] = state.split('.')
  expect(verifySpotifyOAuthState(`${payload}x.${signature}`)).toBeNull()
})

it('uses Spotify current playlist endpoints and adds track URIs', async () => {
  const fetchMock = jest.spyOn(global, 'fetch')
    .mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ id: 'playlist-1', external_urls: { spotify: 'https://open.spotify.com/playlist/playlist-1' } }),
    } as Response)
    .mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ snapshot_id: 'snapshot-1' }) } as Response)

  await expect(createSpotifyPlaylist({
    accessToken: 'user-token',
    name: 'The Odyssey — The Vibe',
    description: 'From Sofra',
    trackIds: ['track-1', 'track-2'],
  })).resolves.toEqual({
    playlistId: 'playlist-1',
    playlistUrl: 'https://open.spotify.com/playlist/playlist-1',
  })

  expect(String(fetchMock.mock.calls[0][0])).toBe('https://api.spotify.com/v1/me/playlists')
  expect(String(fetchMock.mock.calls[1][0])).toBe('https://api.spotify.com/v1/playlists/playlist-1/items')
  expect(fetchMock.mock.calls[1][1]?.body).toBe(JSON.stringify({
    uris: ['spotify:track:track-1', 'spotify:track:track-2'],
  }))
})

it('requires authorization again when Spotify expires a refresh token', async () => {
  jest.spyOn(global, 'fetch').mockResolvedValueOnce({
    ok: false,
    status: 400,
    json: async () => ({ error: 'invalid_grant' }),
  } as Response)

  await expect(refreshSpotifyAuthorization('expired-refresh-token'))
    .rejects.toBeInstanceOf(SpotifyReauthorizationRequiredError)
})
