/** @jest-environment node */

import { resetSpotifyTokenCacheForTests, searchSpotifyTracks } from '@/lib/spotify'

const originalClientId = process.env.SPOTIFY_CLIENT_ID
const originalClientSecret = process.env.SPOTIFY_CLIENT_SECRET

beforeEach(() => {
  process.env.SPOTIFY_CLIENT_ID = 'client-id'
  process.env.SPOTIFY_CLIENT_SECRET = 'client-secret'
  resetSpotifyTokenCacheForTests()
})

afterEach(() => {
  jest.restoreAllMocks()
  process.env.SPOTIFY_CLIENT_ID = originalClientId
  process.env.SPOTIFY_CLIENT_SECRET = originalClientSecret
})

it('keeps credentials in the token exchange and returns normalized track matches', async () => {
  const fetchMock = jest.spyOn(global, 'fetch')
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'short-lived-token', expires_in: 3600 }),
    } as Response)
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ tracks: { items: [{
        id: 'track-123',
        name: 'Levitating',
        artists: [{ name: 'Dua Lipa' }],
        album: { name: 'Future Nostalgia', images: [{ url: 'https://i.scdn.co/album.jpg' }] },
      }] } }),
    } as Response)

  await expect(searchSpotifyTracks('levit')).resolves.toEqual([{
    id: 'track-123',
    title: 'Levitating',
    artist: 'Dua Lipa',
    text: 'Levitating — Dua Lipa',
    album: 'Future Nostalgia',
    albumImageUrl: 'https://i.scdn.co/album.jpg',
  }])

  const [tokenUrl, tokenInit] = fetchMock.mock.calls[0]
  expect(String(tokenUrl)).toBe('https://accounts.spotify.com/api/token')
  expect(tokenInit?.body).toBe('grant_type=client_credentials')
  expect((tokenInit?.headers as Record<string, string>).Authorization).toMatch(/^Basic /)
  const [searchUrl, searchInit] = fetchMock.mock.calls[1]
  expect(String(searchUrl)).toContain('api.spotify.com/v1/search?q=levit&type=track&limit=5')
  expect((searchInit?.headers as Record<string, string>).Authorization).toBe('Bearer short-lived-token')
})

it('reuses a valid short-lived access token', async () => {
  const fetchMock = jest.spyOn(global, 'fetch')
    .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'cached-token', expires_in: 3600 }) } as Response)
    .mockResolvedValue({ ok: true, status: 200, json: async () => ({ tracks: { items: [] } }) } as Response)

  await searchSpotifyTracks('first query')
  await searchSpotifyTracks('second query')

  expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/api/token'))).toHaveLength(1)
  expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/v1/search'))).toHaveLength(2)
})
