'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { C, THEMES, DIETARY, NOGOS, FLAVORS } from '@/lib/theme'
import {
  PROTEIN_PREFERENCE_OPTIONS,
  normalizeProteinPreferences,
  updateProteinPreferenceSelection,
  type ProteinPreference,
} from '@/lib/protein-preferences'
import {
  normalizeFlavorPreferencesForSubmission,
  updateFlavorPreferenceSelection,
  type FlavorPreference,
} from '@/lib/flavor-preferences'

type Step = 'status' | 'profile'
type RsvpStatus = 'going' | 'maybe' | 'cant'

export default function RSVPPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const supabase = createClient()
  const uidRef = useRef<string | null>(null)
  const proteinPreferencesRef = useRef<ProteinPreference[]>([])
  const proteinPreferencesDirtyRef = useRef(false)
  const flavorsRef = useRef<string[]>([])

  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState<Step>('status')
  const [status, setStatus] = useState<RsvpStatus | null>(null)
  const [dietary, setDietary] = useState<string[]>([])
  const [avoid, setAvoid] = useState<string[]>([])
  const [proteinPreferences, setProteinPreferences] = useState<ProteinPreference[]>([])
  const [proteinHint, setProteinHint] = useState(false)
  const [flavors, setFlavors] = useState<string[]>([])
  const [flavorHint, setFlavorHint] = useState(false)
  const [adventurousness, setAdventurousness] = useState(50)
  const [prefilled, setPrefilled] = useState(false)
  const [hasExistingRsvp, setHasExistingRsvp] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      const stored = localStorage.getItem('sofra_user_id')
      if (!stored) {
        router.push('/login?next=' + encodeURIComponent('/events/' + params.id + '/rsvp'))
        return
      }
      uidRef.current = stored

      const [{ data: rsvpRow, error: e1 }, { data: profileRow, error: e2 }] = await Promise.all([
        supabase.from('rsvps')
          .select('status')
          .eq('event_id', params.id)
          .eq('user_id', stored)
          .maybeSingle(),
        supabase.from('taste_profiles')
          .select('*')
          .eq('user_id', stored)
          .maybeSingle(),
      ])

      if (e1 || e2) throw new Error('fetch failed')

      if (rsvpRow?.status) setStatus(rsvpRow.status as RsvpStatus)
      setHasExistingRsvp(rsvpRow !== null)

      if (profileRow) {
        const p = profileRow as Record<string, unknown>
        setDietary((p.dietary as string[]) ?? [])
        setAvoid((p.avoid as string[]) ?? [])
        if (!proteinPreferencesDirtyRef.current) {
          const hydratedPreferences = normalizeProteinPreferences(
            p.protein_preferences as string[] | null | undefined,
            p.protein_anchor as string | null | undefined
          )
          proteinPreferencesRef.current = hydratedPreferences
          setProteinPreferences(hydratedPreferences)
        }
        const hydratedFlavors = Array.isArray(p.flavor_preference)
          ? p.flavor_preference.filter((value): value is string => typeof value === 'string')
          : []
        flavorsRef.current = hydratedFlavors
        setFlavors(hydratedFlavors)
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

  async function handleCantSubmit() {
    if (!uidRef.current || submitting) return
    setSubmitting(true)
    setError('')
    const { error: upsertErr } = await supabase.from('rsvps').upsert(
      { event_id: params.id, user_id: uidRef.current, status: 'cant' },
      { onConflict: 'event_id,user_id' }
    )
    if (upsertErr) {
      setError('Something went wrong. Please try again.')
      setSubmitting(false)
      return
    }
    router.push('/events/' + params.id)
  }

  async function handleProfileSubmit() {
    if (!uidRef.current || submitting) return
    const proteinPreferencesForSubmit = [...proteinPreferencesRef.current]
    const flavorsForSubmit = normalizeFlavorPreferencesForSubmission(flavorsRef.current)
    if (process.env.NODE_ENV === 'development') {
      console.log('protein_preferences submit', proteinPreferencesForSubmit)
    }
    setSubmitting(true)
    setError('')
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase.from('rsvps').upsert(
        { event_id: params.id, user_id: uidRef.current, status },
        { onConflict: 'event_id,user_id' }
      ),
      supabase.from('taste_profiles').upsert(
        {
          user_id: uidRef.current,
          dietary,
          avoid,
          protein_preferences: proteinPreferencesForSubmit,
          flavor_preference: flavorsForSubmit,
          adventurousness,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      ),
    ])
    if (e1 || e2) {
      setError('Something went wrong. Please try again.')
      setSubmitting(false)
      return
    }
    router.push('/events/' + params.id)
  }

  function toggleChip(arr: string[], setArr: (v: string[]) => void, value: string) {
    setArr(arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value])
  }

  function toggleProtein(value: ProteinPreference) {
    const update = updateProteinPreferenceSelection(proteinPreferencesRef.current, value)
    if (update.blocked) {
      setProteinHint(true)
      setTimeout(() => setProteinHint(false), 2000)
      return
    }
    proteinPreferencesDirtyRef.current = true
    proteinPreferencesRef.current = update.preferences
    setProteinPreferences(update.preferences)
  }

  function toggleFlavor(value: FlavorPreference) {
    const update = updateFlavorPreferenceSelection(flavorsRef.current, value)
    setFlavorHint(update.blocked)
    if (update.blocked) return
    flavorsRef.current = update.preferences
    setFlavors(update.preferences)
  }

  const theme = THEMES[0]
  const accent = theme.accent

  const prog = step === 'status' ? 50 : 100

  const stepLabel =
    status === 'going' || status === 'maybe' ? 'Step 1 of 2' : 'Step 1'
  const primaryLabel = status === 'cant' ? 'Submit' : 'Continue →'
  const onPrimaryClick =
    status === 'cant'
      ? handleCantSubmit
      : status !== null
      ? () => setStep('profile')
      : undefined

  const adventLabel =
    adventurousness < 25
      ? 'Keep it familiar'
      : adventurousness < 55
      ? 'Open to a nudge'
      : adventurousness < 82
      ? 'Feed me something new'
      : 'Chef, surprise me'

  const chipClass = (on: boolean, danger?: boolean): React.CSSProperties => ({
    background: on ? (danger ? '#4A1E1E' : C.burgundy) : 'transparent',
    borderColor: on ? (danger ? C.rose : accent) : 'rgba(243,233,221,0.18)',
    color: on ? C.cream : C.dim,
  })

  return (
    <>
      <style>{`@keyframes sofraPulse { 0%,100%{opacity:.4} 50%{opacity:.7} }`}</style>
      <div
        style={{
          minHeight: '100vh',
          background: theme.bg,
          fontFamily: 'var(--font-display), Georgia, serif',
          paddingBottom: 120,
        }}
      >
        <div
          className="fade"
          style={{
            maxWidth: 392,
            margin: '0 auto',
            padding: '22px 22px 32px',
          }}
        >
          {/* Header — back / progress / close */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <button
              className="ghosticon"
              aria-label="Back to event"
              onClick={() =>
                step === 'status' ? router.push('/events/' + params.id) : setStep('status')
              }
            >
              ←
            </button>
            <div
              style={{
                flex: 1,
                height: 5,
                borderRadius: 5,
                background: 'rgba(255,255,255,0.1)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  borderRadius: 5,
                  width: `${prog}%`,
                  background: accent,
                  transition: 'width .3s',
                }}
              />
            </div>
            <button
              className="ghosticon"
              aria-label="Close"
              onClick={() => router.push('/events/' + params.id)}
            >
              ✕
            </button>
          </div>

          {loading && (
            <div data-testid="skeleton">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  style={{
                    height: 56,
                    borderRadius: 16,
                    background: 'rgba(255,255,255,0.08)',
                    marginBottom: 12,
                    animation: 'sofraPulse 1.4s ease-in-out infinite',
                  }}
                />
              ))}
            </div>
          )}

          {!loading && error && (
            <div style={{ textAlign: 'center', paddingTop: 40 }}>
              <p style={{ color: C.rose, fontSize: 14, marginBottom: 16 }}>{error}</p>
              <button
                onClick={loadData}
                style={{
                  background: 'none',
                  border: `1px solid ${C.dim}`,
                  borderRadius: 10,
                  color: C.dim,
                  padding: '8px 20px',
                  cursor: 'pointer',
                  fontSize: 14,
                  fontFamily: 'var(--font-display), Georgia, serif',
                }}
              >
                Retry
              </button>
            </div>
          )}

          {!loading && !error && (
            <div data-testid="rsvp-content">
              {step === 'status' && (
                <>
                  <p
                    style={{
                      color: C.dim,
                      fontSize: 13,
                      textAlign: 'center',
                      marginBottom: 16,
                      fontFamily: 'system-ui, sans-serif',
                    }}
                  >
                    {stepLabel}
                  </p>

                  <h2
                    style={{
                      color: C.cream,
                      fontSize: 29,
                      margin: 0,
                      fontWeight: 400,
                      letterSpacing: -0.4,
                      lineHeight: 1.15,
                    }}
                  >
                    Will you be at the table?
                  </h2>
                  <p
                    style={{
                      color: C.dim,
                      fontSize: 15,
                      marginTop: 10,
                      lineHeight: 1.5,
                      fontFamily: 'system-ui, sans-serif',
                    }}
                  >
                    Reply and we’ll seat you.
                  </p>

                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                      marginTop: 20,
                      marginBottom: 24,
                    }}
                  >
                    {([
                      { value: 'going' as RsvpStatus, label: '✦ Going' },
                      { value: 'maybe' as RsvpStatus, label: '◈ Maybe' },
                      { value: 'cant' as RsvpStatus, label: "✕ Can't make it" },
                    ]).map(({ value, label }) => {
                      const selected = status === value
                      return (
                        <button
                          key={value}
                          className={selected ? 'opt sel' : 'opt'}
                          onClick={() => setStatus(value)}
                          aria-pressed={selected}
                        >
                          {label}
                        </button>
                      )
                    })}
                  </div>

                  <button
                    className="prim wide"
                    onClick={onPrimaryClick}
                    disabled={status === null || submitting}
                  >
                    {primaryLabel}
                  </button>

                  {error && (
                    <p style={{ color: C.rose, fontSize: 13, textAlign: 'center', marginTop: 12 }}>
                      {error}
                    </p>
                  )}
                </>
              )}

              {step === 'profile' && (
                <div data-testid="step2">
                  <p
                    style={{
                      color: C.dim,
                      fontSize: 13,
                      textAlign: 'center',
                      marginBottom: 8,
                      fontFamily: 'system-ui, sans-serif',
                    }}
                  >
                    Step 2 of 2
                  </p>

                  <h2
                    style={{
                      color: C.cream,
                      fontSize: 29,
                      margin: 0,
                      fontWeight: 400,
                      letterSpacing: -0.4,
                      lineHeight: 1.15,
                    }}
                  >
                    How do you eat?
                  </h2>
                  <p
                    style={{
                      color: C.dim,
                      fontSize: 15,
                      marginTop: 10,
                      lineHeight: 1.5,
                      fontFamily: 'system-ui, sans-serif',
                    }}
                  >
                    Sofra keeps this so you never fill it out again.
                  </p>

                  {prefilled && (
                    <div
                      data-testid="prefilled-badge"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        background: 'rgba(217,161,91,0.12)',
                        border: '1px solid rgba(217,161,91,0.3)',
                        borderRadius: 999,
                        padding: '4px 12px',
                        marginTop: 14,
                        fontSize: 13,
                        color: C.gold,
                        fontFamily: 'system-ui, sans-serif',
                      }}
                    >
                      ✦ Pulled from your profile
                    </div>
                  )}

                  <SubLabel>Dietary</SubLabel>
                  <div style={chipWrap}>
                    {DIETARY.map((it) => (
                      <button
                        key={it}
                        className="chip"
                        aria-pressed={dietary.includes(it)}
                        onClick={() => toggleChip(dietary, setDietary, it)}
                        style={chipClass(dietary.includes(it))}
                      >
                        {it}
                      </button>
                    ))}
                  </div>

                  <SubLabel>Anything you avoid?</SubLabel>
                  <div style={chipWrap}>
                    {NOGOS.map((it) => (
                      <button
                        key={it}
                        className="chip"
                        aria-pressed={avoid.includes(it)}
                        onClick={() => toggleChip(avoid, setAvoid, it)}
                        style={chipClass(avoid.includes(it), true)}
                      >
                        {it}
                      </button>
                    ))}
                  </div>

                  <SubLabel>What sounds best tonight?</SubLabel>
                  <p style={{ color: C.faint, fontSize: 12, margin: '-5px 0 10px', fontFamily: 'system-ui, sans-serif' }}>
                    Choose up to two.
                  </p>
                  <div style={chipWrap}>
                    {PROTEIN_PREFERENCE_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        className="chip"
                        aria-pressed={proteinPreferences.includes(option.value)}
                        onClick={() => toggleProtein(option.value)}
                        style={chipClass(proteinPreferences.includes(option.value))}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  {proteinHint && (
                    <p data-testid="protein-hint" style={{ color: C.gold, fontSize: 12, marginTop: 6, fontFamily: 'system-ui, sans-serif' }}>
                      Choose up to two.
                    </p>
                  )}

                  <SubLabel>What flavours do you lean towards?</SubLabel>
                  {!flavorHint && (
                    <p style={{ color: C.faint, fontSize: 12, margin: '-5px 0 10px', fontFamily: 'system-ui, sans-serif' }}>
                      Choose up to three.
                    </p>
                  )}
                  <div style={chipWrap}>
                    {FLAVORS.map((it) => (
                      <button
                        key={it}
                        className="chip"
                        aria-pressed={flavors.includes(it)}
                        onClick={() => toggleFlavor(it)}
                        style={chipClass(flavors.includes(it))}
                      >
                        {it}
                      </button>
                    ))}
                  </div>
                  {flavorHint && (
                    <p data-testid="flavor-hint" style={{ color: C.gold, fontSize: 12, marginTop: 6, fontFamily: 'system-ui, sans-serif' }}>
                      Choose up to three.
                    </p>
                  )}

                  <SubLabel>How brave is your palate?</SubLabel>
                  <div
                    style={{
                      background: 'rgba(0,0,0,0.24)',
                      border: '1px solid rgba(243,233,221,0.1)',
                      borderRadius: 20,
                      padding: '22px 18px',
                    }}
                  >
                    <div
                      style={{
                        color: C.cream,
                        fontSize: 20,
                        textAlign: 'center',
                        marginBottom: 20,
                        fontStyle: 'italic',
                      }}
                    >
                      {adventLabel}
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={adventurousness}
                      onChange={(e) => setAdventurousness(Number(e.target.value))}
                      aria-label="Adventurousness"
                      className="slider"
                      style={{
                        background: `linear-gradient(90deg, ${accent} ${adventurousness}%, rgba(255,255,255,0.08) ${adventurousness}%)`,
                      }}
                    />
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        color: C.faint,
                        fontSize: 12,
                        marginTop: 13,
                        fontFamily: 'system-ui, sans-serif',
                      }}
                    >
                      <span>The usual</span>
                      <span>Anything once</span>
                    </div>
                  </div>

                  <button
                    className="prim wide"
                    style={{ marginTop: 22 }}
                    onClick={handleProfileSubmit}
                    disabled={submitting}
                  >
                    {hasExistingRsvp ? 'Update RSVP →' : 'RSVP →'}
                  </button>

                  {error && (
                    <p style={{ color: C.rose, fontSize: 13, textAlign: 'center', marginTop: 12 }}>
                      {error}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

const chipWrap: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 9,
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        color: C.dim,
        fontSize: 14,
        margin: '22px 0 11px',
        letterSpacing: 0.3,
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {children}
    </div>
  )
}
