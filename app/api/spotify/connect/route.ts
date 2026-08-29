import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireEventHost } from '@/lib/spotify-export'
import { createSpotifyOAuthState, SPOTIFY_OAUTH_COOKIE, spotifyAuthorizationUrl } from '@/lib/spotify-oauth'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const eventId = request.nextUrl.searchParams.get('eventId')?.trim() ?? ''
  const userId = request.nextUrl.searchParams.get('userId')?.trim() ?? ''
  if (!eventId || !userId) return NextResponse.json({ error: 'Missing export context.' }, { status: 400 })
  try {
    if (!(await requireEventHost(createAdminClient(), eventId, userId))) {
      return NextResponse.json({ error: 'Only the event host can export to Spotify.' }, { status: 403 })
    }
    const oauth = createSpotifyOAuthState(eventId, userId)
    const response = NextResponse.redirect(spotifyAuthorizationUrl(oauth.state))
    response.cookies.set(SPOTIFY_OAUTH_COOKIE, oauth.nonce, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/api/spotify/callback',
      maxAge: 10 * 60,
    })
    return response
  } catch (error) {
    console.error('Spotify authorization start failed', error)
    return NextResponse.json({ error: 'Spotify authorization is not configured.' }, { status: 503 })
  }
}
