'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const THEMES = [
  { id: 'ember',    bg: 'radial-gradient(120% 80% at 50% 0%, #7A2324 0%, #3A1416 45%, #140E10 100%)' },
  { id: 'olive',    bg: 'radial-gradient(120% 80% at 50% 0%, #5B6B4E 0%, #2E3826 50%, #14140E 100%)' },
  { id: 'midnight', bg: 'radial-gradient(120% 80% at 50% 0%, #26304A 0%, #161C2E 50%, #0C0E14 100%)' },
  { id: 'saffron',  bg: 'radial-gradient(120% 80% at 50% 0%, #B5701E 0%, #6E4212 50%, #17100A 100%)' },
  { id: 'plum',     bg: 'radial-gradient(120% 80% at 50% 0%, #4A2540 0%, #2A162A 50%, #120A12 100%)' },
]

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

function themeBg(theme: string): string {
  return THEMES.find(t => t.id === theme)?.bg ?? THEMES[0].bg
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function EventCard({ event, onNavigate }: { event: EventRow; onNavigate: (id: string) => void }) {
  return (
    <div
      onClick={() => onNavigate(event.id)}
      onKeyDown={e => e.key === 'Enter' && onNavigate(event.id)}
      role="button"
      tabIndex={0}
      aria-label={event.title}
      style={{ borderRadius: 16, overflow: 'hidden', cursor: 'pointer', marginBottom: 12 }}
    >
      <div style={{
        height: 160,
        background: event.cover_url ? '#000' : themeBg(event.theme),
        position: 'relative',
      }}>
        {event.cover_url && (
          <img
            src={event.cover_url}
            alt={event.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        )}
      </div>
      <div style={{ background: 'rgba(0,0,0,0.36)', padding: '12px 16px' }}>
        <p style={{
          color: C.cream, fontSize: 16,
          fontFamily: 'Georgia, serif', fontStyle: 'italic',
          margin: '0 0 4px',
        }}>
          {event.title}
        </p>
        <p style={{ color: C.dim, fontSize: 13, margin: '0 0 2px' }}>
          {formatDate(event.event_date)}
        </p>
        {event.venue && (
          <p style={{ color: C.faint, fontSize: 12, margin: 0 }}>{event.venue}</p>
        )}
      </div>
    </div>
  )
}

export default function EventsPage() {
  const router   = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
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

  return (
    <>
      <style>{`@keyframes skPulse { 0%,100%{opacity:.4} 50%{opacity:.7} }`}</style>
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #1B1214 0%, #241619 100%)',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '24px 20px',
      }}>
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(ellipse 80% 40% at 50% 0%, rgba(217,161,91,0.18) 0%, transparent 70%)',
        }} />

        <h1 style={{
          fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 52,
          color: C.cream, textAlign: 'center', margin: '12px 0 24px',
          position: 'relative', zIndex: 1,
        }}>Sofra</h1>

        <div style={{ width: '100%', maxWidth: 400, position: 'relative', zIndex: 1 }}>

          {loading && (
            <div data-testid="skeleton">
              {[0, 1, 2].map(i => (
                <div key={i} style={{
                  height: 180, borderRadius: 16,
                  background: 'rgba(255,255,255,0.08)',
                  marginBottom: 12,
                  animation: 'skPulse 1.4s ease-in-out infinite',
                }} />
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
                  borderRadius: 8,
                  color: C.dim,
                  padding: '8px 20px',
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >Retry</button>
            </div>
          )}

          {isEmpty && (
            <div style={{ textAlign: 'center', paddingTop: 60 }}>
              <p style={{ color: C.dim, fontSize: 16, marginBottom: 8 }}>No events yet</p>
              <p style={{ color: C.faint, fontSize: 14, marginBottom: 24 }}>
                Create your first dinner and invite your guests.
              </p>
              <button
                onClick={() => router.push('/host/new')}
                style={{
                  background: C.burgundy, color: C.cream, border: 'none',
                  borderRadius: 12, padding: '12px 24px', fontSize: 15,
                  cursor: 'pointer', boxShadow: '0 0 16px rgba(92,26,27,0.5)',
                }}
              >Host an event</button>
            </div>
          )}

          {!loading && !error && hosting.length > 0 && (
            <div style={{ marginBottom: 32 }}>
              <p style={{
                color: C.dim, fontSize: 12,
                letterSpacing: 1, textTransform: 'uppercase',
                margin: '0 0 12px',
              }}>Hosting</p>
              {hosting.map(ev => (
                <EventCard key={ev.id} event={ev} onNavigate={navigate} />
              ))}
            </div>
          )}

          {!loading && !error && invited.length > 0 && (
            <div>
              <p style={{
                color: C.dim, fontSize: 12,
                letterSpacing: 1, textTransform: 'uppercase',
                margin: '0 0 12px',
              }}>Your invites</p>
              {invited.map(ev => (
                <EventCard key={ev.id} event={ev} onNavigate={navigate} />
              ))}
            </div>
          )}

        </div>
      </div>
    </>
  )
}
