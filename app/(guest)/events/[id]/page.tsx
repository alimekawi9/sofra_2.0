'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { EventPaper, type EventPaperGuest } from '@/components/sofra-v2/EventPaper'
import '@/components/sofra-v2/sofra-v2.css'

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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function canonicalEventUrl(id: string): string {
  return new URL('/events/' + id, window.location.origin).toString()
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
  const [guests, setGuests] = useState<EventPaperGuest[]>([])
  const [unlocked, setUnlocked] = useState(false)
  const [isHost, setIsHost] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copyFallbackUrl, setCopyFallbackUrl] = useState('')
  const [photos, setPhotos] = useState<string[]>([])
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

  async function loadPhotos() {
    const { data } = await supabase.storage.from('event-photos').list(params.id, {
      sortBy: { column: 'created_at', order: 'desc' },
    })
    setPhotos(
      (data ?? []).map(
        (f) => supabase.storage.from('event-photos').getPublicUrl(params.id + '/' + f.name).data.publicUrl
      )
    )
  }

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      const stored = localStorage.getItem('sofra_user_id')
      if (!stored) {
        router.replace('/name?next=' + encodeURIComponent('/events/' + params.id))
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
              .map((g) => ({ id: g.users!.id, name: g.users!.name }))
          )
        }

        await loadPhotos()
      }
    } catch {
      setError("Couldn't load this event. Try again.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, []) // eslint-disable-line react-hooks/exhaustive-deps

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

  async function onPhotoUpload(file: File) {
    if (!uidRef.current) return
    setUploadingPhoto(true)
    const ext = file.name.includes('.') ? file.name.split('.').pop() : 'jpg'
    const path = `${params.id}/${Date.now()}-${uidRef.current}.${ext}`
    await supabase.storage.from('event-photos').upload(path, file, { contentType: file.type || undefined })
    await loadPhotos()
    setUploadingPhoto(false)
  }

  function shareViaWhatsApp() {
    if (!event) return
    const url = canonicalEventUrl(params.id)
    const message = `You're invited to ${event.title}! ${url}`
    window.open('https://wa.me/?text=' + encodeURIComponent(message), '_blank')
  }

  const isPast = event ? new Date(event.event_date).getTime() < Date.now() : false

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
      venue={event?.venue ?? '—'}
      address={event?.address ?? null}
      dressCode={event?.dress_code ?? null}
      coverUrl={event?.cover_url ?? null}
      unlocked={unlocked}
      guests={guests}
      myRsvpStatus={myRsvp}
      hasRsvpRow={hasRsvpRow}
      copied={copied}
      copyFallbackUrl={copyFallbackUrl}
      onCopyInviteLink={copyInviteLink}
      onShareWhatsApp={shareViaWhatsApp}
      onViewTable={() => router.push('/events/' + params.id + '/table')}
      onEditRsvp={() => router.push('/events/' + params.id + '/rsvp')}
      onRsvp={() => router.push('/events/' + params.id + '/rsvp')}
      onEditEvent={() => router.push('/host/' + params.id + '/edit')}
      photos={photos}
      uploadingPhoto={uploadingPhoto}
      onPhotoUpload={onPhotoUpload}
    />
  )
}
