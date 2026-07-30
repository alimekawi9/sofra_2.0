'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { C, THEMES, getTheme } from '@/lib/theme'

type EventRow = {
  id: string
  title: string
  event_date: string
  venue: string | null
  theme: string
  cover_url: string | null
}

type RsvpRow = {
  status: string
  events: EventRow
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function EventCard({ event, onNavigate }: { event: EventRow; onNavigate: (id: string) => void }) {
  const t = getTheme(event.theme)
  return (
    <button
      onClick={() => onNavigate(event.id)}
      className="logrow"
      aria-label={event.title}
      style={{ textAlign: 'left', padding: 12, marginBottom: 10 }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 14,
          overflow: 'hidden',
          background: event.cover_url ? '#000' : t.bg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
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
          <span style={{ fontSize: 22 }}>🍷</span>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: C.cream, fontSize: 16, fontFamily: 'Georgia, serif' }}>{event.title}</div>
        <div style={{ color: C.dim, fontSize: 12, marginTop: 3, fontFamily: 'system-ui, sans-serif' }}>
          <span>{formatDate(event.event_date)}</span>
          {event.venue && (
            <>
              <span> · </span>
              <span>{event.venue}</span>
            </>
          )}
        </div>
      </div>
    </button>
  )
}

export default function EventsPage() {
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [hosting, setHosting] = useState<EventRow[]>([])
  const [invited, setInvited] = useState<EventRow[]>([])

  async function loadData() {
    setLoading(true)
    setError('')
    const uid = localStorage.getItem('sofra_user_id')
    if (!uid) { router.push('/login'); return }

    try {
      const [{ data: hostEvents, error: e1 }, { data: rsvpRows, error: e2 }] = await Promise.all([
        supabase
          .from('events')
          .select('id,title,event_date,venue,theme,cover_url')
          .eq('host_id', uid),
        supabase
          .from('rsvps')
          .select('status, events(id,title,event_date,venue,theme,cover_url)')
          .eq('user_id', uid)
          .in('status', ['going', 'maybe']),
      ])

      if (e1 || e2) throw new Error('fetch failed')

      setHosting((hostEvents ?? []) as EventRow[])
      setInvited(((rsvpRows ?? []) as unknown as RsvpRow[]).map(r => r.events))
    } catch {
      setError("Couldn't load your events. Try again.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const isEmpty = !loading && !error && hosting.length === 0 && invited.length === 0

  function navigate(id: string) {
    router.push('/events/' + id)
  }

  const ember = THEMES[0]

  return (
    <>
      <style>{`@keyframes sofraPulse { 0%,100%{opacity:.4} 50%{opacity:.7} }`}</style>
      <div
        style={{
          minHeight: '100vh',
          background: ember.bg,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '52px 22px 120px',
          fontFamily: 'Georgia, serif',
        }}
      >
        <div className="fade" style={{ width: '100%', maxWidth: 392 }}>
          <h1
            style={{
              color: C.cream,
              fontSize: 42,
              fontStyle: 'italic',
              letterSpacing: 0.5,
              textAlign: 'center',
              margin: 0,
              fontWeight: 400,
            }}
          >
            Sofra
          </h1>
          <div
            style={{
              color: C.dim,
              fontSize: 14,
              textAlign: 'center',
              marginTop: 6,
              marginBottom: 28,
              fontFamily: 'system-ui, sans-serif',
            }}
          >
            Your table awaits.
          </div>

          {loading && (
            <div data-testid="skeleton">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  style={{
                    height: 88,
                    borderRadius: 18,
                    background: 'rgba(255,255,255,0.06)',
                    marginBottom: 10,
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
                  fontFamily: 'Georgia, serif',
                }}
              >
                Retry
              </button>
            </div>
          )}

          {isEmpty && (
            <div style={{ textAlign: 'center', paddingTop: 40 }}>
              <p style={{ color: C.cream, fontSize: 18, marginBottom: 4 }}>No events yet</p>
              <p
                style={{
                  color: C.dim,
                  fontSize: 14,
                  marginBottom: 24,
                  fontFamily: 'system-ui, sans-serif',
                }}
              >
                Host one, or wait for an invite.
              </p>
              <button
                className="prim wide"
                onClick={() => router.push('/host/new')}
                style={{ maxWidth: 260 }}
              >
                Host an event
              </button>
            </div>
          )}

          {!loading && !error && hosting.length > 0 && (
            <div style={{ marginBottom: 26 }}>
              <div style={sectionHead}>Hosting</div>
              {hosting.map((ev) => (
                <EventCard key={ev.id} event={ev} onNavigate={navigate} />
              ))}
            </div>
          )}

          {!loading && !error && invited.length > 0 && (
            <div>
              <div style={sectionHead}>Your invites</div>
              {invited.map((ev) => (
                <EventCard key={ev.id} event={ev} onNavigate={navigate} />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

const sectionHead: React.CSSProperties = {
  color: C.faint,
  fontSize: 12,
  letterSpacing: 1.5,
  fontWeight: 600,
  fontFamily: 'system-ui, sans-serif',
  textTransform: 'uppercase',
  margin: '6px 0 14px',
}
