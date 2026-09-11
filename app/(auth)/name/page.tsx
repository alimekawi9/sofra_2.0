'use client'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { safeNext } from '@/lib/navigation'
import { NamePlateForm } from '@/components/sofra-v2/NamePlateForm'
import '@/components/sofra-v2/sofra-v2.css'

export default function NameOnboardingPage() { return <Suspense fallback={null}><NameOnboardingInner /></Suspense> }
function NameOnboardingInner() {
  const router = useRouter(), searchParams = useSearchParams(), supabase = useMemo(() => createClient(), [])
  const next = safeNext(searchParams?.get('next') ?? null)
  const [name, setName] = useState(() => searchParams?.get('prefill') ?? ''), [loading, setLoading] = useState(true), [submitting, setSubmitting] = useState(false), [error, setError] = useState('')
  useEffect(() => { void supabase.auth.getUser().then(({ data }) => data.user ? setLoading(false) : router.replace('/login?next=' + encodeURIComponent(next))) }, [next, router, supabase])
  async function submit() {
    if (!name.trim() || submitting) return; setSubmitting(true); setError('')
    const { data, error: claimError } = await supabase.rpc('claim_current_user', { p_name: name.trim(), p_photo_url: searchParams?.get('photo') ?? null })
    if (claimError || !(data as { userId?: string } | null)?.userId) { setError(claimError?.message ?? 'Could not create your profile. Try again.'); setSubmitting(false); return }
    router.replace(next)
  }
  if (loading) return null
  return <><NamePlateForm name={name} onNameChange={setName} onSubmit={submit} isSubmitting={submitting} />{error && <p className="sv2-hint" role="alert" style={{ textAlign: 'center' }}>{error}</p>}</>
}
