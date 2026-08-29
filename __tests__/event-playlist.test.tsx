import { useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EventPlaylist } from '@/components/sofra-v2/EventPlaylist'
import { addPlaylistSuggestion, MAX_PLAYLIST_SUGGESTIONS, validatePlaylistSong, type PlaylistSuggestion } from '@/lib/event-playlist'
import { buildUniversalPlaylistText, playlistFilename } from '@/lib/playlist-download'

const originalFetch = global.fetch

afterEach(() => {
  jest.restoreAllMocks()
  global.fetch = originalFetch
})

function suggestion(id: string, userId: string, song: string, name = 'Marina'): PlaylistSuggestion {
  return {
    id,
    eventId: 'event-1',
    userId,
    song,
    spotifyTrackId: null,
    createdAt: `2026-08-29T10:0${id}:00.000Z`,
    suggesterName: name,
    suggesterPhotoUrl: null,
  }
}

it('shows every shared suggestion with the suggester identity', () => {
  render(<EventPlaylist suggestions={[
    suggestion('1', 'guest-1', 'Levitating — Dua Lipa'),
    suggestion('2', 'guest-2', 'Essence — Wizkid', 'Ali'),
  ]} currentUserId="guest-1" loading={false} adding={false} error="" onRetry={jest.fn()} onAdd={jest.fn()} />)

  expect(screen.getByText('Levitating — Dua Lipa')).toBeInTheDocument()
  expect(screen.getByText('Essence — Wizkid')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Marina/ })).toHaveAttribute('href', '/profile/guest-1')
  expect(screen.getByRole('link', { name: /Ali/ })).toHaveAttribute('href', '/profile/guest-2')
  expect(screen.getByText('1 of 3 songs added')).toBeInTheDocument()
})

it('offers debounced Spotify matches and submits the selected track id', async () => {
  const user = userEvent.setup()
  const add = jest.fn().mockResolvedValue(true)
  const fetchMock = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ results: [{
      id: 'spotify-123',
      title: 'Levitating',
      artist: 'Dua Lipa',
      text: 'Levitating — Dua Lipa',
      album: 'Future Nostalgia',
      albumImageUrl: 'https://i.scdn.co/image/example',
    }] }),
  } as Response)
  global.fetch = fetchMock as typeof fetch

  render(<EventPlaylist suggestions={[]} currentUserId="me" loading={false} adding={false} error=""
    onRetry={jest.fn()} onAdd={add} />)
  await user.type(screen.getByLabelText('Add a song'), 'levit')
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/spotify/search?q=levit', expect.any(Object)))
  await user.click(await screen.findByRole('option', { name: /Levitating.*Dua Lipa/i }))
  await user.click(screen.getByRole('button', { name: 'ADD' }))

  expect(add).toHaveBeenCalledWith('Levitating — Dua Lipa', 'spotify-123')
})

it('keeps manual freeform submission available when Spotify is unreachable', async () => {
  const user = userEvent.setup()
  const add = jest.fn().mockResolvedValue(true)
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    status: 503,
    json: async () => ({ error: 'Suggestions are unavailable.' }),
  } as Response) as typeof fetch
  render(<EventPlaylist suggestions={[]} currentUserId="me" loading={false} adding={false} error=""
    onRetry={jest.fn()} onAdd={add} />)

  await user.type(screen.getByLabelText('Add a song'), 'My impossible deep cut')
  expect(await screen.findByText(/suggestions are unavailable/i)).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'ADD' }))
  expect(add).toHaveBeenCalledWith('My impossible deep cut', null)
})

it('lets a guest add three songs and removes the input before a fourth', async () => {
  const user = userEvent.setup()
  const addSpy = jest.fn()

  function Harness() {
    const [songs, setSongs] = useState<PlaylistSuggestion[]>([])
    return <EventPlaylist suggestions={songs} currentUserId="me" loading={false} adding={false} error="" onRetry={jest.fn()}
      onAdd={async (song) => {
        addSpy(song)
        setSongs((current) => [...current, suggestion(String(current.length + 1), 'me', song, 'Me')])
        return true
      }} />
  }

  render(<Harness />)
  for (const song of ['Song One — Artist', 'Song Two — Artist', 'Song Three — Artist']) {
    await user.type(screen.getByLabelText('Add a song'), song)
    await user.click(screen.getByRole('button', { name: 'ADD' }))
  }

  expect(addSpy).toHaveBeenCalledTimes(MAX_PLAYLIST_SUGGESTIONS)
  expect(screen.getByText('3 of 3 songs added')).toBeInTheDocument()
  expect(screen.queryByLabelText('Add a song')).not.toBeInTheDocument()
  expect(screen.getByText(/three-song contribution/i)).toBeInTheDocument()
})

