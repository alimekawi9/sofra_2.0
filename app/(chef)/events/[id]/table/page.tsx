'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { buildIntel } from '@/lib/intel'
import type { TasteProfile, TableIntel } from '@/lib/intel'
import { C } from '@/lib/theme'
import ChefTabs from '@/components/ChefTabs'

type RsvpRow = { user_id: string; users: { name: string } | null }
type ProfileRow = {
  user_id: string
  dietary: string[]
  avoid: string[]
  drinks: string[]
  adventurousness: number
}

function mergeGuests(rsvps: RsvpRow[], profiles: ProfileRow[]): TasteProfile[] {
  return rsvps.map((r) => {
    const p = profiles.find((x) => x.user_id === r.user_id)
    return {
      name: r.users?.name ?? 'Unknown',
      dietary: p?.dietary ?? [],
      avoid: p?.avoid ?? [],
      drinks: p?.drinks ?? [],
      adventurousness: p?.adventurousness ?? 50,
    }
  })
}

export default function TablePage({ params }: { params: { id: string } }) {
  const { id } = params
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState('')
  const [intel, setIntel] = useState<TableIntel | null>(null)
  const [guests, setGuests] = useState<TasteProfile[]>([])
  const [eventTitle, setEventTitle] = useState('')
  const [eventDate, setEventDate] = useState('')

  async function loadAll() {
    setLoading(true)
    setFetchError('')
    try {
      const stored = localStorage.getItem('sofra_user_id')
      if (!stored) { router.push('/login'); return }

      const { data: ev, error: evErr } = await supabase
        .from('events')
        .select('host_id, title, event_date')
        .eq('id', id)
        .single()
      if (evErr || !ev) { router.replace(`/events/${id}`); return }
      if (stored !== ev.host_id) { router.replace(`/events/${id}`); return }
      setEventTitle(ev.title)
      setEventDate(ev.event_date)

      const { data: rsvps } = await supabase
        .from('rsvps')
        .select('user_id, users(name)')
        .eq('event_id', id)
        .in('status', ['going', 'maybe'])

      const userIds = ((rsvps ?? []) as unknown as RsvpRow[]).map((r) => r.user_id)

      const { data: profiles } = userIds.length
        ? await supabase.from('taste_profiles').select('*').in('user_id', userIds)
        : { data: [] as ProfileRow[] }

      const merged = mergeGuests(
        (rsvps ?? []) as unknown as RsvpRow[],
        (profiles ?? []) as ProfileRow[]
      )
      setGuests(merged)
      setIntel(buildIntel(merged))
    } catch {
      setFetchError("Couldn't load table intel. Try again.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadAll() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const dateSub = eventDate
    ? new Date(eventDate).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })
    : undefined

  return (
    <>
    <style>{`@keyframes sofraPulse { 0%,100%{opacity:.4} 50%{opacity:.7} }`}</style>
    <div
      style={{
        minHeight: '100vh',
        background: C.ink,
        fontFamily: 'Georgia, serif',
        paddingBottom: 120,
      }}
    >
      <div
        className="fade"
        style={{ maxWidth: 440, margin: '0 auto', padding: '22px 20px 32px' }}
      >
        <ChefTabs
          eventId={id}
          active="table"
          title={eventTitle}
          subtitle={
            dateSub
              ? `${dateSub}${intel ? ` · ${intel.guestCount} covers` : ''}`
              : undefined
          }
        />

        {loading && (
          <div
            data-testid="skeleton"
            style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
          >
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                style={{
                  height: 80,
                  borderRadius: 18,
                  background: 'rgba(255,255,255,0.08)',
                  animation: 'sofraPulse 1.4s ease-in-out infinite',
                }}
              />
            ))}
          </div>
        )}

        {!loading && fetchError && (
          <div style={{ textAlign: 'center', paddingTop: 40 }}>
            <p style={{ color: C.rose, fontSize: 14, marginBottom: 16 }}>{fetchError}</p>
            <button
              onClick={() => void loadAll()}
              style={{
                background: 'none',
                border: `1px solid ${C.dim}`,
                borderRadius: 10,
                color: C.dim,
                padding: '8px 20px',
                cursor: 'pointer',
                fontSize: 14,
                fontFamily: 'Georgia, serif',
              }}
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !fetchError && intel && (
          <>
            {/* Hard limits */}
            <div style={{ ...card, borderColor: 'rgba(224,119,107,0.35)' }}>
              <div style={cardHeadRow}>
                <span style={cardTitle}>Hard Limits — non-negotiable</span>
                <span
                  style={{
                    color: C.danger,
                    fontSize: 11,
                    letterSpacing: 1,
                    textTransform: 'uppercase',
                    fontFamily: 'system-ui, sans-serif',
                    fontWeight: 600,
                  }}
                >
                  must not violate
                </span>
              </div>
              <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 9 }}>
                {intel.hardLimits.length === 0 ? (
                  <div style={{ color: C.faint, fontSize: 14, fontFamily: 'system-ui, sans-serif' }}>
                    Open table — no hard limits.
                  </div>
                ) : (
                  intel.hardLimits.map((limit) => (
                    <div
                      key={`${limit.type}-${limit.label}`}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 12,
                      }}
                    >
                      <span
                        style={{
                          color: C.cream,
                          fontSize: 14,
                          fontFamily: 'system-ui, sans-serif',
                        }}
                      >
                        <span aria-hidden>⛔ </span>
                        <span>{limit.label}</span>
                      </span>
                      <span
                        style={{
                          color: C.dim,
                          fontSize: 12,
                          fontFamily: 'system-ui, sans-serif',
                          textAlign: 'right',
                        }}
                      >
                        {limit.guests.join(', ')}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Diet mix + drinks grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div style={card}>
                <div style={cardTitle}>Diet Mix</div>
                <div style={{ marginTop: 12 }}>
                  {intel.dietMix.length === 0 ? (
                    <div
                      style={{
                        color: C.faint,
                        fontSize: 13,
                        fontFamily: 'system-ui, sans-serif',
                      }}
                    >
                      No dietary preferences on record
                    </div>
                  ) : (
                    intel.dietMix.map((d) => (
                      <Bar
                        key={d.label}
                        label={d.label}
                        n={d.count}
                        total={intel.guestCount}
                        tint={C.gold}
                      />
                    ))
                  )}
                </div>
              </div>
              <div style={card}>
                <div style={cardTitle}>Drinks</div>
                <div style={{ marginTop: 12 }}>
                  {intel.drinksCounts.length === 0 ? (
                    <div
                      style={{
                        color: C.faint,
                        fontSize: 13,
                        fontFamily: 'system-ui, sans-serif',
                      }}
                    >
                      No drink preferences on record
                    </div>
                  ) : (
                    intel.drinksCounts.map((d) => (
                      <Bar
                        key={d.label}
                        label={d.label}
                        n={d.count}
                        total={intel.guestCount}
                        tint={C.rose}
                      />
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Adventurousness */}
            <div style={card}>
              <div style={cardHeadRow}>
                <span style={cardTitle}>Adventurousness</span>
                <span
                  style={{
                    color: C.gold,
                    fontSize: 13,
                    fontFamily: 'system-ui, sans-serif',
                  }}
                >
                  <span>{intel.avgAdventurousness} / 100</span>
                  <span> · </span>
                  <span>{intel.adventurousnessLabel}</span>
                </span>
              </div>
              <div
                style={{
                  position: 'relative',
                  height: 10,
                  background: 'rgba(255,255,255,0.06)',
                  borderRadius: 8,
                  marginTop: 16,
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: `${intel.avgAdventurousness}%`,
                    background: 'linear-gradient(90deg,#5C1A1B,#D9A15B)',
                    borderRadius: 8,
                    opacity: 0.5,
                  }}
                />
                {guests.map((g, i) => (
                  <div
                    key={i}
                    title={`${g.name}: ${g.adventurousness}`}
                    style={{
                      position: 'absolute',
                      top: -3,
                      left: `${g.adventurousness}%`,
                      width: 4,
                      height: 16,
                      background: C.cream,
                      borderRadius: 2,
                      transform: 'translateX(-50%)',
                      boxShadow: `0 0 0 2px ${C.panel}`,
                    }}
                  />
                ))}
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  color: C.faint,
                  fontSize: 11,
                  marginTop: 12,
                  fontFamily: 'system-ui, sans-serif',
                }}
              >
                <span>Keep it familiar</span>
                <span>Chef, surprise me</span>
              </div>
            </div>

            {/* Brief */}
            <div style={brief}>
              <span style={{ color: C.gold, fontSize: 15 }}>✦</span>
              <span>{intel.brief}</span>
            </div>
          </>
        )}
      </div>
    </div>
    </>
  )
}

