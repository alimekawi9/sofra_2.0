'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { HostCreateForm } from '@/components/sofra-v2/HostCreateForm'
import type { PreviewPlace } from '@/components/sofra-v2/HostLocationAutocomplete'
import '@/components/sofra-v2/sofra-v2.css'
import { isEventManager } from '@/lib/event-access'
import { eventDateForInput, eventDateForStorage, isEventDateUndecided } from '@/lib/event-date'
import { generateCustomDetailId, sanitizeCustomDetails, type CustomDetailSection } from '@/lib/event-custom-details'
import { customQuestions, type QuestionnaireConfig } from '@/lib/questionnaire'
import { computeTbdSuggestions, type TbdSuggestion } from '@/lib/event-tbd-suggestions'
import { recordEventUpdateNotice } from '@/lib/event-update-notices'

export default function HostEditPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const supabase = createClient()
  const uidRef = useRef<string | null>(null)
  const coverFileRef = useRef<File | null>(null)
  const originalVenueRef = useRef('')
  const originalAddressRef = useRef<string | null>(null)
  const originalEventDateRef = useRef('')

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
  const [customDetails, setCustomDetails] = useState<CustomDetailSection[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [canDelete, setCanDelete] = useState(false)
  const [error, setError] = useState('')
  const [dateSuggestion, setDateSuggestion] = useState<TbdSuggestion | undefined>(undefined)
  const [locationSuggestion, setLocationSuggestion] = useState<TbdSuggestion | undefined>(undefined)

  useEffect(() => {
    async function load() {
      const stored = localStorage.getItem('sofra_user_id')
      if (!stored) { router.push('/login'); return }
      uidRef.current = stored

      const { data: ev, error: fetchError } = await supabase
        .from('events')
        .select('host_id,title,tagline,event_date,venue,address,dress_code,custom_details,theme,cover_url')
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
      setDateTime(eventDateForInput(ev.event_date))
      setLocation(ev.venue ?? '')
      setDressCode(ev.dress_code ?? '')
      setCustomDetails((ev.custom_details as CustomDetailSection[] | null) ?? [])
      setTheme(ev.theme ?? 'ember')
      setImageDataUrl(ev.cover_url ?? undefined)
      originalVenueRef.current = ev.venue ?? ''
      originalAddressRef.current = ev.address ?? null
      originalEventDateRef.current = ev.event_date

      // Suggestions are optional and additive: only fetch questionnaire data
      // at all when a field is actually still TBD, and never block the form
      // if this fails.
      if (isEventDateUndecided(ev.event_date) || (!ev.venue?.trim() && !ev.address?.trim())) {
        try {
          const { data: qRow } = await supabase
            .from('event_questionnaires')
            .select('config')
            .eq('event_id', params.id)
            .maybeSingle()
          const config = qRow?.config?.questions ? (qRow.config as QuestionnaireConfig) : null
          const customQs = config ? customQuestions(config) : []
          if (customQs.length > 0) {
            const { data: responseRows } = await supabase
              .from('event_question_responses')
              .select('question_id,response')
              .eq('event_id', params.id)
            const suggestions = computeTbdSuggestions(
              { event_date: ev.event_date, venue: ev.venue, address: ev.address },
              customQs,
              responseRows ?? []
            )
            setDateSuggestion(suggestions.find((s) => s.field === 'dateTime'))
            setLocationSuggestion(suggestions.find((s) => s.field === 'location'))
          }
        } catch {
          // Swallowed deliberately -- see comment above.
        }
      }

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

  // The suggested value is a guest-written label (e.g. "Saturday, August 30
  // at 7pm"), not a real Date -- parsing arbitrary option text into a Date
  // is unreliable (real dates can fail to parse, and unrelated text can
  // parse into a bogus one), so this only clears "undecided" to reveal the
  // native picker; the host reads the suggested label and enters it.
  function useDateSuggestion() {
    if (dateTime === 'undecided') setDateTime('')
  }

  function useLocationSuggestion() {
    if (!locationSuggestion) return
    setLocation(locationSuggestion.value)
    setPlace(null)
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
    const nextEventDate = eventDateForStorage(dateTime)
    const nextVenue = place?.venueName || location.trim()
    const dateChanged = nextEventDate.slice(0, 10) !== originalEventDateRef.current.slice(0, 10)
    const timeChanged = nextEventDate.slice(11, 16) !== originalEventDateRef.current.slice(11, 16)
    const locationChanged = nextVenue !== originalVenueRef.current || address !== originalAddressRef.current

    const { error: updateError } = await supabase
      .from('events')
      .update({
        title: title.trim(),
        tagline: tagline.trim() || null,
        event_date: nextEventDate,
        venue: nextVenue,
        address,
        dress_code: dressCode.trim() || null,
        custom_details: sanitizeCustomDetails(customDetails),
        theme,
        cover_url: coverUrl,
      })
      .eq('id', params.id)

    if (updateError) {
      setError('Something went wrong. Please try again.')
      setSubmitting(false)
      return
    }

    const changedKinds = [
      dateChanged ? 'date' : null,
      timeChanged ? 'time' : null,
      locationChanged ? 'location' : null,
    ] as const
    await Promise.all(changedKinds.filter((kind): kind is 'date' | 'time' | 'location' => kind !== null)
      .map((kind) => recordEventUpdateNotice(supabase, params.id, uidRef.current!, kind)))

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
      dateSuggestion={dateSuggestion}
      onUseDateSuggestion={useDateSuggestion}
      locationSuggestion={locationSuggestion}
      onUseLocationSuggestion={useLocationSuggestion}
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
      onSubmit={handleSubmit}
      onDelete={canDelete ? handleDelete : undefined}
      deleting={deleting}
      onCustomizeQuestions={() => router.push('/host/' + params.id + '/questionnaire')}
    />
  )
}
