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

  const [theme, setTheme] = useState('ember')
  const [imageDataUrl, setImageDataUrl] = useState<string | undefined>(undefined)
  const [title, setTitle] = useState('')
  const [tagline, setTagline] = useState('')
  const [dateTime, setDateTime] = useState('')
  const [location, setLocation] = useState('')
  const [place, setPlace] = useState<PreviewPlace | null>(null)
  const [dressCode, setDressCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
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

  async function handleSubmit() {
    if (submitting || !uidRef.current) return
    if (!title.trim() || !dateTime || !location.trim()) {
      setError('Add an event name, date and time, and location before publishing.')
      return
    }

    setSubmitting(true)
    setError('')

    let publicUrl: string | null = null
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
      publicUrl = supabase.storage.from('covers').getPublicUrl(path).data.publicUrl
    }

    const { data, error: insertError } = await supabase
      .from('events')
      .insert({
        host_id: uidRef.current,
        title: title.trim(),
        tagline: tagline.trim() || null,
        event_date: new Date(dateTime).toISOString(),
        venue: place?.venueName || location.trim(),
        address: place?.formattedAddress || null,
        dress_code: dressCode.trim() || null,
        theme,
        cover_url: publicUrl,
      })
      .select('id')
      .single()

    if (insertError) {
      setError('Something went wrong. Please try again.')
      setSubmitting(false)
      return
    }

    router.push('/events/' + data!.id)
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
      theme={theme}
      onThemeChange={setTheme}
      imageDataUrl={imageDataUrl}
      onImageChange={onImageChange}
      onImageRemove={onImageRemove}
      submitting={submitting}
      error={error}
      onSubmit={handleSubmit}
    />
  )
}
