'use client'

import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { safeNext } from '@/lib/navigation'
import { WelcomeCard } from '@/components/sofra-v2/WelcomeCard'
import { SignupForm } from '@/components/sofra-v2/SignupForm'
import { NamePlateForm } from '@/components/sofra-v2/NamePlateForm'
import '@/components/sofra-v2/sofra-v2.css'

const STORAGE_KEY = 'sofra_user_id'

type Step = 'welcome' | 'phone' | 'name'

// Only permit relative paths within this app — reject absolute URLs, protocol
// links, and scheme-relative "//host" targets to prevent open redirects.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  )
}

function LoginInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const next = safeNext(searchParams?.get('next') ?? null)

  const [step, setStep] = useState<Step>('welcome')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      router.replace(next)
    } else {
      setLoading(false)
    }
  }, [router, next])

  // Phone-first: an existing account (matched by phone) logs straight in.
  // Only a genuinely new phone number continues to the name step.
  async function handlePhoneSubmit() {
    const trimmedPhone = phone.trim()
    if (!trimmedPhone || submitting) return

    setSubmitting(true)
    setError('')

    const { data: existing, error: selectError } = await supabase
      .from('users')
      .select('id')
      .eq('phone', trimmedPhone)
      .maybeSingle()

    if (selectError) {
      setError(selectError.message)
      setSubmitting(false)
      return
    }

    if (existing) {
      localStorage.setItem(STORAGE_KEY, existing.id)
      router.replace(next)
      return
    }

    setSubmitting(false)
    setStep('name')
  }

  async function handleNameSubmit() {
    const trimmedName = name.trim()
    if (!trimmedName || submitting) return

    setSubmitting(true)
    setError('')

    const newId = crypto.randomUUID()
    const { error: insertError } = await supabase
      .from('users')
      .insert({ id: newId, name: trimmedName, phone: phone.trim() })

    if (insertError) {
      setError(insertError.message)
      setSubmitting(false)
      return
    }

    localStorage.setItem(STORAGE_KEY, newId)
    router.replace(next)
  }

  if (loading) return null

  if (step === 'welcome') {
    return <WelcomeCard onYalla={() => setStep('phone')} />
  }

  if (step === 'name') {
    return (
      <>
        <NamePlateForm name={name} onNameChange={setName} onSubmit={handleNameSubmit} isSubmitting={submitting} />
        {error && <p className="sv2-hint" role="alert" style={{ textAlign: 'center' }}>{error}</p>}
      </>
    )
  }

  return (
    <>
      <SignupForm phone={phone} onPhoneChange={setPhone} onSubmit={handlePhoneSubmit} isSubmitting={submitting} />
      {error && <p className="sv2-hint" role="alert" style={{ textAlign: 'center' }}>{error}</p>}
    </>
  )
}
