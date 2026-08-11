'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { EventsBoard, type EventsBoardEvent, type EventsBoardStatus } from '@/components/sofra-v2/EventsBoard'
import '@/components/sofra-v2/sofra-v2.css'

type EventRow = {
  id: string
  title: string
  event_date: string
  venue: string | null
  theme: string
  cover_url: string | null
  is_published: boolean
}

type HostedRsvpRow = {
  status: string
  events: (EventRow & { host: { id: string; name: string; photo_url: string | null } | null }) | null
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export default function EventsPage() {
  const router = useRouter()
  const supabase = createClient()

  const [name, setName] = useState('You')
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [events, setEvents] = useState<EventsBoardEvent[]>([])

  async function loadData() {
    setLoading(true)
    setError('')
    const uid = localStorage.getItem('sofra_user_id')
    if (!uid) { router.push('/login'); return }

    try {
      const now = Date.now()
      const [{ data: user }, { data: hostEvents, error: e1 }, { data: rsvpRows, error: e2 }] = await Promise.all([
        supabase.from('users').select('name,photo_url').eq('id', uid).maybeSingle(),
        supabase.from('events').select('id,title,event_date,venue,theme,cover_url,is_published').eq('host_id', uid),
        supabase
          .from('rsvps')
          .select('status, events(id,title,event_date,venue,theme,cover_url,is_published,host:users!events_host_id_fkey(id,name,photo_url))')
          .eq('user_id', uid)
          .in('status', ['going', 'maybe']),
      ])

      if (e1 || e2) throw new Error('fetch failed')

      setName(user?.name || 'You')
      setPhotoUrl(user?.photo_url || null)
      setUserId(uid)

      const hosting: EventsBoardEvent[] = ((hostEvents ?? []) as EventRow[]).map((ev) => ({
        id: ev.id,
        status: 'hosting' as EventsBoardStatus,
        title: ev.title,
        host: null,
        venue: ev.venue ?? '',
        dateLabel: formatDate(ev.event_date),
        timeLabel: formatTime(ev.event_date),
        rsvpStatus: 'Hosting',
        theme: ev.theme,
        coverUrl: ev.cover_url,
        isDraft: ev.is_published === false,
      }))

      const hostingIds = new Set(hosting.map((ev) => ev.id))

      const invited: EventsBoardEvent[] = ((rsvpRows ?? []) as unknown as HostedRsvpRow[])
        .filter((r) => r.events !== null && r.events.is_published !== false && !hostingIds.has(r.events.id))
        .map((r) => {
          const ev = r.events!
          const past = new Date(ev.event_date).getTime() < now
          const status: EventsBoardStatus = past ? 'went' : r.status === 'maybe' ? 'invited' : 'going'
          const rsvpStatus = past ? 'Attended' : r.status === 'maybe' ? 'Awaiting your reply' : 'Going'
          return {
            id: ev.id,
            status,
            title: ev.title,
            host: ev.host?.name ?? null,
            hostId: ev.host?.id ?? null,
            hostPhotoUrl: ev.host?.photo_url ?? null,
            venue: ev.venue ?? '',
            dateLabel: formatDate(ev.event_date),
            timeLabel: formatTime(ev.event_date),
            rsvpStatus,
            theme: ev.theme,
            coverUrl: ev.cover_url,
          }
        })

      setEvents([...hosting, ...invited])
    } catch {
      setError("Couldn't load your events. Try again.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <EventsBoard
      name={name}
      userId={userId}
      photoUrl={photoUrl}
      events={events}
      loading={loading}
      error={error}
      onRetry={loadData}
      onHostEvent={() => router.push('/host/new')}
    />
  )
}
