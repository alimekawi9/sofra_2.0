import { NextResponse, type NextRequest } from 'next/server'
import { searchSpotifyTracks, type SpotifyTrackResult } from '@/lib/spotify'

export const runtime = 'nodejs'

const CACHE_TTL_MS = 5 * 60 * 1000
const cache = new Map<string, { expiresAt: number; results: SpotifyTrackResult[] }>()

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')?.trim() ?? ''
  if (query.length < 2 || query.length > 100) return NextResponse.json({ results: [] })

  const key = query.toLocaleLowerCase('en-US')
  const cached = cache.get(key)
  if (cached && cached.expiresAt > Date.now()) return NextResponse.json({ results: cached.results })

  try {
    const results = await searchSpotifyTracks(query)
    cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, results })
    return NextResponse.json({ results })
  } catch (error) {
    console.error('Spotify track search failed', error)
    const notConfigured = error instanceof Error && /credentials are not configured/i.test(error.message)
    return NextResponse.json({
      code: notConfigured ? 'SPOTIFY_NOT_CONFIGURED' : 'SPOTIFY_UNAVAILABLE',
      error: notConfigured && process.env.NODE_ENV !== 'production'
        ? 'Spotify autocomplete needs SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env.local.'
        : 'Song suggestions are temporarily unavailable.',
    }, { status: 503 })
  }
}
