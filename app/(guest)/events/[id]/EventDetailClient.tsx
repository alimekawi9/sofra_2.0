'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { EventPaper, type EventPaperGuest } from '@/components/sofra-v2/EventPaper'
import type { UploadProgressState } from '@/components/sofra-v2/PhotoUploadProgress'
import { fetchAlbumPhotos, uploadPhotoBatch, type AlbumPhoto } from '@/lib/shared-album'
import { forgetPendingInvite, rememberPendingInvite } from '@/lib/pending-invites'
import '@/components/sofra-v2/sofra-v2.css'
import { formatEventDate, formatEventTime, isEventDateUndecided } from '@/lib/event-date'
import { isCanonical, isCanonicalQuestionCustomized, isCustom, sortedQuestions, type QuestionnaireConfig } from '@/lib/questionnaire'
import { countUnreadEventMessages, fetchEventMessages, markEventChatRead, type EventChatMessage } from '@/lib/event-chat'
import type { CustomDetailSection } from '@/lib/event-custom-details'
import { canAccessEventUpdate, eventEntryDestination, loginDestination } from '@/lib/event-entry'
import { listPendingEventAccessRequests, respondToEventAccessRequest, type PendingEventAccessRequest } from '@/lib/event-access-requests'

type EventRow = {
  id: string
  host_id: string
  chef_id: string | null
  title: string
  tagline: string | null
  event_date: string
  venue: string | null
  address: string | null
  dress_code: string | null
  custom_details: CustomDetailSection[]
  theme: string
  cover_url: string | null
  is_published: boolean
  kitchen_status: 'pending' | 'complete'
  kitchen_plan: 'now' | 'later' | 'chef' | null
}

type GuestRow = {
  status: string
  users: { id: string; name: string; photo_url: string | null } | null
}

type CohostGuestRow = {
  users: { id: string; name: string; photo_url: string | null } | null
}

