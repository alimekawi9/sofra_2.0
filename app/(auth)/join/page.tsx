'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { safeNext } from '@/lib/navigation'
import { WelcomeCard } from '@/components/sofra-v2/WelcomeCard'
import { JoinForm } from '@/components/sofra-v2/JoinForm'
import '@/components/sofra-v2/sofra-v2.css'

const STORAGE_KEY = 'sofra_user_id'

function normalizePhone(value: string): string | null {
  const digits = value.replace(/\D/g, '')
  return digits ? `+${digits}` : null
}

export default function JoinPage() {
  return <Suspense fallback={null}><JoinInner /></Suspense>
}

function JoinInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const next = safeNext(searchParams?.get('next') ?? null)
  const [started, setStarted] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) router.replace(next)
    else setLoading(false)
  }, [next, router])

  async function handleSubmit() {
    const trimmedName = name.trim()
    const trimmedPhone = normalizePhone(phone)
    if (!trimmedName || submitting) return
    setSubmitting(true)
    setError('')

    if (trimmedPhone) {
      const { data: existing, error: lookupError } = await supabase.from('users').select('id').eq('phone', trimmedPhone).maybeSingle()
      if (lookupError) {
        setError(lookupError.message)
        setSubmitting(false)
        return
      }
      if (existing) {
        localStorage.setItem(STORAGE_KEY, existing.id)
        router.replace(next)
        return
      }
    }

    const newId = crypto.randomUUID()
    const { error: insertError } = await supabase.from('users').insert({ id: newId, name: trimmedName, phone: trimmedPhone })
    if (insertError) {
      setError(insertError.message)
      setSubmitting(false)
      return
    }
    localStorage.setItem(STORAGE_KEY, newId)
    router.replace(next)
  }

  if (loading) return null
  if (!started) return <WelcomeCard onYalla={() => setStarted(true)} />
  return <><JoinForm name={name} phone={phone} onNameChange={setName} onPhoneChange={setPhone} onSubmit={handleSubmit} isSubmitting={submitting} />{error && <p className="sv2-hint" role="alert" style={{ textAlign: 'center' }}>{error}</p>}</>
}
