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

type EventPhotoRow = {
  id: string
  event_id: string
  uploaded_by: string
  storage_path: string
  created_at: string
}

type AlbumPhoto = EventPhotoRow & { url: string }

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
  const [photos, setPhotos] = useState<AlbumPhoto[]>([])
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [photoError, setPhotoError] = useState('')

  async function loadPhotos() {
    let data: unknown[] | null = null
    let photosError: { message: string } | null = null
    try {
      const result = await supabase
        .from('event_photos')
        .select('id,event_id,uploaded_by,storage_path,created_at')
        .eq('event_id', params.id)
        .order('created_at', { ascending: false })
      data = result.data
      photosError = result.error
    } catch (caught) {
      photosError = { message: caught instanceof Error ? caught.message : 'Unexpected request failure' }
    }

    if (photosError) {
      console.error('Shared album fetch failed', { eventId: params.id, message: photosError.message })
      setPhotoError('Could not refresh the album. Try again.')
      return false
    }

    const rows = (data ?? []) as EventPhotoRow[]
    setPhotos(rows.map((photo) => ({
      ...photo,
      url: supabase.storage.from('event-photos').getPublicUrl(photo.storage_path).data.publicUrl,
    })))
    setPhotoError('')
    return true
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
    setPhotoError('')
    const ext = file.name.includes('.') ? file.name.split('.').pop() : 'jpg'
    const path = `${params.id}/${Date.now()}-${uidRef.current}.${ext}`
    try {
      const { error: uploadError } = await supabase.storage
        .from('event-photos')
        .upload(path, file, { contentType: file.type || undefined })

      if (uploadError) {
        console.error('Shared album upload failed', { eventId: params.id, message: uploadError.message })
        setPhotoError('Could not upload that photo. Try again.')
        return
      }

      const { data: inserted, error: insertError } = await supabase
        .from('event_photos')
        .insert({ event_id: params.id, uploaded_by: uidRef.current, storage_path: path })
        .select('id,event_id,uploaded_by,storage_path,created_at')
        .single()

      if (insertError || !inserted) {
        console.error('Shared album record insert failed', {
          eventId: params.id,
          message: insertError?.message ?? 'No inserted row returned',
        })
        const { error: cleanupError } = await supabase.storage.from('event-photos').remove([path])
        if (cleanupError) {
          console.error('Shared album upload rollback failed', { eventId: params.id, message: cleanupError.message })
        }
        setPhotoError('Could not save that photo. Try again.')
        return
      }

      const photo = inserted as EventPhotoRow
      const url = supabase.storage.from('event-photos').getPublicUrl(photo.storage_path).data.publicUrl
      setPhotos((current) => [{ ...photo, url }, ...current.filter((item) => item.id !== photo.id)])
    } catch (caught) {
      console.error('Shared album upload request failed', {
        eventId: params.id,
        message: caught instanceof Error ? caught.message : 'Unexpected request failure',
      })
      setPhotoError('Could not upload that photo. Try again.')
    } finally {
      setUploadingPhoto(false)
    }
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
      photos={photos.map((photo) => ({ id: photo.id, url: photo.url }))}
      uploadingPhoto={uploadingPhoto}
      photoError={photoError}
      onRetryPhotos={loadPhotos}
      onPhotoUpload={onPhotoUpload}
    />
  )
}