function formatDate(iso: string): string {
  if (isEventDateUndecided(iso)) return 'Date undecided'
  return formatEventDate(iso, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatTime(iso: string): string {
  if (isEventDateUndecided(iso)) return 'Time undecided'
  return formatEventTime(iso)
}

function canonicalEventUrl(id: string): string {
  return new URL('/events/' + id, window.location.origin).toString()
}

export default function EventDetailClient({ params }: { params: { id: string } }) {
  const router = useRouter()
  const supabase = createClient()
  const uidRef = useRef<string | null>(null)
  const redirectingRef = useRef(false)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [event, setEvent] = useState<EventRow | null>(null)
  const [myRsvp, setMyRsvp] = useState<string | null>(null)
  const [hasRsvpRow, setHasRsvpRow] = useState(false)
  const [guests, setGuests] = useState<EventPaperGuest[]>([])
  const [unlocked, setUnlocked] = useState(false)
  const [isHost, setIsHost] = useState(false)
  const [hostNeedsPreferences, setHostNeedsPreferences] = useState(false)
  const [hostNeedsKitchen, setHostNeedsKitchen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copyFallbackUrl, setCopyFallbackUrl] = useState('')
  const [canInviteCohost, setCanInviteCohost] = useState(false)
  const [cohostSharing, setCohostSharing] = useState(false)
  const [cohostToken, setCohostToken] = useState('')
  const [cohostCopied, setCohostCopied] = useState(false)
  const [cohostShareError, setCohostShareError] = useState('')
  const [photos, setPhotos] = useState<AlbumPhoto[]>([])
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [photoError, setPhotoError] = useState('')
  const [uploadProgress, setUploadProgress] = useState<UploadProgressState | null>(null)
  const [removingGuestId, setRemovingGuestId] = useState<string | null>(null)
  const [removeGuestError, setRemoveGuestError] = useState('')
  const [messages, setMessages] = useState<EventChatMessage[]>([])
  const [chatLoading, setChatLoading] = useState(false)
  const [chatError, setChatError] = useState('')
  const [unreadMessages, setUnreadMessages] = useState(0)
  const [accessRequests, setAccessRequests] = useState<PendingEventAccessRequest[]>([])
  const [respondingToAccessRequest, setRespondingToAccessRequest] = useState<string | null>(null)
  const [accessRequestError, setAccessRequestError] = useState('')

  async function loadPhotos() {
    const { photos: loaded, error: photosError } = await fetchAlbumPhotos(supabase, params.id)
    if (photosError) {
      console.error('Shared album fetch failed', { eventId: params.id, message: photosError })
      setPhotoError('Could not refresh the album. Try again.')
      return false
    }
    setPhotos(loaded)
    setPhotoError('')
    return true
  }

  async function loadMessages() {
    setChatLoading(true)
    const { messages: loaded, error: messagesError } = await fetchEventMessages(supabase, params.id)
    setChatLoading(false)
    if (messagesError) {
      console.error('Event chat fetch failed', { eventId: params.id, message: messagesError })
      setChatError('Could not refresh the chat.')
      return false
    }
    setMessages(loaded)
    if (uidRef.current) setUnreadMessages(countUnreadEventMessages(loaded, params.id, uidRef.current, localStorage))
    setChatError('')
    return true
  }

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      const stored = localStorage.getItem('sofra_user_id')
      const updateEntry = new URLSearchParams(window.location.search).get('entry') === 'update'
      if (!stored) {
        redirectingRef.current = true
        router.replace(loginDestination(`/events/${params.id}${updateEntry ? '?entry=update' : ''}`))
        return
      }
      uidRef.current = stored

      const [{ data: ev, error: e1 }, { data: rsvpRow, error: e2 }, { data: tasteProfile }] = await Promise.all([
        supabase
          .from('events')
          .select('id,host_id,chef_id,title,tagline,event_date,venue,address,dress_code,custom_details,theme,cover_url,is_published,kitchen_status,kitchen_plan')
          .eq('id', params.id)
          .maybeSingle(),
        supabase
          .from('rsvps')
          .select('status')
          .eq('event_id', params.id)
          .eq('user_id', stored)
          .maybeSingle(),
        supabase
          .from('taste_profiles')
          .select('user_id')
          .eq('user_id', stored)
          .maybeSingle(),
      ])

      if (e1) throw new Error(e1.message)
      if (!ev) {
        forgetPendingInvite(params.id)
        redirectingRef.current = true
        router.replace('/events')
        return
      }
      if (e2) {
        console.error('Event RSVP lookup failed', { eventId: params.id, code: e2.code, message: e2.message })
        throw new Error('rsvp lookup failed')
      }

      const { data: cohostRow } = ev.host_id === stored ? { data: null } : await supabase
        .from('event_cohosts').select('user_id').eq('event_id', params.id).eq('user_id', stored).maybeSingle()
      const hostViewing = ev.host_id === stored || Boolean(cohostRow)
      const safeRsvpRow = rsvpRow
      const hasRsvp = safeRsvpRow !== null
      if (hasRsvp) forgetPendingInvite(params.id)
      const entryContext = {
        eventId: params.id,
        userId: stored,
        hostId: ev.host_id,
        chefId: ev.chef_id,
        isCohost: Boolean(cohostRow),
        hasRsvp,
      }
      setEvent(ev as EventRow)
      if (updateEntry && !canAccessEventUpdate(entryContext)) {
        redirectingRef.current = true
        router.replace(`/events/${params.id}/request-access`)
        return
      }
      const destination = eventEntryDestination(entryContext)
      if (destination) {
        if (!hostViewing && !hasRsvp && ev.chef_id !== stored) rememberPendingInvite(ev as EventRow)
        redirectingRef.current = true
        router.replace(destination)
        return
      }

      const isUnlocked = hostViewing || hasRsvp

      setHasRsvpRow(hasRsvp)
      setMyRsvp(safeRsvpRow?.status ?? null)
      setUnlocked(isUnlocked)
      setIsHost(hostViewing)
      // Co-hosts get the same management powers as the original host, with
      // the one deliberate exception of deleting the event (see the host
      // edit page's canDelete, which stays host_id-only).
      setCanInviteCohost(hostViewing)
      let needsHostPreferences = hostViewing && !tasteProfile
      if (hostViewing && tasteProfile) {
        try {
          const [{ data: questionnaireRow }, { data: answerRows }] = await Promise.all([
            supabase.from('event_questionnaires').select('config').eq('event_id', params.id).maybeSingle(),
            supabase.from('event_question_responses').select('question_id').eq('event_id', params.id).eq('user_id', stored),
          ])
          const config = questionnaireRow?.config as QuestionnaireConfig | undefined
          if (config?.questions) {
            const answered = new Set((answerRows ?? []).map((row: { question_id: string }) => row.question_id))
            needsHostPreferences = sortedQuestions(config).some(question =>
              isCanonical(question) ? isCanonicalQuestionCustomized(question) : isCustom(question) && !answered.has(question.id)
            )
          }
        } catch {
          // Keep the taste-profile fallback when optional questionnaire tables fail.
        }
      }
      setHostNeedsPreferences(needsHostPreferences)
      setHostNeedsKitchen(hostViewing && ev.kitchen_status === 'pending' && ev.kitchen_plan === 'later')

      if (hostViewing) {
        const { requests, error: pendingError } = await listPendingEventAccessRequests(supabase, params.id, stored)
        if (pendingError) {
          setAccessRequestError('Could not load access requests. Try again.')
        } else {
          setAccessRequests(requests)
          setAccessRequestError('')
        }
      }

      if (isUnlocked) {
        const { data: guestRows, error: e3 } = await supabase
          .from('rsvps')
          .select('status, users(id, name, photo_url)')
          .eq('event_id', params.id)
          .in('status', ['going', 'maybe'])

        const { data: cohostRows } = await supabase
          .from('event_cohosts')
          .select('users(id,name,photo_url)')
          .eq('event_id', params.id)

        if (!e3) {
          const rsvpGuests = (guestRows ?? []) as unknown as GuestRow[]
          const acceptedCohosts = ((cohostRows ?? []) as unknown as CohostGuestRow[])
            .filter((row): row is { users: NonNullable<CohostGuestRow['users']> } => row.users !== null)
          const cohostIds = new Set(acceptedCohosts.map((row) => row.users.id))
          const roster = rsvpGuests
            .filter((g) => g.users !== null)
            .map((g) => ({
              id: g.users!.id,
              name: g.users!.name,
              photoUrl: g.users!.photo_url,
              // Co-host membership supersedes an older guest RSVP. Keep the
              // RSVP row as attendance/preference data, but present and
              // authorize the person as a host everywhere.
              isHost: g.users!.id === ev.host_id || cohostIds.has(g.users!.id),
            }))
          const knownIds = new Set(roster.map((guest) => guest.id))
          for (const row of acceptedCohosts) {
            if (knownIds.has(row.users.id)) continue
            roster.push({ id: row.users.id, name: row.users.name, photoUrl: row.users.photo_url, isHost: true })
            knownIds.add(row.users.id)
          }
          setGuests(roster)
        }

        await Promise.all([loadPhotos(), loadMessages()])
      }
    } catch (loadError) {
      const detail = loadError instanceof Error ? loadError.message : 'unknown error'
      console.error('Event detail load failed', {
        eventId: params.id,
        message: detail,
      })
      setError(process.env.NODE_ENV === 'development'
        ? `Couldn't load this event. ${detail}`
        : "Couldn't load this event. Try again.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!unlocked || typeof supabase.channel !== 'function') return
    const channel = supabase.channel(`event-chat:${params.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'event_messages', filter: `event_id=eq.${params.id}` }, () => {
        void loadMessages()
      })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [unlocked]) // eslint-disable-line react-hooks/exhaustive-deps

  async function copyInviteLink() {
    const url = canonicalEventUrl(params.id)
    try {
      await navigator.clipboard.writeText(url)
      setCopyFallbackUrl('')
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopyFallbackUrl(url)
    }
  }

  async function handleFilesConfirmed(files: File[], caption: string) {
    if (!uidRef.current || files.length === 0) return
    setUploadingPhoto(true)
    setPhotoError('')
    setUploadProgress({ status: 'uploading', completed: 0, total: files.length })

    const { succeeded, failed } = await uploadPhotoBatch(supabase, {
      eventId: params.id,
      userId: uidRef.current,
      files,
      caption,
      onProgress: (completed, total) => setUploadProgress({ status: 'uploading', completed, total }),
    })

    setUploadingPhoto(false)

    if (failed.length === 0) {
      setUploadProgress({ status: 'success', total: succeeded.length })
    } else if (succeeded.length > 0) {
      setUploadProgress({
        status: 'partial',
        succeeded: succeeded.length,
        total: files.length,
        failedNames: failed.map((f) => f.name),
      })
    } else {
      console.error('Shared album batch upload failed', { eventId: params.id, failed })
      setUploadProgress({ status: 'error', message: 'Could not upload those photos. Try again.' })
    }

    if (succeeded.length > 0) {
      setPhotos((current) => [...succeeded, ...current])
      router.push('/events/' + params.id + '/album')
    }
  }

  async function handleRemoveGuest(guestId: string) {
    if (!isHost) return
    setRemovingGuestId(guestId)
    setRemoveGuestError('')
    const { error: deleteErr } = await supabase
      .from('rsvps')
      .delete()
      .eq('event_id', params.id)
      .eq('user_id', guestId)
    setRemovingGuestId(null)
    if (deleteErr) {
      setRemoveGuestError('Could not remove that guest. Try again.')
      return
    }
    setGuests((current) => current.filter((guest) => guest.id !== guestId))
  }

  async function handleAccessRequest(requestId: string, accept: boolean) {
    if (!uidRef.current || !isHost) return
    setRespondingToAccessRequest(requestId)
    setAccessRequestError('')
    const result = await respondToEventAccessRequest(supabase, requestId, uidRef.current, accept)
    setRespondingToAccessRequest(null)
    if (!result.ok) {
      setAccessRequestError('Could not respond to that request. Refresh and try again.')
      return
    }
    setAccessRequests((current) => current.filter((request) => request.id !== requestId))
  }

  function shareViaWhatsApp() {
    if (!event) return
    const url = canonicalEventUrl(params.id)
    const message = `You're invited to ${event.title}! ${url}`
    window.open('https://wa.me/?text=' + encodeURIComponent(message), '_blank')
  }

  async function ensureCohostLink(): Promise<string | null> {
    if (cohostToken) return new URL(`/events/${params.id}/cohost?token=${cohostToken}`, window.location.origin).toString()
    setCohostShareError('')
    const { data, error: inviteError } = await supabase.from('event_cohost_invites')
      .insert({ event_id: params.id }).select('token').single()
    if (inviteError || !data?.token) {
      setCohostShareError('Could not create a co-host link. Try again.')
      return null
    }
    setCohostToken(data.token)
    return new URL(`/events/${params.id}/cohost?token=${data.token}`, window.location.origin).toString()
  }

  async function toggleCohostSharing() {
    const opening = !cohostSharing
    setCohostSharing(opening)
    if (opening) await ensureCohostLink()
  }

  async function copyCohostLink() {
    const url = await ensureCohostLink()
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCohostCopied(true)
      setTimeout(() => setCohostCopied(false), 2000)
    } catch { setCohostShareError('Could not copy the link. Try WhatsApp instead.') }
  }

  async function shareCohostWhatsApp() {
    const url = await ensureCohostLink()
    if (!url || !event) return
    window.open('https://wa.me/?text=' + encodeURIComponent(`Will you co-host ${event.title} with me? ${url}`), '_blank')
  }
  const isPast = event ? !isEventDateUndecided(event.event_date) && new Date(event.event_date).getTime() < Date.now() : false

  if (redirectingRef.current) return null

  return (
    <EventPaper
      loading={loading}
      error={error}
      onRetry={loadData}
      isHost={isHost}
      isPast={isPast}
      title={event?.title ?? ''}
      tagline={event?.tagline ?? null}
      dateLabel={event ? formatDate(event.event_date) : ''}
      timeLabel={event ? formatTime(event.event_date) : ''}
      venue={event?.venue ?? 'Venue pending'}
      address={event?.address ?? null}
      dressCode={event?.dress_code ?? null}
      customDetails={event?.custom_details ?? []}
      coverUrl={event?.cover_url ?? null}
      unlocked={unlocked}
      guests={guests}
      myRsvpStatus={myRsvp}
      hasRsvpRow={hasRsvpRow}
      copied={copied}
      copyFallbackUrl={copyFallbackUrl}
      onCopyInviteLink={copyInviteLink}
      onShareWhatsApp={shareViaWhatsApp}
      onSendUpdate={() => router.push('/events/' + params.id + '/update')}
      canInviteCohost={canInviteCohost}
      cohostSharing={cohostSharing}
      cohostCopied={cohostCopied}
      cohostShareError={cohostShareError}
      onToggleCohostSharing={toggleCohostSharing}
      onCopyCohostLink={copyCohostLink}
      onShareCohostWhatsApp={shareCohostWhatsApp}
      onViewTable={() => router.push('/events/' + params.id + '/table')}
      hostNeedsPreferences={hostNeedsPreferences}
      onAddHostPreferences={() => router.push('/events/' + params.id + '/rsvp?preferences=1')}
      hostNeedsKitchen={hostNeedsKitchen}
      onAddHostKitchen={() => router.push('/kitchen?from=' + params.id)}
      onEditRsvp={() => router.push('/events/' + params.id + '/rsvp?edit=1')}
      onRsvp={() => router.push('/events/' + params.id + '/rsvp')}
      onEditEvent={() => router.push('/host/' + params.id + '/edit')}
      onRemoveGuest={handleRemoveGuest}
      removingGuestId={removingGuestId}
      removeGuestError={removeGuestError}
      accessRequests={accessRequests}
      respondingToAccessRequest={respondingToAccessRequest}
      accessRequestError={accessRequestError}
      onRespondToAccessRequest={handleAccessRequest}
      photos={photos.map((photo) => ({ id: photo.id, url: photo.url }))}
      photoError={photoError}
      onRetryPhotos={loadPhotos}
      uploadingPhoto={uploadingPhoto}
      uploadProgress={uploadProgress}
      onDismissUploadProgress={() => setUploadProgress(null)}
      onFilesConfirmed={handleFilesConfirmed}
      onOpenAlbum={(photoId) =>
        router.push('/events/' + params.id + '/album' + (photoId ? '?photo=' + photoId : ''))
      }
      currentUserId={uidRef.current}
      messages={messages}
      unreadMessages={unreadMessages}
      chatLoading={chatLoading}
      chatError={chatError}
      onRetryChat={loadMessages}
      onOpenChat={() => {
        if (uidRef.current) markEventChatRead(localStorage, params.id, uidRef.current)
        setUnreadMessages(0)
        router.push('/events/' + params.id + '/chat')
      }}
    />
  )
}
