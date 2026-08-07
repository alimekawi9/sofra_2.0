'use client'

import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { safeNext } from '@/lib/navigation'
import { NamePlateForm } from '@/components/sofra-v2/NamePlateForm'
import '@/components/sofra-v2/sofra-v2.css'

const STORAGE_KEY = 'sofra_user_id'

// Name-only onboarding: no phone lookup, so every submission creates a new
// user with phone = null. Existing phone-based accounts are untouched and
// keep working through /login.
export default function NameOnboardingPage() {
  return (
    <Suspense fallback={null}>
      <NameOnboardingInner />
    </Suspense>
  )
}

function NameOnboardingInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const next = safeNext(searchParams?.get('next') ?? null)

  const [name, setName] = useState('')
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

  async function handleSubmit() {
    if (submitting) return
    const trimmedName = name.trim()
    if (!trimmedName) return

    setSubmitting(true)
    setError('')

    const newId = crypto.randomUUID()
    const { error: insertError } = await supabase
      .from('users')
      .insert({ id: newId, name: trimmedName, phone: null })

    if (insertError) {
      setError(insertError.message)
      setSubmitting(false)
      return
    }

    localStorage.setItem(STORAGE_KEY, newId)
    router.replace(next)
  }

  if (loading) return null

  return (
    <>
      <NamePlateForm name={name} onNameChange={setName} onSubmit={handleSubmit} isSubmitting={submitting} />
      {error && (
        <p
          style={{
            color: '#C0524A',
            fontSize: 13,
            textAlign: 'center',
            marginTop: 12,
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          {error}
        </p>
      )}
    </>
  )
}
