'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  normalizeProteinPreferences,
  updateProteinPreferenceSelection,
  type ProteinPreference,
} from '@/lib/protein-preferences'
import {
  normalizeFlavorPreferencesForSubmission,
  updateFlavorPreferenceSelection,
  type FlavorPreference,
} from '@/lib/flavor-preferences'
import { PreferencesReceipt } from '@/components/sofra-v2/PreferencesReceipt'
import { InviteCard, type InviteCardGuest, type InviteResponse } from '@/components/sofra-v2/InviteCard'
import { MissingOut } from '@/components/sofra-v2/MissingOut'
import '@/components/sofra-v2/sofra-v2.css'

type Step = 'status' | 'profile' | 'missing-out'
type RsvpStatus = 'going' | 'maybe' | 'cant'

type EventRow = {
  title: string
  tagline: string | null
  event_date: string
  venue: string | null
  dress_code: string | null
  host: { name: string } | null
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

export default function RSVPPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const supabase = createClient()
  const uidRef = useRef<string | null>(null)
  const proteinPreferencesRef = useRef<ProteinPreference[]>([])
  const proteinPreferencesDirtyRef = useRef(false)
  const flavorsRef = useRef<string[]>([])

  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState<Step>('status')
  const [status, setStatus] = useState<RsvpStatus | null>(null)
  const [event, setEvent] = useState<EventRow | null>(null)
  const [guests, setGuests] = useState<InviteCardGuest[]>([])
  const [dietary, setDietary] = useState<string[]>([])
  const [avoid, setAvoid] = useState<string[]>([])
  const [proteinPreferences, setProteinPreferences] = useState<ProteinPreference[]>([])
  const [proteinHint, setProteinHint] = useState(false)
  const [flavors, setFlavors] = useState<string[]>([])
  const [flavorHint, setFlavorHint] = useState(false)
  const [adventurousness, setAdventurousness] = useState(50)
  const [prefilled, setPrefilled] = useState(false)
  const [hasExistingRsvp, setHasExistingRsvp] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      const stored = localStorage.getItem('sofra_user_id')
      if (!stored) {
        router.push('/name?next=' + encodeURIComponent('/events/' + params.id + '/rsvp'))
        return
      }
      uidRef.current = stored

      const [{ data: ev, error: e0 }, { data: rsvpRow, error: e1 }, { data: profileRow, error: e2 }] = await Promise.all([
        supabase.from('events')
          .select('title,tagline,event_date,venue,dress_code,host:users!events_host_id_fkey(name)')
          .eq('id', params.id)
          .single(),
        supabase.from('rsvps')
          .select('status')
          .eq('event_id', params.id)
          .eq('user_id', stored)
          .maybeSingle(),
        supabase.from('taste_profiles')
          .select('*')
          .eq('user_id', stored)
          .maybeSingle(),
      ])

      if (e0 || e1 || e2) throw new Error('fetch failed')

      setEvent(ev as unknown as EventRow)

      if (rsvpRow?.status) setStatus(rsvpRow.status as RsvpStatus)
      const hasRsvp = rsvpRow !== null
      setHasExistingRsvp(hasRsvp)

      if (hasRsvp) {
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
      }

      if (profileRow) {
        const p = profileRow as Record<string, unknown>
        setDietary((p.dietary as string[]) ?? [])
        setAvoid((p.avoid as string[]) ?? [])
        if (!proteinPreferencesDirtyRef.current) {
          const hydratedPreferences = normalizeProteinPreferences(
            p.protein_preferences as string[] | null | undefined,
            p.protein_anchor as string | null | undefined
          )
          proteinPreferencesRef.current = hydratedPreferences
          setProteinPreferences(hydratedPreferences)
        }
        const hydratedFlavors = Array.isArray(p.flavor_preference)
          ? p.flavor_preference.filter((value): value is string => typeof value === 'string')
          : []
        flavorsRef.current = hydratedFlavors
        setFlavors(hydratedFlavors)
        setAdventurousness((p.adventurousness as number) ?? 50)
        setPrefilled(true)
      }
    } catch {
      setError("Couldn't load your RSVP. Try again.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCantSubmit() {
    if (!uidRef.current || submitting) return
    setSubmitting(true)
    setError('')
    const { error: upsertErr } = await supabase.from('rsvps').upsert(
      { event_id: params.id, user_id: uidRef.current, status: 'cant' },
      { onConflict: 'event_id,user_id' }
    )
    setSubmitting(false)
    if (upsertErr) {
      setError('Something went wrong. Please try again.')
      return
    }
    setStatus('cant')
    setStep('missing-out')
  }

  async function handleProfileSubmit() {
    if (!uidRef.current || submitting) return
    const proteinPreferencesForSubmit = [...proteinPreferencesRef.current]
    const flavorsForSubmit = normalizeFlavorPreferencesForSubmission(flavorsRef.current)
    if (process.env.NODE_ENV === 'development') {
      console.log('protein_preferences submit', proteinPreferencesForSubmit)
    }
    setSubmitting(true)
    setError('')
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase.from('rsvps').upsert(
        { event_id: params.id, user_id: uidRef.current, status },
        { onConflict: 'event_id,user_id' }
      ),
      supabase.from('taste_profiles').upsert(
        {
          user_id: uidRef.current,
          dietary,
          avoid,
          protein_preferences: proteinPreferencesForSubmit,
          flavor_preference: flavorsForSubmit,
          adventurousness,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      ),
    ])
    if (e1 || e2) {
      setError('Something went wrong. Please try again.')
      setSubmitting(false)
      return
    }
    router.push('/events/' + params.id)
  }

  function toggleChip(arr: string[], setArr: (v: string[]) => void, value: string) {
    setArr(arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value])
  }

  function toggleProtein(value: ProteinPreference) {
    const update = updateProteinPreferenceSelection(proteinPreferencesRef.current, value)
    if (update.blocked) {
      setProteinHint(true)
      setTimeout(() => setProteinHint(false), 2000)
      return
    }
    proteinPreferencesDirtyRef.current = true
    proteinPreferencesRef.current = update.preferences
    setProteinPreferences(update.preferences)
  }

  function toggleFlavor(value: FlavorPreference) {
    const update = updateFlavorPreferenceSelection(flavorsRef.current, value)
    setFlavorHint(update.blocked)
    if (update.blocked) return
    flavorsRef.current = update.preferences
    setFlavors(update.preferences)
  }

  function onRespond(response: InviteResponse) {
    if (response === 'cant') {
      void handleCantSubmit()
      return
    }
    setStatus(response)
    setStep('profile')
  }

  if (step === 'missing-out') {
    return <MissingOut onReturnToInvite={() => setStep('status')} />
  }

  if (step === 'profile' && !loading && !error) {
    return (
      <PreferencesReceipt
        dietary={dietary}
        onToggleDietary={(it) => toggleChip(dietary, setDietary, it)}
        avoid={avoid}
        onToggleAvoid={(it) => toggleChip(avoid, setAvoid, it)}
        proteinPreferences={proteinPreferences}
        onToggleProtein={toggleProtein}
        proteinHintVisible={proteinHint}
        flavors={flavors}
        onToggleFlavor={toggleFlavor}
        flavorHintVisible={flavorHint}
        adventurousness={adventurousness}
        onAdventurousnessChange={setAdventurousness}
        onSave={handleProfileSubmit}
        prefilled={prefilled}
        saveLabel={hasExistingRsvp ? 'UPDATE RSVP' : 'SAVE MY SEAT'}
        saving={submitting}
        error={error}
        onBack={() => setStep('status')}
      />
    )
  }

  return (
    <InviteCard
      loading={loading}
      error={error}
      onRetry={loadData}
      title={event?.title ?? ''}
      note={event?.tagline ?? null}
      hostName={event?.host?.name ?? null}
      dateLabel={event ? formatDate(event.event_date) : ''}
      timeLabel={event ? formatTime(event.event_date) : ''}
      venue={event?.venue ?? '—'}
      dressCode={event?.dress_code ?? null}
      unlocked={hasExistingRsvp}
      guests={guests}
      submitting={submitting}
      onRespond={onRespond}
    />
  )
}
