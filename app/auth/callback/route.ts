import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { safeNext } from '@/lib/navigation'

type ClaimResult = { userId: string | null; needsName: boolean }

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const next = safeNext(url.searchParams.get('next'))
  if (!code) return NextResponse.redirect(new URL('/login?error=missing_code', url.origin))

  const supabase = createClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error || !data.user) {
    return NextResponse.redirect(new URL('/login?error=auth_callback', url.origin))
  }

  const provider = data.user.app_metadata?.provider
  const metadata = data.user.user_metadata ?? {}
  const googleName = provider === 'google'
    ? String(metadata.full_name ?? metadata.name ?? '').trim() || null
    : null
  const googlePhoto = provider === 'google'
    ? String(metadata.avatar_url ?? metadata.picture ?? '').trim() || null
    : null

  const { data: claimed, error: claimError } = await supabase.rpc('claim_current_user', {
    // Existing exact-email profiles can be linked immediately. New accounts
    // finish on the editable name plate, including Google-prefilled names.
    p_name: null,
    p_photo_url: googlePhoto,
  })
  if (claimError) return NextResponse.redirect(new URL('/login?error=profile_claim', url.origin))

  const result = claimed as ClaimResult
  const prefill = googleName ? `&prefill=${encodeURIComponent(googleName)}` : ''
  const photo = googlePhoto ? `&photo=${encodeURIComponent(googlePhoto)}` : ''
  const destination = result.needsName
    ? `/name?next=${encodeURIComponent(next)}${prefill}${photo}`
    : next
  return NextResponse.redirect(new URL(destination, url.origin))
}
