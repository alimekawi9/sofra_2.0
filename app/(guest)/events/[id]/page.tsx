'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { C, getTheme } from '@/lib/theme'

type EventRow = {
  id: string
  host_id: string
  title: string
  tagline: string | null
  event_date: string
  venue: string | null
  address: string | null
  dress_code: string | null
  theme: string
  cover_url: string | null
}

type GuestRow = {
  status: string
  users: { id: string; name: string } | null
}

const TINTS = ['#7A2324', '#8A5A2B', '#4A5240', '#6E3B45', '#8A6A2B', '#3A4A5A', '#6A3A5A']

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

export default function EventDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const supabase = createClient()
  const uidRef = useRef<string | null>(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [event, setEvent] = useState<EventRow | null>(null)
  const [myRsvp, setMyRsvp] = useState<string | null>(null)
  const [hasRsvpRow, setHasRsvpRow] = useState(false)
  const [guests, setGuests] = useState<{ id: string; name: string; status: string }[]>([])
  const [unlocked, setUnlocked] = useState(false)
  const [isHost, setIsHost] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copyFallbackUrl, setCopyFallbackUrl] = useState('')

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      const stored = localStorage.getItem('sofra_user_id')
      if (!stored) {
        router.push('/login?next=' + encodeURIComponent('/events/' + params.id))
        return
      }
      uidRef.current = stored

      const [{ data: ev, error: e1 }, { data: rsvpRow, error: e2 }] = await Promise.all([
        supabase
          .from('events')
          .select('id,host_id,title,tagline,event_date,venue,address,dress_code,theme,cover_url')
          .eq('id', params.id)
          .single(),
        supabase
          .from('rsvps')
          .select('status')
          .eq('event_id', params.id)
          .eq('user_id', stored)
          .maybeSingle(),
      ])

      if (e1) throw new Error('event not found')
      if (e2) throw new Error('rsvp fetch failed')

      setEvent(ev as EventRow)

      const hostViewing = ev.host_id === stored
      const hasRsvp = rsvpRow !== null
      const isUnlocked = hostViewing || hasRsvp

      setHasRsvpRow(hasRsvp)
      setMyRsvp(rsvpRow?.status ?? null)
      setUnlocked(isUnlocked)
      setIsHost(hostViewing)

      if (isUnlocked) {
        const { data: guestRows, error: e3 } = await supabase
          .from('rsvps')
          .select('status, users(id, name)')
          .eq('event_id', params.id)
          .in('status', ['going', 'maybe'])

        if (!e3 && guestRows) {
          setGuests(
            (guestRows as unknown as GuestRow[])
              .filter((g) => g.users !== null)
              .map((g) => ({ id: g.users!.id, name: g.users!.name, status: g.status }))
          )
        }
      }
    } catch {
      setError("Couldn't load this event. Try again.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function copyInviteLink() {
    const url = window.location.href
    try {
      await navigator.clipboard.writeText(url)
      setCopyFallbackUrl('')
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopyFallbackUrl(url)
    }
  }

  function shareViaWhatsApp() {
    if (!event) return
    const url = window.location.href
    const message = `You're invited to ${event.title}! ${url}`
    window.open('https://wa.me/?text=' + encodeURIComponent(message), '_blank')
  }

  const theme = getTheme(event?.theme)
  const pageBg = event?.cover_url ? '#140E10' : theme.bg

  return (
    <>
      <style>{`@keyframes sofraPulse { 0%,100%{opacity:.4} 50%{opacity:.7} }`}</style>
      <div
        style={{
          minHeight: '100vh',
          background: pageBg,
          fontFamily: 'var(--font-display), Georgia, serif',
          paddingBottom: 120,
        }}
      >
        <div
          className="fade"
          style={{
            width: '100%',
            maxWidth: 392,
            margin: '0 auto',
            padding: '22px 22px 32px',
          }}
        >
          {/* Back */}
          <div style={{ marginBottom: 14 }}>
            <button
              onClick={() => router.push('/events')}
              className="ghosticon"
              aria-label="Back to events"
              style={{ marginLeft: -6 }}
            >
              ←
            </button>
          </div>

          {loading && (
            <div data-testid="skeleton">
              {[220, 40, 72, 200].map((h, i) => (
                <div
                  key={i}
                  style={{
                    height: h,
                    borderRadius: 20,
                    background: 'rgba(255,255,255,0.06)',
                    marginBottom: 16,
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

          {!loading && !error && event && (
            <div>
              {/* Cover */}
              <div
                style={{
                  height: 260,
                  borderRadius: 24,
                  overflow: 'hidden',
                  position: 'relative',
                  background: event.cover_url ? '#000' : theme.bg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {event.cover_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={event.cover_url}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <>
                    <div
                      style={{
                        position: 'absolute',
                        top: -60,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        width: 280,
                        height: 280,
                        background:
                          'radial-gradient(circle, rgba(255,255,255,0.16), transparent 65%)',
                      }}
                    />
                    <div
                      style={{
                        fontSize: 72,
                        filter: 'drop-shadow(0 8px 20px rgba(0,0,0,0.4))',
                      }}
                    >
                      🍷
                    </div>
                  </>
                )}
              </div>

              {/* Eyebrow */}
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: 2.5,
                  fontWeight: 600,
                  fontFamily: 'system-ui, sans-serif',
                  color: theme.accent,
                  marginTop: 20,
                  marginBottom: 10,
                }}
              >
                {isHost ? "YOU'RE HOSTING" : "YOU'RE INVITED"}
              </div>

              {/* Title */}
              <h1
                style={{
                  color: C.cream,
                  fontSize: 34,
                  lineHeight: 1.1,
                  margin: 0,
                  fontWeight: 400,
                  letterSpacing: -0.5,
                }}
              >
                {event.title}
              </h1>

              {event.tagline && (
                <p
                  style={{
                    color: C.dim,
                    fontSize: 16,
                    marginTop: 10,
                    fontStyle: 'italic',
                    lineHeight: 1.4,
                  }}
                >
                  {event.tagline}
                </p>
              )}

              {isHost && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <button onClick={copyInviteLink} style={hostBtnStyle}>
                      {copied ? 'Copied!' : 'Copy invite link'}
                    </button>
                    <button onClick={shareViaWhatsApp} style={hostBtnStyle}>
                      Share via WhatsApp
                    </button>
                    <button
                      onClick={() => router.push('/events/' + params.id + '/table')}
                      style={hostBtnStyle}
                    >
                      View Table
                    </button>
                  </div>
                  {copyFallbackUrl && (
                    <input
                      readOnly
                      value={copyFallbackUrl}
                      autoFocus
                      onFocus={(e) => e.target.select()}
                      style={{
                        display: 'block',
                        marginTop: 8,
                        width: '100%',
                        background: 'rgba(0,0,0,0.3)',
                        border: `1px solid ${C.dim}`,
                        borderRadius: 8,
                        color: C.cream,
                        fontSize: 12,
                        padding: '6px 10px',
                        boxSizing: 'border-box',
                      }}
                    />
                  )}
                </div>
              )}

              {/* Detail list */}
              <div style={{ margin: '20px 0' }}>
                <Detail k="When" v={formatDate(event.event_date)} />
                <Detail
                  k="Where"
                  v={event.venue ?? '—'}
                  sub={
                    unlocked && event.address
                      ? event.address
                      : !unlocked
                      ? 'RSVP to see the address'
                      : undefined
                  }
                  locked={!unlocked}
                />
                {event.dress_code && (
                  <Detail k="Dress code" v={event.dress_code} accent={theme.accent} />
                )}
              </div>

              {/* Guest list card */}
              <div style={cardStyle}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 14,
                  }}
                >
                  <span style={{ color: C.cream, fontSize: 18 }}>
                    {unlocked ? `${guests.length} going` : 'The table'}
                  </span>
                  {!unlocked && (
                    <span
                      style={{
                        color: C.dim,
                        fontSize: 12,
                        fontFamily: 'system-ui, sans-serif',
                      }}
                    >
                      🔒 RSVP to see who
                    </span>
                  )}
                </div>

                {unlocked ? (
                  guests.length > 0 ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                      {guests.map((g, i) => (
                        <Ava key={g.id} name={g.name} tint={TINTS[i % TINTS.length]} />
                      ))}
                    </div>
                  ) : (
                    <div
                      style={{
                        color: C.dim,
                        fontSize: 13,
                        fontFamily: 'system-ui, sans-serif',
                      }}
                    >
                      No one’s replied yet.
                    </div>
                  )
                ) : (
                  <div style={{ position: 'relative' }}>
                    <div
                      style={{
                        display: 'flex',
                        gap: 10,
                        filter: 'blur(7px)',
                        opacity: 0.7,
                        pointerEvents: 'none',
                      }}
                    >
                      {TINTS.slice(0, 6).map((tint, i) => (
                        <div
                          key={i}
                          style={{
                            width: 46,
                            height: 46,
                            borderRadius: '50%',
                            background: tint,
                          }}
                        />
                      ))}
                    </div>
                    <div
                      style={{
                        color: C.dim,
                        fontSize: 13,
                        textAlign: 'center',
                        marginTop: 14,
                        fontFamily: 'system-ui, sans-serif',
                      }}
                    >
                      The table’s filling up. Reply to meet them.
                    </div>
                  </div>
                )}
              </div>

              {/* RSVP CTA / status */}
              {unlocked && hasRsvpRow ? (
                <div style={{ ...cardStyle, borderColor: 'rgba(217,161,91,0.25)' }}>
                  <div style={{ color: C.cream, fontSize: 18 }}>
                    Your RSVP:{' '}
                    <span style={{ color: theme.accent }}>
                      {myRsvp === 'going'
                        ? 'Going ✦'
                        : myRsvp === 'maybe'
                        ? 'Maybe ◈'
                        : "Can't make it ✕"}
                    </span>
                  </div>
                  <button
                    onClick={() => router.push('/events/' + params.id + '/rsvp')}
                    style={{
                      marginTop: 10,
                      background: 'none',
                      border: '1px solid rgba(243,233,221,0.2)',
                      borderRadius: 12,
                      color: C.dim,
                      padding: '8px 16px',
                      fontSize: 14,
                      cursor: 'pointer',
                      fontFamily: 'var(--font-display), Georgia, serif',
                    }}
                  >
                    Edit RSVP →
                  </button>
                </div>
              ) : !unlocked ? (
                <div style={{ marginTop: 8 }}>
                  <div
                    style={{
                      color: C.cream,
                      fontSize: 20,
                      textAlign: 'center',
                      marginBottom: 14,
                    }}
                  >
                    Will you be at the table?
                  </div>
                  <button
                    className="prim wide"
                    onClick={() => router.push('/events/' + params.id + '/rsvp')}
                  >
                    RSVP
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

const cardStyle: React.CSSProperties = {
  background: 'rgba(0,0,0,0.24)',
  border: '1px solid rgba(243,233,221,0.1)',
  borderRadius: 22,
  padding: 18,
  marginBottom: 16,
  backdropFilter: 'blur(4px)',
  WebkitBackdropFilter: 'blur(4px)',
}

const hostBtnStyle: React.CSSProperties = {
  background: 'none',
  border: `1px solid ${C.gold}`,
  borderRadius: 12,
  color: C.gold,
  padding: '7px 14px',
  fontSize: 13,
  cursor: 'pointer',
  fontFamily: 'system-ui, sans-serif',
}

function Detail({
  k,
  v,
  sub,
  locked,
  accent,
}: {
  k: string
  v: string
  sub?: string
  locked?: boolean
  accent?: string
}) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 14,
        padding: '12px 0',
        borderBottom: '1px solid rgba(243,233,221,0.08)',
      }}
    >
      <div>
        <div
          style={{
            color: C.faint,
            fontSize: 11,
            letterSpacing: 1,
            fontWeight: 600,
            fontFamily: 'system-ui, sans-serif',
            textTransform: 'uppercase',
          }}
        >
          {k}
        </div>
        <div
          style={{
            color: accent || C.cream,
            fontSize: 15,
            marginTop: 3,
            fontFamily: 'system-ui, sans-serif',
            lineHeight: 1.4,
          }}
        >
          {v}
        </div>
        {sub && (
          <div
            style={{
              color: locked ? C.faint : C.dim,
              fontSize: 13,
              marginTop: 3,
              fontFamily: 'system-ui, sans-serif',
            }}
          >
            {locked && '🔒 '}
            {sub}
          </div>
        )}
      </div>
    </div>
  )
}

function Ava({ name, tint }: { name: string; tint: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div
        style={{
          width: 46,
          height: 46,
          borderRadius: '50%',
          background: tint,
          color: C.cream,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 17,
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.14)',
        }}
      >
        {name.charAt(0).toUpperCase()}
      </div>
      <div
        style={{
          color: C.dim,
          fontSize: 11,
          marginTop: 5,
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {name}
      </div>
    </div>
  )
}