it('validates empty, overlong, and fourth-song submissions', () => {
  expect(validatePlaylistSong('   ', 0)).toMatch(/title and artist/i)
  expect(validatePlaylistSong('x'.repeat(201), 0)).toMatch(/under 200/i)
  expect(validatePlaylistSong('Another song', 3)).toMatch(/already added/i)
  expect(validatePlaylistSong('Another song', 2)).toBeNull()
})

it('persists canonical text with a Spotify id and keeps manual ids nullable', async () => {
  const inserted: Array<Record<string, unknown>> = []
  const supabase = {
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        inserted.push(row)
        return {
          select: () => ({
            single: async () => ({
              data: {
                id: `song-${inserted.length}`,
                ...row,
                created_at: '2026-08-29T12:00:00Z',
                users: { name: 'Me', photo_url: null },
              },
              error: null,
            }),
          }),
        }
      },
    }),
  }

  await addPlaylistSuggestion(supabase as never, {
    eventId: 'event-1', userId: 'me', song: 'Levitating — Dua Lipa', spotifyTrackId: 'track-123', currentCount: 0,
  })
  await addPlaylistSuggestion(supabase as never, {
    eventId: 'event-1', userId: 'me', song: 'Unreleased kitchen demo', currentCount: 1,
  })

  expect(inserted[0]).toEqual(expect.objectContaining({ song: 'Levitating — Dua Lipa', spotify_track_id: 'track-123' }))
  expect(inserted[1]).toEqual(expect.objectContaining({ song: 'Unreleased kitchen demo', spotify_track_id: null }))
})

it('lets the suggester remove their own song but not another guest song', async () => {
  const user = userEvent.setup()
  const remove = jest.fn().mockResolvedValue(true)
  render(<EventPlaylist suggestions={[
    suggestion('mine', 'me', 'Mine — Artist'),
    suggestion('theirs', 'guest-2', 'Theirs — Artist', 'Ali'),
  ]} currentUserId="me" loading={false} adding={false} error=""
    onRetry={jest.fn()} onAdd={jest.fn()} onDelete={remove} />)

  expect(screen.getByRole('button', { name: 'Remove Mine — Artist' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Remove Theirs — Artist' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Remove Mine — Artist' }))
  expect(remove).toHaveBeenCalledWith('mine')
})

it('lets the host remove any suggestion', () => {
  render(<EventPlaylist isHost suggestions={[
    suggestion('one', 'guest-1', 'One — Artist'),
    suggestion('two', 'guest-2', 'Two — Artist', 'Ali'),
  ]} currentUserId="host" loading={false} adding={false} error=""
    onRetry={jest.fn()} onAdd={jest.fn()} onDelete={jest.fn()} />)

  expect(screen.getByRole('button', { name: 'Remove One — Artist' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Remove Two — Artist' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'EXPORT TO SPOTIFY' })).toBeInTheDocument()
})

it('lets a co-host manage suggestions without offering the original-host Spotify export', () => {
  render(<EventPlaylist isHost canExportSpotify={false} suggestions={[
    suggestion('one', 'guest-1', 'One — Artist'),
  ]} currentUserId="cohost" loading={false} adding={false} error=""
    onRetry={jest.fn()} onAdd={jest.fn()} onDelete={jest.fn()} />)

  expect(screen.getByRole('button', { name: 'Remove One — Artist' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'EXPORT TO SPOTIFY' })).not.toBeInTheDocument()
})

it('keeps Spotify export host-only and gives every member a universal download', () => {
  render(<EventPlaylist suggestions={[suggestion('one', 'guest-1', 'Levitating — Dua Lipa')]}
    currentUserId="guest-1" loading={false} adding={false} error=""
    onRetry={jest.fn()} onAdd={jest.fn()} />)

  expect(screen.getByRole('button', { name: 'DOWNLOAD PLAYLIST' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'EXPORT TO SPOTIFY' })).not.toBeInTheDocument()
})

it('builds an artist-first universal playlist covering Spotify and manual entries', () => {
  const contents = buildUniversalPlaylistText('The Odyssey', [
    suggestion('one', 'guest-1', 'Levitating — Dua Lipa'),
    suggestion('two', 'guest-2', 'Unreleased kitchen demo', 'Ali'),
  ])

  expect(contents).toContain('Dua Lipa – Levitating')
  expect(contents).toContain('Unreleased kitchen demo')
  expect(playlistFilename('The Odyssey')).toBe('the-odyssey-the-vibe.txt')
})