function Bar({
  label,
  n,
  total,
  tint,
}: {
  label: string
  n: number
  total: number
  tint: string
}) {
  const pct = total === 0 ? 0 : Math.round((n / total) * 100)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 9 }}>
      <span
        style={{
          color: C.dim,
          fontSize: 12,
          width: 78,
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {label}
      </span>
      <div
        style={{
          flex: 1,
          height: 8,
          background: 'rgba(255,255,255,0.06)',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            borderRadius: 8,
            width: `${pct}%`,
            background: tint,
          }}
        />
      </div>
      <span
        style={{
          color: C.cream,
          fontSize: 12,
          width: 16,
          textAlign: 'right',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {n}
      </span>
    </div>
  )
}

const card: React.CSSProperties = {
  background: C.panel,
  border: `1px solid ${C.line}`,
  borderRadius: 18,
  padding: 18,
  marginBottom: 14,
}

const cardHeadRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  gap: 12,
}

const cardTitle: React.CSSProperties = {
  color: C.cream,
  fontSize: 17,
}

const brief: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  background: 'rgba(217,161,91,0.08)',
  border: '1px solid rgba(217,161,91,0.22)',
  borderRadius: 16,
  padding: '14px 16px',
  color: C.cream,
  fontSize: 14,
  lineHeight: 1.5,
  fontFamily: 'system-ui, sans-serif',
  marginTop: 4,
}
