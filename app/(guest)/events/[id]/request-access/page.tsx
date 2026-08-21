'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { DEFAULT_EVENT_IMAGE_PATH } from '@/lib/event-images'
import { loginDestination } from '@/lib/event-entry'
import { getEventAccessRequestStatus, requestEventAccess, type EventAccessRequestStatus } from '@/lib/event-access-requests'
import { sv2Display, sv2Sans } from '@/components/sofra-v2/fonts'
import '@/components/sofra-v2/sofra-v2.css'

type EventRow = { id: string; host_id: string; chef_id: string | null; title: string; tagline: string | null; cover_url: string | null }

export default function RequestEventAccessPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const supabase = createClient()
  const uidRef = useRef<string | null>(null)
  const [event, setEvent] = useState<EventRow | null>(null)
  const [status, setStatus] = useState<EventAccessRequestStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      const stored = localStorage.getItem('sofra_user_id')
      if (!stored) {
        router.replace(loginDestination(`/events/${params.id}/request-access`))
        return
      }
      uidRef.current = stored
      const [{ data: ev, error: eventError }, { data: rsvp }, { data: cohost }, accessRequest] = await Promise.all([
        supabase.from('events').select('id,host_id,chef_id,title,tagline,cover_url').eq('id', params.id).maybeSingle(),
        supabase.from('rsvps').select('user_id').eq('event_id', params.id).eq('user_id', stored).maybeSingle(),
        supabase.from('event_cohosts').select('user_id').eq('event_id', params.id).eq('user_id', stored).maybeSingle(),
        getEventAccessRequestStatus(supabase, params.id, stored),
      ])
      if (eventError || accessRequest.error) throw new Error('event lookup failed')
      if (!ev) {
        router.replace('/events')
        return
      }
      setEvent(ev as EventRow)
      if (ev.host_id === stored || ev.chef_id === stored || cohost || rsvp) {
        router.replace(`/events/${params.id}`)
        return
      }
      const requestStatus = accessRequest.status ?? undefined
      if (requestStatus === 'accepted') {
        router.replace(`/events/${params.id}/rsvp`)
        return
      }
      setStatus(requestStatus ?? null)
    } catch {
      setError("Couldn't load this access request. Try again.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadData() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!uidRef.current || status !== 'pending') return
    const timer = window.setInterval(async () => {
      if (!uidRef.current) return
      const result = await getEventAccessRequestStatus(supabase, params.id, uidRef.current)
      if (result.status === 'accepted') router.replace(`/events/${params.id}/rsvp`)
      else if (result.status === 'rejected') setStatus('rejected')
    }, 10000)
    return () => window.clearInterval(timer)
  }, [status]) // eslint-disable-line react-hooks/exhaustive-deps

  async function submitRequest() {
    if (!uidRef.current || submitting) return
    setSubmitting(true)
    setError('')
    const result = await requestEventAccess(supabase, params.id, uidRef.current)
    setSubmitting(false)
    if (result.error || !result.status) {
      setError('Could not send your request. Try again.')
      return
    }
    if (result.status === 'member') router.replace(`/events/${params.id}`)
    else if (result.status === 'accepted') router.replace(`/events/${params.id}/rsvp`)
    else setStatus(result.status)
  }

  return (
    <div className={`sv2-root sv2-device-page sv2-app-page ${sv2Display.variable} ${sv2Sans.variable}`}>
      <main className="sv2-device-shell sv2-app-shell sv2-access-request-page">
        <Link className="sv2-back-link" href="/events">← Your Sofras</Link>
        {loading ? <p>Loading…</p> : event ? (
          <article className="sv2-access-request-card">
            {event.cover_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={event.cover_url} alt="" />
            ) : <Image src={DEFAULT_EVENT_IMAGE_PATH} width={1125} height={1401} alt="" />}
            <p>PRIVATE SOFRA</p>
            <h1>{event.title}</h1>
            {event.tagline && <p className="sv2-access-request-tagline">{event.tagline}</p>}
            {status === 'pending' ? (
              <div className="sv2-access-request-state"><strong>REQUEST SENT</strong><span>The host will be notified. You can return here once they respond.</span></div>
            ) : status === 'rejected' ? (
              <div className="sv2-access-request-state"><strong>ACCESS WAS NOT APPROVED</strong><span>You can ask the host again if this was a mistake.</span></div>
            ) : (
              <p className="sv2-access-request-explainer">You are not currently on this Sofra&rsquo;s guest or host list. Ask the host before viewing the private details.</p>
            )}
            {status !== 'pending' && (
              <button type="button" onClick={submitRequest} disabled={submitting}>
                {submitting ? 'SENDING…' : status === 'rejected' ? 'REQUEST ACCESS AGAIN' : 'REQUEST ACCESS'}
              </button>
            )}
            {error && <p role="alert" className="sv2-access-request-error">{error}</p>}
          </article>
        ) : <div className="sv2-access-request-state"><p role="alert">{error}</p><button type="button" onClick={loadData}>RETRY</button></div>}
      </main>
    </div>
  )
}
