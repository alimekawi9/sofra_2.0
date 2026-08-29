import { NextResponse, type NextRequest } from 'next/server'
import { getSiteUrl } from '@/lib/site-url'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireEventHost, saveSpotifyConnection } from '@/lib/spotify-export'
import {
  exchangeSpotifyAuthorizationCode,
  fetchSpotifyUserId,
  SPOTIFY_OAUTH_COOKIE,
  verifySpotifyOAuthState,
} from '@/lib/spotify-oauth'

export const runtime = 'nodejs'

function eventRedirect(eventId: string, result: string) {
  return new URL(`/events/${encodeURIComponent(eventId)}?spotify=${encodeURIComponent(result)}`, getSiteUrl())
}

export async function GET(request: NextRequest) {
  const stateValue = request.nextUrl.searchParams.get('state') ?? ''
  let state
  try { state = verifySpotifyOAuthState(stateValue) } catch { state = null }
  if (!state) return NextResponse.redirect(new URL('/events?spotify=invalid-state', getSiteUrl()))

  const nonce = request.cookies.get(SPOTIFY_OAUTH_COOKIE)?.value
  if (!nonce || nonce !== state.nonce) return NextResponse.redirect(eventRedirect(state.eventId, 'invalid-state'))
  if (request.nextUrl.searchParams.get('error')) return NextResponse.redirect(eventRedirect(state.eventId, 'denied'))
  const code = request.nextUrl.searchParams.get('code')
  if (!code) return NextResponse.redirect(eventRedirect(state.eventId, 'failed'))

  try {
    const admin = createAdminClient()
    if (!(await requireEventHost(admin, state.eventId, state.userId))) {
      return NextResponse.redirect(eventRedirect(state.eventId, 'forbidden'))
    }
    const tokens = await exchangeSpotifyAuthorizationCode(code)
    const spotifyUserId = await fetchSpotifyUserId(tokens.accessToken)
    await saveSpotifyConnection(admin, { userId: state.userId, spotifyUserId, ...tokens })
    const response = NextResponse.redirect(eventRedirect(state.eventId, 'connected'))
    response.cookies.set(SPOTIFY_OAUTH_COOKIE, '', { path: '/api/spotify/callback', maxAge: 0 })
    return response
  } catch (error) {
    console.error('Spotify authorization callback failed', error)
    return NextResponse.redirect(eventRedirect(state.eventId, 'failed'))
  }
}
