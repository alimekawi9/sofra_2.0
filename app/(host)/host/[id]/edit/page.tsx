'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { HostCreateForm } from '@/components/sofra-v2/HostCreateForm'
import type { PreviewPlace } from '@/components/sofra-v2/HostLocationAutocomplete'
import '@/components/sofra-v2/sofra-v2.css'
import { isEventManager } from '@/lib/event-access'
import { eventDateForStorage, isEventDateUndecided } from '@/lib/event-date'

// Formats an ISO timestamp for the <input type="datetime-local"> value
// (which needs local time with no timezone/seconds, e.g. 2026-09-01T19:00).
function toDateTimeLocal(iso: string): string {
  if (isEventDateUndecided(iso)) return 'undecided'
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function HostEditPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const supabase = createClient()
  const uidRef = useRef<string | null>(null)
  const coverFileRef = useRef<File | null>(null)
  const originalVenueRef = useRef('')
  const originalAddressRef = useRef<string | null>(null)

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [theme, setTheme] = useState('ember')
  const [imageDataUrl, setImageDataUrl] = useState<string | undefined>(undefined)
  const [title, setTitle] = useState('')
  const [tagline, setTagline] = useState('')
  const [dateTime, setDateTime] = useState('')
  const [location, setLocation] = useState('')
  const [place, setPlace] = useState<PreviewPlace | null>(null)
  const [dressCode, setDressCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [canDelete, setCanDelete] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      const stored = localStorage.getItem('sofra_user_id')
      if (!stored) { router.push('/login'); return }
      uidRef.current = stored

      const { data: ev, error: fetchError } = await supabase
        .from('events')
        .select('host_id,title,tagline,event_date,venue,address,dress_code,theme,cover_url')
        .eq('id', params.id)
        .single()

      if (fetchError || !ev) {
        setLoadError("Couldn't load this event. Try again.")
        setLoading(false)
        return
      }

      if (!(await isEventManager(supabase, params.id, stored, ev.host_id))) {
        router.replace('/events/' + params.id)
        return
      }

      setTitle(ev.title ?? '')
      setCanDelete(ev.host_id === stored)
      setTagline(ev.tagline ?? '')
      setDateTime(toDateTimeLocal(ev.event_date))
      setLocation(ev.venue ?? '')
      setDressCode(ev.dress_code ?? '')
      setTheme(ev.theme ?? 'ember')
      setImageDataUrl(ev.cover_url ?? undefined)
      originalVenueRef.current = ev.venue ?? ''
      originalAddressRef.current = ev.address ?? null
      setLoading(false)
    }
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function onImageChange(file: File) {
    coverFileRef.current = file
    setImageDataUrl(URL.createObjectURL(file))
  }

  function onImageRemove() {
    coverFileRef.current = null
    setImageDataUrl(undefined)
  }

  async function handleSubmit() {
    if (submitting || !uidRef.current) return
    if (!title.trim() || !dateTime || !location.trim()) {
      setError('Add an event name, date and time, and location before publishing.')
      return
    }

    setSubmitting(true)
    setError('')

    let coverUrl: string | null
    if (coverFileRef.current) {
      const file = coverFileRef.current
      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `${uidRef.current}/${crypto.randomUUID()}.${ext}`

      const { error: uploadError } = await supabase.storage.from('covers').upload(path, file)
      if (uploadError) {
        setError('Photo upload failed. Please try again.')
        setSubmitting(false)
        return
      }
      coverUrl = supabase.storage.from('covers').getPublicUrl(path).data.publicUrl
    } else {
      // No new file picked: imageDataUrl is either the untouched original
      // cover_url, or undefined if the host explicitly removed it.
      coverUrl = imageDataUrl ?? null
    }

    // Only trust a formatted address from a fresh place selection. If the
    // location text is unchanged from what was loaded, keep the original
    // address rather than silently wiping it out (we have no address for
    // arbitrary retyped text with no place selection).
    const address = place
      ? place.formattedAddress
      : location.trim() === originalVenueRef.current
      ? originalAddressRef.current
      : null

    const { error: updateError } = await supabase
      .from('events')
      .update({
        title: title.trim(),
        tagline: tagline.trim() || null,
        event_date: eventDateForStorage(dateTime),
        venue: place?.venueName || location.trim(),
        address,
        dress_code: dressCode.trim() || null,
        theme,
        cover_url: coverUrl,
      })
      .eq('id', params.id)

    if (updateError) {
      setError('Something went wrong. Please try again.')
      setSubmitting(false)
      return
    }

    router.push('/events/' + params.id)
  }

  async function handleDelete() {
    if (deleting || submitting) return
    const confirmed = window.confirm(
      'Delete this event? This cannot be undone with RSVPs, the shared album, and menu data removed too.'
    )
    if (!confirmed) return

    setDeleting(true)
    setError('')

    const { error: deleteError } = await supabase.from('events').delete().eq('id', params.id)

    if (deleteError) {
      setError('Could not delete this event. Try again.')
      setDeleting(false)
      return
    }

    router.push('/events')
  }

  if (loading) return null
  if (loadError) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px' }}>
        <p>{loadError}</p>
      </div>
    )
  }

  return (
    <HostCreateForm
      mode="edit"
      title={title}
      onTitleChange={setTitle}
      tagline={tagline}
      onTaglineChange={setTagline}
      dateTime={dateTime}
      onDateTimeChange={setDateTime}
      location={location}
      onLocationChange={(value) => { setLocation(value); setPlace(null) }}
      onPlaceSelect={setPlace}
      dressCode={dressCode}
      onDressCodeChange={setDressCode}
      imageDataUrl={imageDataUrl}
      onImageChange={onImageChange}
      onImageRemove={onImageRemove}
      submitting={submitting}
      error={error}
      onSubmit={handleSubmit}
      onDelete={canDelete ? handleDelete : undefined}
      deleting={deleting}
      onCustomizeQuestions={() => router.push('/host/' + params.id + '/questionnaire')}
    />
  )
}
