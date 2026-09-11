'use client'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { safeNext } from '@/lib/navigation'
import { WelcomeCard } from '@/components/sofra-v2/WelcomeCard'
import { AuthChoiceForm } from '@/components/sofra-v2/AuthChoiceForm'
import '@/components/sofra-v2/sofra-v2.css'

export default function LoginPage() { return <Suspense fallback={null}><LoginInner /></Suspense> }
function LoginInner() {
  const router = useRouter(), searchParams = useSearchParams(), supabase = useMemo(() => createClient(), [])
  const next = safeNext(searchParams?.get('next') ?? null)
  const [step, setStep] = useState<'welcome' | 'auth'>(() => searchParams?.get('invite') === '1' ? 'auth' : 'welcome')
  const [email, setEmail] = useState(''), [loading, setLoading] = useState(true), [submitting, setSubmitting] = useState(false), [sent, setSent] = useState(false), [error, setError] = useState('')
  useEffect(() => { void supabase.auth.getUser().then(({ data }) => data.user ? router.replace(next) : setLoading(false)) }, [next, router, supabase])
  const callbackUrl = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
  async function google() {
    if (submitting) return; setSubmitting(true); setError('')
    const { error: authError } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: callbackUrl() } })
    if (authError) { setError(authError.message); setSubmitting(false) }
  }
  async function magicLink() {
    if (!email.trim() || submitting) return; setSubmitting(true); setError('')
    const { error: authError } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: callbackUrl(), shouldCreateUser: true } })
    setSubmitting(false); if (authError) setError(authError.message); else setSent(true)
  }
  if (loading) return null
  if (step === 'welcome') return <WelcomeCard onYalla={() => setStep('auth')} />
  return <><AuthChoiceForm email={email} onEmailChange={setEmail} onGoogle={google} onEmail={magicLink} submitting={submitting} sent={sent} />{error && <p className="sv2-hint" role="alert" style={{ textAlign: 'center' }}>{error}</p>}</>
}
