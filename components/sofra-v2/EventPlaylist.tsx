'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import {
  MAX_PLAYLIST_SONG_LENGTH,
  MAX_PLAYLIST_SUGGESTIONS,
  playlistSuggestionCount,
  validatePlaylistSong,
  type PlaylistSuggestion,
} from '@/lib/event-playlist'
import { ProfileIdentityLink } from './ProfileIdentityLink'
import { buildUniversalPlaylistText, playlistFilename } from '@/lib/playlist-download'

export interface SpotifyTrackSuggestion {
  id: string
  title: string
  artist: string
  text: string
  album: string
  albumImageUrl: string | null
}

export function EventPlaylist({ eventId = 'event', eventTitle = 'Sofra', isHost = false, canExportSpotify = isHost, suggestions, currentUserId, loading, adding, deletingId = null, error, onRetry, onAdd, onDelete }: {
  eventId?: string
  eventTitle?: string
  isHost?: boolean
  canExportSpotify?: boolean
  suggestions: PlaylistSuggestion[]
  currentUserId: string | null
  loading: boolean
  adding: boolean
  deletingId?: string | null
  error: string
  onRetry: () => void
  onAdd: (song: string, spotifyTrackId?: string | null) => Promise<boolean>
  onDelete?: (suggestionId: string) => Promise<boolean>
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [song, setSong] = useState('')
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null)
  const [results, setResults] = useState<SpotifyTrackSuggestion[]>([])
  const [searching, setSearching] = useState(false)
  const [searchFailed, setSearchFailed] = useState(false)
  const [searchMessage, setSearchMessage] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [validationError, setValidationError] = useState('')
  const [exportingSpotify, setExportingSpotify] = useState(false)
  const [exportError, setExportError] = useState('')
  const [exportResult, setExportResult] = useState<{ playlistUrl: string; matchedCount: number; unmatchedSongs: string[] } | null>(null)
  const used = currentUserId ? playlistSuggestionCount(suggestions, currentUserId) : 0
  const atLimit = used >= MAX_PLAYLIST_SUGGESTIONS

  const exportToSpotify = useCallback(async () => {
    if (!canExportSpotify || !currentUserId || suggestions.length === 0) return
    setExportingSpotify(true)
    setExportError('')
    setExportResult(null)
    try {
      const response = await fetch('/api/spotify/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, userId: currentUserId }),
      })
      const body = await response.json() as {
        code?: string
        error?: string
        playlistUrl?: string
        matchedCount?: number
        unmatchedSongs?: string[]
      }
      if (response.status === 401 && body.code === 'SPOTIFY_AUTH_REQUIRED') {
        window.location.assign(`/api/spotify/connect?eventId=${encodeURIComponent(eventId)}&userId=${encodeURIComponent(currentUserId)}`)
        return
      }
      if (!response.ok || !body.playlistUrl) throw new Error(body.error || 'Could not export this playlist to Spotify.')
      setExportResult({
        playlistUrl: body.playlistUrl,
        matchedCount: body.matchedCount ?? 0,
        unmatchedSongs: body.unmatchedSongs ?? [],
      })
    } catch (caught) {
      setExportError(caught instanceof Error ? caught.message : 'Could not export this playlist to Spotify.')
    } finally {
      setExportingSpotify(false)
    }
  }, [canExportSpotify, currentUserId, eventId, suggestions.length])

  useEffect(() => {
    if (!canExportSpotify || typeof window === 'undefined') return
    const url = new URL(window.location.href)
    const spotifyStatus = url.searchParams.get('spotify')
    if (!spotifyStatus) return
    url.searchParams.delete('spotify')
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
    if (spotifyStatus === 'connected') void exportToSpotify()
    else if (spotifyStatus === 'denied') setExportError('Spotify authorization was cancelled. Nothing was exported.')
    else setExportError('Spotify authorization could not be completed. Try again.')
  }, [canExportSpotify, exportToSpotify])

  function downloadUniversalPlaylist() {
    if (suggestions.length === 0) return
    const blob = new Blob([buildUniversalPlaylistText(eventTitle, suggestions)], { type: 'text/plain;charset=utf-8' })
    const objectUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = playlistFilename(eventTitle)
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(objectUrl)
  }

  useEffect(() => {
    function close(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])

  useEffect(() => {
    const query = song.trim()
    if (query.length < 2 || selectedTrackId || atLimit) {
      setResults([])
      setOpen(false)
      setSearchFailed(false)
      setSearchMessage('')
      return
    }
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setSearching(true)
      setSearchFailed(false)
      setSearchMessage('')
      setOpen(true)
      try {
        const response = await fetch(`/api/spotify/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        const body = await response.json() as { results?: SpotifyTrackSuggestion[]; error?: string }
        if (!response.ok) throw new Error(body.error || `Spotify search failed: HTTP_${response.status}`)
        if (controller.signal.aborted) return
        setResults((body.results ?? []).slice(0, 5))
        setActiveIndex(-1)
      } catch (caught) {
        if ((caught as Error).name !== 'AbortError') {
          setResults([])
          setSearchFailed(true)
          setSearchMessage(caught instanceof Error ? caught.message : 'Song suggestions are temporarily unavailable.')
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false)
      }
    }, 300)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [atLimit, selectedTrackId, song])

  function selectTrack(track: SpotifyTrackSuggestion) {
    setSong(track.text)
    setSelectedTrackId(track.id)
    setValidationError('')
    setResults([])
    setOpen(false)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return
    if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex(index => Math.min(index + 1, results.length - 1)) }
    if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex(index => Math.max(index - 1, 0)) }
    if (event.key === 'Escape') setOpen(false)
    if (event.key === 'Enter' && activeIndex >= 0) { event.preventDefault(); selectTrack(results[activeIndex]) }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const nextError = validatePlaylistSong(song, used)
    if (nextError) {
      setValidationError(nextError)
      return
    }
    setValidationError('')
    if (await onAdd(song, selectedTrackId)) {
      setSong('')
      setSelectedTrackId(null)
      setResults([])
      setOpen(false)
    }
  }

  return (
    <div className="sv2-vibe" role="tabpanel" aria-labelledby="sv2-vibe-heading">
      <div className="sv2-section-heading">
        <h2 id="sv2-vibe-heading">The Vibe</h2>
        <span>{suggestions.length} {suggestions.length === 1 ? 'song' : 'songs'}</span>
      </div>

      {error && <p className="sv2-vibe-error" role="alert">{error} <button type="button" onClick={onRetry}>Retry</button></p>}
      {loading && suggestions.length === 0 && <p className="sv2-vibe-empty">Loading the playlist...</p>}
      {!loading && suggestions.length === 0 && <p className="sv2-vibe-empty">No songs yet. Set the tone for the table.</p>}

      {suggestions.length > 0 && (
        <ol className="sv2-vibe-list">
          {suggestions.map((suggestion) => (
            <li key={suggestion.id}>
              <ProfileIdentityLink userId={suggestion.userId} name={suggestion.suggesterName} photoUrl={suggestion.suggesterPhotoUrl} />
              <strong>{suggestion.song}</strong>
              {onDelete && (isHost || suggestion.userId === currentUserId) && <button className="sv2-vibe-remove" type="button"
                disabled={deletingId === suggestion.id} onClick={() => void onDelete(suggestion.id)}
                aria-label={`Remove ${suggestion.song}`}>{deletingId === suggestion.id ? 'REMOVING...' : 'REMOVE'}</button>}
            </li>
          ))}
        </ol>
      )}

      <div className="sv2-vibe-export-actions">
        <button type="button" onClick={downloadUniversalPlaylist} disabled={suggestions.length === 0}>DOWNLOAD PLAYLIST</button>
        {canExportSpotify && <button type="button" onClick={() => void exportToSpotify()}
          disabled={exportingSpotify || suggestions.length === 0}>{exportingSpotify ? 'EXPORTING...' : 'EXPORT TO SPOTIFY'}</button>}
      </div>
      {exportError && <p className="sv2-vibe-export-error" role="alert">{exportError}</p>}
      {exportResult && <div className="sv2-vibe-export-result" role="status">
        <p><strong>{exportResult.matchedCount} songs exported.</strong> <a href={exportResult.playlistUrl} target="_blank" rel="noreferrer">Open playlist</a></p>
        {exportResult.unmatchedSongs.length > 0 && <div>
          <strong>Couldn&rsquo;t match {exportResult.unmatchedSongs.length}:</strong>
          <ul>{exportResult.unmatchedSongs.map(songName => <li key={songName}>{songName}</li>)}</ul>
        </div>}
      </div>}

      <div className="sv2-vibe-contribution">
        <span>{used} of {MAX_PLAYLIST_SUGGESTIONS} songs added</span>
        {atLimit ? (
          <p>You&rsquo;ve set your three-song contribution.</p>
        ) : (
          <form onSubmit={submit}>
            <label htmlFor="sv2-vibe-song">Add a song</label>
            <div className="sv2-vibe-add-row">
              <div className="sv2-vibe-search" ref={rootRef}>
                <input id="sv2-vibe-song" value={song} maxLength={MAX_PLAYLIST_SONG_LENGTH}
                  role="combobox" aria-autocomplete="list" aria-expanded={open}
                  aria-controls="sv2-vibe-suggestions"
                  aria-activedescendant={activeIndex >= 0 ? `sv2-track-${activeIndex}` : undefined}
                  onKeyDown={onKeyDown}
                  onFocus={() => (results.length || searchFailed) && setOpen(true)}
                  onChange={(event) => {
                    setSong(event.target.value)
                    setSelectedTrackId(null)
                    setValidationError('')
                  }}
                  placeholder="Song title — Artist" disabled={adding} />
                {open && <div className="sv2-vibe-suggestions" id="sv2-vibe-suggestions" role="listbox">
                  {searching && <p role="status">Finding songs...</p>}
                  {!searching && searchFailed && <p>{searchMessage || 'Suggestions are unavailable.'} You can still add what you typed.</p>}
                  {!searching && !searchFailed && results.length === 0 && <p>No matches found. You can still add what you typed.</p>}
                  {!searching && results.map((track, index) => <button id={`sv2-track-${index}`} key={track.id}
                    type="button" role="option" aria-selected={activeIndex === index}
                    onMouseEnter={() => setActiveIndex(index)} onClick={() => selectTrack(track)}>
                    <span className="sv2-vibe-album-art" role="img" aria-label={`${track.album || track.title} artwork`}
                      style={track.albumImageUrl ? { backgroundImage: `url(${track.albumImageUrl})` } : undefined} />
                    <span><strong>{track.title}</strong><small>{track.artist}{track.album ? ` · ${track.album}` : ''}</small></span>
                  </button>)}
                  <footer>Search by Spotify · manual entries are always allowed</footer>
                </div>}
              </div>
              <button type="submit" disabled={adding || !song.trim()}>{adding ? 'ADDING...' : 'ADD'}</button>
            </div>
            {selectedTrackId && <p className="sv2-vibe-selected">Spotify track selected</p>}
            {validationError && <p role="alert">{validationError}</p>}
          </form>
        )}
      </div>
    </div>
  )
}
