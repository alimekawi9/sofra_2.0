'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { HostCreateForm } from '@/components/sofra-v2/HostCreateForm'
import type { PreviewPlace } from '@/components/sofra-v2/HostLocationAutocomplete'
import '@/components/sofra-v2/sofra-v2.css'

export default function HostNewPage() {
  const router = useRouter()
  const supabase = createClient()
  const uidRef = useRef<string | null>(null)
  const coverFileRef = useRef<File | null>(null)
  // Set once a draft event has been inserted (e.g. via CUSTOMIZE GUEST
  // QUESTIONS before publishing) so a later publish updates that same row
  // instead of inserting a duplicate event.
  const createdEventIdRef = useRef<string | null>(null)

  const [theme] = useState('ember')
  const [imageDataUrl, setImageDataUrl] = useState<string | undefined>(undefined)
  const [title, setTitle] = useState('')
  const [tagline, setTagline] = useState('')
  const [dateTime, setDateTime] = useState('')
  const [location, setLocation] = useState('')
  const [place, setPlace] = useState<PreviewPlace | null>(null)
  const [dressCode, setDressCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [customizing, setCustomizing] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const stored = localStorage.getItem('sofra_user_id')
    if (!stored) { router.push('/login'); return }
    uidRef.current = stored
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function onImageChange(file: File) {
    coverFileRef.current = file
    setImageDataUrl(URL.createObjectURL(file))
  }

  function onImageRemove() {
    coverFileRef.current = null
    setImageDataUrl(undefined)
  }

  // Shared by publish and CUSTOMIZE GUEST QUESTIONS. Updates the draft row
  // in place if one was already created this session (e.g. an earlier
  // customize click) instead of inserting a duplicate event.
  async function saveEventRow(): Promise<{ id: string | null; error: string | null }> {
    if (!uidRef.current) return { id: null, error: null }
    if (!title.trim() || !dateTime || !location.trim()) {
      return { id: null, error: 'Add an event name, date and time, and location before continuing.' }
    }

    let publicUrl: string | null = null
    if (coverFileRef.current) {
      const file = coverFileRef.current
      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `${uidRef.current}/${crypto.randomUUID()}.${ext}`

      const { error: uploadError } = await supabase.storage.from('covers').upload(path, file)
      if (uploadError) return { id: null, error: 'Photo upload failed. Please try again.' }
      publicUrl = supabase.storage.from('covers').getPublicUrl(path).data.publicUrl
    }

    const payload = {
      host_id: uidRef.current,
      title: title.trim(),
      tagline: tagline.trim() || null,
      event_date: new Date(dateTime).toISOString(),
      venue: place?.venueName || location.trim(),
      address: place?.formattedAddress || null,
      dress_code: dressCode.trim() || null,
      theme,
      cover_url: publicUrl,
      is_published: false,
    }

    if (createdEventIdRef.current) {
      const { error: updateError } = await supabase
        .from('events')
        .update(payload)
        .eq('id', createdEventIdRef.current)
      if (updateError) return { id: null, error: 'Something went wrong. Please try again.' }
      return { id: createdEventIdRef.current, error: null }
    }

    const { data, error: insertError } = await supabase
      .from('events')
      .insert(payload)
      .select('id')
      .single()

    if (insertError) return { id: null, error: 'Something went wrong. Please try again.' }
    createdEventIdRef.current = data!.id
    return { id: data!.id, error: null }
  }

  async function handleSubmit() {
    if (submitting) return
    setSubmitting(true)
    setError('')
    const { id, error: saveError } = await saveEventRow()
    setSubmitting(false)
    if (saveError || !id) {
      setError(saveError ?? 'Something went wrong. Please try again.')
      return
    }
    router.push('/kitchen?from=' + id)
  }

  async function handleCustomizeQuestions() {
    if (customizing) return
    setCustomizing(true)
    setError('')
    const { id, error: saveError } = await saveEventRow()
    setCustomizing(false)
    if (saveError || !id) {
      setError(saveError ?? 'Something went wrong. Please try again.')
      return
    }
    router.push('/host/' + id + '/questionnaire')
  }

  return (
    <HostCreateForm
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
      onCustomizeQuestions={handleCustomizeQuestions}
      customizingQuestions={customizing}
      error={error}
      onSubmit={handleSubmit}
    />
  )
}
