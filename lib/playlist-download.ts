import type { PlaylistSuggestion } from '@/lib/event-playlist'

function artistFirst(song: string) {
  const parts = song.split(/\s+[—–-]\s+/)
  if (parts.length < 2) return song.trim()
  const title = parts.shift()?.trim() ?? ''
  const artist = parts.join(' - ').trim()
  return artist && title ? `${artist} – ${title}` : song.trim()
}

export function buildUniversalPlaylistText(title: string, suggestions: PlaylistSuggestion[]) {
  const lines = suggestions.map(item => artistFirst(item.song)).filter(Boolean)
  return [`Sofra — ${title}`, '', ...lines, ''].join('\n')
}

export function playlistFilename(title: string) {
  const safe = title.toLocaleLowerCase('en-US').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'sofra'
  return `${safe}-the-vibe.txt`
}
