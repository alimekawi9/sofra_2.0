'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Step       = 'status' | 'profile'
type RsvpStatus = 'going' | 'maybe' | 'cant'

const DIETARY = ['Vegetarian','Vegan','Halal','Kosher','Gluten-free','No dairy','Pescatarian']
const NOGOS   = ['Nuts','Shellfish','Pork','Eggs','Cilantro','Mushrooms']
const DRINKS  = ['Cocktails','Wine','Beer','Alcohol-free']

const C = {
  ink:         '#140E10',
  ink2:        '#1E1518',
  burgundy:    '#5C1A1B',
  burgundyLit: '#7A2324',
  cream:       '#F3E9DD',
  dim:         '#B7A493',
  faint:       '#7C6B5F',
  gold:        '#D9A15B',
  rose:        '#C97B6E',
}

export default function RSVPPage({ params }: { params: { id: string } }) {
  const router   = useRouter()
  const supabase = createClient()
  const uidRef   = useRef<string | null>(null)

  const [loading,          setLoading]          = useState(true)
  const [step,             setStep]             = useState<Step>('status')
  const [status,           setStatus]           = useState<RsvpStatus | null>(null)
  const [dietary,          setDietary]          = useState<string[]>([])
  const [avoid,            setAvoid]            = useState<string[]>([])
  const [drinks,           setDrinks]           = useState<string[]>([])
  const [adventurousness,  setAdventurousness]  = useState(50)
  const [prefilled,        setPrefilled]        = useState(false)
  const [hasExistingRsvp,  setHasExistingRsvp]  = useState(false)
  const [submitting,       setSubmitting]       = useState(false)
  const [error,            setError]            = useState('')

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      uidRef.current = user.id

      const [{ data: rsvpRow, error: e1 }, { data: profileRow, error: e2 }] = await Promise.all([
        supabase.from('rsvps')
          .select('status')
          .eq('event_id', params.id)
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase.from('taste_profiles')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle(),
      ])

      if (e1 || e2) throw new Error('fetch failed')

      if (rsvpRow?.status) setStatus(rsvpRow.status as RsvpStatus)
      setHasExistingRsvp(rsvpRow !== null)

      if (profileRow) {
        const p = profileRow as Record<string, unknown>
        setDietary((p.dietary as string[]) ?? [])
        setAvoid((p.avoid as string[])   ?? [])
        setDrinks((p.drinks as string[]) ?? [])
        setAdventurousness((p.adventurousness as number) ?? 50)
        setPrefilled(true)
      }
    } catch {
      setError("Couldn't load your RSVP. Try again.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Stubs — implemented in Task 7
  async function handleCantSubmit() {}
  async function handleProfileSubmit() {}

  return (
    <>
      <style>{`
        @keyframes skPulse { 0%,100%{opacity:.4} 50%{opacity:.7} }
        input[type=range] { appearance:none; width:100%; height:4px; border-radius:2px; outline:none; }
        input[type=range]::-webkit-slider-thumb { appearance:none; width:20px; height:20px; border-radius:50%; background:#D9A15B; cursor:pointer; }
        input[type=range]::-moz-range-thumb { width:20px; height:20px; border-radius:50%; background:#D9A15B; border:none; cursor:pointer; }
      `}</style>

      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #1B1214 0%, #241619 100%)',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '24px 20px',
      }}>
        {/* Radial glow */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(ellipse 80% 40% at 50% 0%, rgba(217,161,91,0.18) 0%, transparent 70%)',
        }} />

        {/* Back link */}
        <a
          href={'/events/' + params.id}
          style={{ color: C.dim, alignSelf: 'flex-start', textDecoration: 'none', fontSize: 14, position: 'relative', zIndex: 1 }}
        >← Events</a>

        {/* Wordmark */}
        <h1 style={{
          fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 52,
          color: C.cream, textAlign: 'center', margin: '12px 0 4px',
          position: 'relative', zIndex: 1,
        }}>Sofra</h1>

        {/* Content */}
        <div style={{ width: '100%', maxWidth: 360, position: 'relative', zIndex: 1 }}>

          {/* Skeleton */}
          {loading && (
            <div data-testid="skeleton">
              {[0,1,2].map(i => (
                <div key={i} style={{
                  height: 48, borderRadius: 999,
                  background: 'rgba(255,255,255,0.08)',
                  marginBottom: 12,
                  animation: 'skPulse 1.4s ease-in-out infinite',
                }} />
              ))}
              <div style={{
                height: 48, borderRadius: 12,
                background: 'rgba(255,255,255,0.06)',
                marginTop: 8,
                animation: 'skPulse 1.4s ease-in-out infinite',
              }} />
            </div>
          )}

          {/* Fetch error */}
          {!loading && error && step === 'status' && (
            <div style={{ textAlign: 'center', paddingTop: 40 }}>
              <p style={{ color: C.rose, fontSize: 14, marginBottom: 16 }}>{error}</p>
              <button
                onClick={loadData}
                style={{
                  background: 'none',
                  border: `1px solid ${C.dim}`,
                  borderRadius: 8,
                  color: C.dim,
                  padding: '8px 20px',
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >Retry</button>
            </div>
          )}

          {/* Step content — added in Tasks 4–7 */}
          {!loading && !error && (
            <div data-testid="rsvp-content" />
          )}

        </div>
      </div>
    </>
  )
}
