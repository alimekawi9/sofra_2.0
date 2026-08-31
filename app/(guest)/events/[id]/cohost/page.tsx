'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { InviteLanding } from '@/components/sofra-v2/InviteLanding'
import { InviteCard, type InviteResponse } from '@/components/sofra-v2/InviteCard'
import '@/components/sofra-v2/sofra-v2.css'
import { formatEventDate, formatEventTime, isEventDateUndecided } from '@/lib/event-date'
import { eventEntryRole, loginDestination } from '@/lib/event-entry'

type EventRow = { id: string; title: string; tagline: string | null; event_date: string; venue: string | null; dress_code: string | null; host_id: string; chef_id: string | null; host: { id: string; name: string; photo_url: string | null } | null }

function formatDate(iso: string) {
  if (isEventDateUndecided(iso)) return 'Date undecided'
  return formatEventDate(iso, { weekday: 'long', month: 'long', day: 'numeric' })
}

function formatTime(iso: string) {
  if (isEventDateUndecided(iso)) return 'Time undecided'
  return formatEventTime(iso)
}

export default function CohostInvitePage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const search = useSearchParams()
  const supabase = createClient()
  const token = search.get('token') ?? ''
  const claimed = search.get('claim') === '1'
  const [event, setEvent] = useState<EventRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    async function load() {
      const currentPath = `/events/${params.id}/cohost?token=${encodeURIComponent(token)}${claimed ? '&claim=1' : ''}`
      const [{ data: ev }, { data: invite }] = await Promise.all([
        supabase.from('events').select('id,title,tagline,event_date,venue,dress_code,host_id,chef_id,host:users!events_host_id_fkey(id,name,photo_url)').eq('id', params.id).single(),
        supabase.from('event_cohost_invites').select('event_id,status').eq('token', token).eq('event_id', params.id).maybeSingle(),
      ])
      if (!ev) { setError("Couldn't load this invitation."); setLoading(false); return }
      if (!invite || invite.status !== 'pending') { setError('This co-host invitation is no longer available.'); setLoading(false); return }
      setEvent(ev as unknown as EventRow)

      // The co-host artwork is the public first step. Identity is requested
      // only after the recipient chooses to open the actual invitation.
      if (!claimed) { setLoading(false); return }

      const userId = localStorage.getItem('sofra_user_id')
      if (!userId) {
        router.replace(loginDestination(currentPath))
        return
      }
      const { data: membership } = await supabase
        .from('event_cohosts').select('user_id').eq('event_id', params.id).eq('user_id', userId).maybeSingle()
      const role = eventEntryRole({ eventId: params.id, userId, hostId: ev.host_id, chefId: ev.chef_id, isCohost: Boolean(membership), hasRsvp: false })
      if (role === 'host' || role === 'cohost') { router.replace(`/events/${params.id}`); return }
      if (role === 'chef') { router.replace(`/events/${params.id}/kitchen-setup?delegate=1`); return }
      setLoading(false)
    }
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function claim() {
    const path = `/events/${params.id}/cohost?token=${encodeURIComponent(token)}&claim=1`
    if (localStorage.getItem('sofra_user_id')) router.push(path)
    else router.replace(loginDestination(path))
  }

  async function respond(accept: boolean) {
    const uid = localStorage.getItem('sofra_user_id')
    if (!uid) { claim(); return }
    setSubmitting(true); setError('')
    const { data: saved, error: updateError } = await supabase.rpc('respond_to_cohost_invite', {
      p_token: token, p_user_id: uid, p_accept: accept,
    })
    setSubmitting(false)
    if (updateError || !saved) { setError('This co-host invitation could not be accepted. It may already have been used.'); return }
    router.push(accept ? `/events/${params.id}` : '/events')
  }

  if (loading) return null
  if (error && !event) return <main className="sv2-root sv2-device-page sv2-app-page"><div className="sv2-device-shell sv2-app-shell"><p role="alert">{error}</p></div></main>
  if (event && !claimed) return <InviteLanding eventId={params.id} title={event.title} onClaimSeat={claim} kicker="You are invited to co-host!" buttonLabel="See the co-host invitation" />

  function onRespond(response: InviteResponse) { void respond(response === 'going') }

  return <InviteCard
    mode="cohost"
    loading={false}
    error={error}
    onRetry={() => window.location.reload()}
    title={event?.title ?? ''}
    note={event?.tagline ?? null}
    hostName={event?.host?.name ?? null}
    hostId={event?.host?.id ?? null}
    hostPhotoUrl={event?.host?.photo_url ?? null}
    dateLabel={event ? formatDate(event.event_date) : ''}
    timeLabel={event ? formatTime(event.event_date) : ''}
    venue={event?.venue ?? 'Venue pending'}
    dressCode={event?.dress_code ?? null}
    unlocked={false}
    guests={[]}
    submitting={submitting}
    onRespond={onRespond}
  />
}
