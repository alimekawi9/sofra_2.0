'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { HostCreateForm, type NewEventQuestionChoice } from '@/components/sofra-v2/HostCreateForm'
import type { PreviewPlace } from '@/components/sofra-v2/HostLocationAutocomplete'
import '@/components/sofra-v2/sofra-v2.css'
import { eventDateForStorage } from '@/lib/event-date'
import { generateCustomDetailId, sanitizeCustomDetails, type CustomDetailSection } from '@/lib/event-custom-details'

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
  const [customDetails, setCustomDetails] = useState<CustomDetailSection[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [kitchenPlan, setKitchenPlan] = useState<'now' | 'later' | 'chef' | null>(null)
  const [questionChoice, setQuestionChoice] = useState<NewEventQuestionChoice>('default')

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

  function addCustomDetail() {
    setCustomDetails((current) => [...current, { id: generateCustomDetailId(), label: '', body: '' }])
  }

  function updateCustomDetail(id: string, patch: Partial<Pick<CustomDetailSection, 'label' | 'body'>>) {
    setCustomDetails((current) => current.map((section) => (section.id === id ? { ...section, ...patch } : section)))
  }

  function removeCustomDetail(id: string) {
    setCustomDetails((current) => current.filter((section) => section.id !== id))
  }

  // Shared by publish and CUSTOMIZE GUEST QUESTIONS. Updates the draft row
  // in place if one was already created this session (e.g. an earlier
  // customize click) instead of inserting a duplicate event.
  async function saveEventRow(publish = false): Promise<{ id: string | null; error: string | null }> {
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
      event_date: eventDateForStorage(dateTime),
      venue: location === 'undecided' ? null : place?.venueName || location.trim(),
      address: location === 'undecided' ? null : place?.formattedAddress || null,
      dress_code: dressCode.trim() || null,
      custom_details: sanitizeCustomDetails(customDetails),
      theme,
      cover_url: publicUrl,
      is_published: publish,
      kitchen_status: 'pending',
      kitchen_plan: kitchenPlan,
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
    const { id, error: saveError } = await saveEventRow(true)
    setSubmitting(false)
    if (saveError || !id) {
      setError(saveError ?? 'Something went wrong. Please try again.')
      return
    }
    if (questionChoice === 'none') {
      const { error: questionnaireError } = await supabase.from('event_questionnaires').upsert(
        { event_id: id, config: { questions: [] }, updated_at: new Date().toISOString() },
        { onConflict: 'event_id' }
      )
      if (questionnaireError) {
        setError('Your Sofra was created, but the question choice could not be saved. Try again.')
        return
      }
    }
    if (questionChoice === 'custom') {
      router.push(`/host/${id}/questionnaire?onboarding=1&kitchenPlan=${kitchenPlan}`)
      return
    }
    if (kitchenPlan === 'chef') router.push('/events/' + id + '/table?kitchenShare=1')
    else if (kitchenPlan === 'now') router.push('/events/' + id + '/kitchen-setup')
    else router.push('/events/' + id)
  }

  return (
    <>
      <HostCreateForm
      title={title}
      onTitleChange={(value) => { setTitle(value); setError('') }}
      tagline={tagline}
      onTaglineChange={setTagline}
      dateTime={dateTime}
      onDateTimeChange={(value) => { setDateTime(value); setError('') }}
      location={location}
      onLocationChange={(value) => { setLocation(value); setPlace(null); setError('') }}
      onPlaceSelect={setPlace}
      dressCode={dressCode}
      onDressCodeChange={setDressCode}
      customDetails={customDetails}
      onAddCustomDetail={addCustomDetail}
      onCustomDetailChange={updateCustomDetail}
      onRemoveCustomDetail={removeCustomDetail}
      imageDataUrl={imageDataUrl}
      onImageChange={onImageChange}
      onImageRemove={onImageRemove}
      submitting={submitting}
      error={error}
      kitchenPlan={kitchenPlan}
      onKitchenPlanChange={setKitchenPlan}
      questionChoice={questionChoice}
      onQuestionChoiceChange={setQuestionChoice}
      onSubmit={handleSubmit}
      />
    </>
  )
}
