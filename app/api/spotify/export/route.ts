import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { exportEventPlaylistToSpotify } from '@/lib/spotify-export'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  let body: { eventId?: unknown; userId?: unknown }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) }
  if (typeof body.eventId !== 'string' || typeof body.userId !== 'string') {
    return NextResponse.json({ error: 'Missing export context.' }, { status: 400 })
  }
  try {
    const result = await exportEventPlaylistToSpotify(createAdminClient(), body.eventId, body.userId)
    if (result.kind === 'auth-required') {
      return NextResponse.json({ code: 'SPOTIFY_AUTH_REQUIRED' }, { status: 401 })
    }
    if (result.kind === 'empty') return NextResponse.json({ error: 'Add at least one song before exporting.' }, { status: 422 })
    return NextResponse.json(result.result)
  } catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Only the event host can export to Spotify.' }, { status: 403 })
    }
    console.error('Spotify playlist export failed', error)
    return NextResponse.json({ error: 'Could not export this playlist to Spotify.' }, { status: 503 })
  }
}
