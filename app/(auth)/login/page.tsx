'use client'

import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { C, THEMES } from '@/lib/theme'
import { safeNext } from '@/lib/navigation'

const STORAGE_KEY = 'sofra_user_id'

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

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(true)
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
    if (loading) return
    const trimmedName = name.trim()
    const trimmedPhone = phone.trim()
    if (!trimmedName || !trimmedPhone) return

    setLoading(true)
    setError('')

    const { data: existing, error: selectError } = await supabase
      .from('users')
      .select('id')
      .eq('phone', trimmedPhone)
      .maybeSingle()

    if (selectError) {
      setError(selectError.message)
      setLoading(false)
      return
    }

    if (existing) {
      localStorage.setItem(STORAGE_KEY, existing.id)
      router.replace(next)
      return
    }

    const newId = crypto.randomUUID()
    const { error: insertError } = await supabase
      .from('users')
      .insert({ id: newId, name: trimmedName, phone: trimmedPhone })

    if (insertError) {
      setError(insertError.message)
      setLoading(false)
      return
    }

    localStorage.setItem(STORAGE_KEY, newId)
    router.replace(next)
  }

  const disabled = loading || !name.trim() || !phone.trim()

  if (loading) return null

  const ember = THEMES[0]

  return (
    <div
      style={{
        minHeight: '100vh',
        background: ember.bg,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 22px',
        fontFamily: 'Georgia, serif',
      }}
    >
      <div
        className="fade"
        style={{
          width: '100%',
          maxWidth: 360,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            color: C.cream,
            fontSize: 52,
            fontStyle: 'italic',
            letterSpacing: 0.5,
          }}
        >
          Sofra
        </div>
        <div
          style={{
            color: C.dim,
            fontSize: 15,
            marginTop: 6,
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          Dining, uninterrupted.
        </div>

        <div style={{ marginTop: 40, width: '100%', textAlign: 'left' }}>
          <label style={lblStyle} htmlFor="sofra-name">
            Your name
          </label>
          <input
            id="sofra-name"
            className="field"
            placeholder="First name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !disabled && handleSubmit()}
            autoFocus
          />

          <label style={lblStyle} htmlFor="sofra-phone">
            Phone number
          </label>
          <input
            id="sofra-phone"
            className="field"
            placeholder="(___) ___-____"
            value={phone}
            inputMode="tel"
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !disabled && handleSubmit()}
          />

          <button
            className="prim wide"
            disabled={disabled}
            onClick={handleSubmit}
            style={{ marginTop: 18 }}
          >
            Enter Sofra
          </button>

          {error && (
            <p
              style={{
                color: C.rose,
                fontSize: 13,
                textAlign: 'center',
                marginTop: 12,
                fontFamily: 'system-ui, sans-serif',
              }}
            >
              {error}
            </p>
          )}

          <p
            style={{
              color: '#5E5248',
              fontSize: 12,
              marginTop: 14,
              fontFamily: 'system-ui, sans-serif',
              lineHeight: 1.5,
              textAlign: 'center',
            }}
          >
            No passwords. Your name and number stay with your account.
          </p>

          <a
            href={`/name?next=${encodeURIComponent(next)}`}
            style={{
              display: 'block',
              color: C.faint,
              fontSize: 12,
              marginTop: 10,
              fontFamily: 'system-ui, sans-serif',
              textAlign: 'center',
              textDecoration: 'underline',
              textUnderlineOffset: 3,
            }}
          >
            Or continue with just your name
          </a>
        </div>
      </div>
    </div>
  )
}

const lblStyle: React.CSSProperties = {
  color: C.faint,
  fontSize: 12,
  letterSpacing: 1,
  fontWeight: 600,
  fontFamily: 'system-ui, sans-serif',
  display: 'block',
  margin: '18px 0 8px',
  textTransform: 'uppercase',
}
