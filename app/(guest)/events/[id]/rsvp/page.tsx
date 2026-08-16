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
import { PreferencesConfirm } from '@/components/sofra-v2/PreferencesConfirm'
import { InviteCard, type InviteCardGuest, type InviteResponse } from '@/components/sofra-v2/InviteCard'
import { MissingOut } from '@/components/sofra-v2/MissingOut'
import { CustomQuestionField, type CustomResponseValue } from '@/components/sofra-v2/CustomQuestionField'
import { forgetPendingInvite } from '@/lib/pending-invites'
import {
  DEFAULT_QUESTIONNAIRE,
  sortedQuestions,
  isCanonical,
  isCustom,
  isCanonicalQuestionCustomized,
  canonicalOptionsFor,
  resolveCanonicalTitle,
  resolveCanonicalHelperText,
  resolveCanonicalOptionLabel,
  resolveCanonicalSliderMinLabel,
  resolveCanonicalSliderMaxLabel,
  type QuestionnaireConfig,
  type CanonicalQuestionConfig,
} from '@/lib/questionnaire'
import '@/components/sofra-v2/sofra-v2.css'
import { isEventDateUndecided } from '@/lib/event-date'

type Step = 'status' | 'confirm-preferences' | 'profile' | 'missing-out'
type RsvpStatus = 'going' | 'maybe' | 'cant'

type EventRow = {
  host_id: string
  is_published: boolean
  title: string
  tagline: string | null
  event_date: string
  venue: string | null
  dress_code: string | null
  host: { id: string; name: string; photo_url: string | null } | null
}

type GuestRow = {
  status: string
  users: { id: string; name: string; photo_url: string | null } | null
}

function formatDate(iso: string): string {
  if (isEventDateUndecided(iso)) return 'Date undecided'
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

function formatTime(iso: string): string {
  if (isEventDateUndecided(iso)) return 'Time undecided'
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
  const [identityConfirmed, setIdentityConfirmed] = useState(false)
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
  const [isPreferenceOnly, setIsPreferenceOnly] = useState(false)
  const [newQuestionIds, setNewQuestionIds] = useState<string[] | null>(null)
  const [changedCanonicalKeys, setChangedCanonicalKeys] = useState<CanonicalQuestionConfig['canonicalKey'][] | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [questionnaire, setQuestionnaire] = useState<QuestionnaireConfig>(DEFAULT_QUESTIONNAIRE)
  const [customAnswers, setCustomAnswers] = useState<Record<string, CustomResponseValue>>({})
  const customAnswersRef = useRef<Record<string, CustomResponseValue>>({})

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      const stored = localStorage.getItem('sofra_user_id')
      if (!stored) {
        router.push('/login?invite=1&next=' + encodeURIComponent('/events/' + params.id + '/rsvp'))
        return
      }
      uidRef.current = stored
      setIdentityConfirmed(true)

      const [{ data: ev, error: e0 }, { data: rsvpRow, error: e1 }, { data: profileRow, error: e2 }] = await Promise.all([
        supabase.from('events')
          .select('host_id,title,tagline,event_date,venue,dress_code,is_published,host:users!events_host_id_fkey(id,name,photo_url)')
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
          .select('status, users(id, name, photo_url)')
          .eq('event_id', params.id)
          .in('status', ['going', 'maybe'])

        if (!e3 && guestRows) {
          setGuests(
            (guestRows as unknown as GuestRow[])
              .filter((g) => g.users !== null)
              .map((g) => ({ id: g.users!.id, name: g.users!.name, photoUrl: g.users!.photo_url }))
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

      // Questionnaire customization is optional and additive -- if these
      // tables aren't set up yet or the fetch fails for any reason, guests
      // simply get the default Sofra questionnaire, exactly as before.
      try {
        const { data: questionnaireRow } = await supabase
          .from('event_questionnaires')
          .select('config')
          .eq('event_id', params.id)
          .maybeSingle()

        if (questionnaireRow?.config?.questions) {
          const config = questionnaireRow.config as QuestionnaireConfig
          setQuestionnaire(config)

          const { data: responseRows } = await supabase
            .from('event_question_responses')
            .select('question_id,response')
            .eq('event_id', params.id)
            .eq('user_id', stored)

          if (responseRows) {
            const hydrated: Record<string, CustomResponseValue> = {}
            for (const row of responseRows as { question_id: string; response: CustomResponseValue }[]) {
              hydrated[row.question_id] = row.response
            }
            customAnswersRef.current = hydrated
            setCustomAnswers(hydrated)
          }
        }
      } catch {
        // Swallowed deliberately -- see comment above.
      }

      if (new URLSearchParams(window.location.search).get('preferences') === '1') {
        setIsPreferenceOnly(true)
        setStatus('going')
        setStep('profile')
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
    forgetPendingInvite(params.id)
    setStatus('cant')
    setStep('missing-out')
  }

  // Guest already has a taste_profiles row and this event's questionnaire is
  // unmodified from the Sofra default -- reuse the existing preferences as-is
  // rather than asking them to fill out the same form again. Only the RSVP
  // status changes; taste_profiles is intentionally left untouched.
  async function handleUseSavedPreferences() {
    if (!uidRef.current || submitting || !status) return
    setSubmitting(true)
    setError('')
    const { error: upsertErr } = await supabase.from('rsvps').upsert(
      { event_id: params.id, user_id: uidRef.current, status },
      { onConflict: 'event_id,user_id' }
    )
    setSubmitting(false)
    if (upsertErr) {
      setError('Something went wrong. Please try again.')
      return
    }
    forgetPendingInvite(params.id)
    router.push('/events/' + params.id)
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
    forgetPendingInvite(params.id)

    // Custom (event-specific) question answers are stored separately from
    // canonical taste-profile fields and are best-effort: their save never
    // blocks or fails the core RSVP, which has already succeeded above.
    const customQs = sortedQuestions(questionnaire)
      .filter(isCustom)
      .filter((question) => newQuestionIds === null || newQuestionIds.includes(question.id))
    if (customQs.length > 0) {
      const rows = customQs
        .map((q) => ({
          event_id: params.id,
          user_id: uidRef.current!,
          question_id: q.id,
          response: customAnswersRef.current[q.id],
          updated_at: new Date().toISOString(),
        }))
        .filter((r) => {
          const v = r.response
          return v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)
        })

      if (rows.length > 0) {
        try {
          await supabase
            .from('event_question_responses')
            .upsert(rows, { onConflict: 'event_id,user_id,question_id' })
        } catch {
          // Swallowed deliberately -- see comment above.
        }
      }
    }

    router.push('/events/' + params.id)
  }

  function handleCustomAnswerChange(questionId: string, value: CustomResponseValue) {
    customAnswersRef.current = { ...customAnswersRef.current, [questionId]: value }
    setCustomAnswers(customAnswersRef.current)
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
    if (prefilled) {
      const changedCanonical = sortedQuestions(questionnaire)
        .filter(isCanonical)
        .filter(isCanonicalQuestionCustomized)
        .map((question) => question.canonicalKey)
      const unansweredCustomIds = sortedQuestions(questionnaire)
        .filter(isCustom)
        .filter((question) => customAnswersRef.current[question.id] === undefined)
        .map((question) => question.id)

      if (changedCanonical.length > 0 || unansweredCustomIds.length > 0) {
        setChangedCanonicalKeys(changedCanonical)
        setNewQuestionIds(unansweredCustomIds)
        setStep('profile')
        return
      }

      setStep('confirm-preferences')
      return
    }

    setNewQuestionIds(null)
    setChangedCanonicalKeys(null)
    setStep('profile')
  }

  // Keep all RSVP content unmounted until the local identity check succeeds.
  // This prevents the RSVP card flashing before the phone/name sequence.
  if (!identityConfirmed || loading) return null

  if (step === 'missing-out') {
    return <MissingOut onReturnToInvite={() => setStep('status')} />
  }

  if (step === 'confirm-preferences') {
    return (
      <PreferencesConfirm
        saving={submitting}
        error={error}
        onUseSaved={handleUseSavedPreferences}
        onUpdate={() => setStep('profile')}
        onBack={() => setStep('status')}
        tentative={status === 'maybe'}
      />
    )
  }

  if (step === 'profile' && !error) {
    const canonicalByKey = Object.fromEntries(
      sortedQuestions(questionnaire).filter(isCanonical).map((q) => [q.canonicalKey, q])
    ) as Partial<Record<CanonicalQuestionConfig['canonicalKey'], CanonicalQuestionConfig>>
    const customQs = sortedQuestions(questionnaire)
      .filter(isCustom)
      .filter((question) => newQuestionIds === null || newQuestionIds.includes(question.id))

    const optionLabelMap = (q: CanonicalQuestionConfig | undefined) => {
      if (!q) return undefined
      return Object.fromEntries(
        canonicalOptionsFor(q.canonicalKey).map((opt) => [opt.value, resolveCanonicalOptionLabel(q, opt.value, opt.label)])
      )
    }

    return (
      <PreferencesReceipt
        dietary={dietary}
        onToggleDietary={(it) => toggleChip(dietary, setDietary, it)}
        onSelectNoDietaryRestriction={() => setDietary([])}
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
        headline={questionnaire.header}
        visibleCanonicalQuestions={changedCanonicalKeys ?? Object.keys(canonicalByKey) as CanonicalQuestionConfig['canonicalKey'][]}
        questionOrders={Object.fromEntries(Object.values(canonicalByKey).filter((q): q is CanonicalQuestionConfig => Boolean(q)).map((q) => [q.canonicalKey, q.order]))}
        hiddenCanonicalOptions={{ dietary: canonicalByKey.dietary?.hiddenOptionValues, avoid: canonicalByKey.avoid?.hiddenOptionValues, protein: canonicalByKey.protein?.hiddenOptionValues, flavor: canonicalByKey.flavor?.hiddenOptionValues }}
        saveLabel={newQuestionIds !== null || changedCanonicalKeys !== null ? 'SAVE MY ANSWERS' : isPreferenceOnly ? (prefilled ? 'UPDATE PREFERENCES' : 'SAVE PREFERENCES') : hasExistingRsvp ? 'UPDATE RSVP' : 'SAVE MY SEAT'}
        saving={submitting}
        error={error}
        onBack={() => setStep('status')}
        tentative={status === 'maybe'}
        dietaryTitle={canonicalByKey.dietary ? resolveCanonicalTitle(canonicalByKey.dietary) : undefined}
        dietaryOptionLabels={optionLabelMap(canonicalByKey.dietary)}
        avoidTitle={canonicalByKey.avoid ? resolveCanonicalTitle(canonicalByKey.avoid) : undefined}
        avoidOptionLabels={optionLabelMap(canonicalByKey.avoid)}
        proteinTitle={canonicalByKey.protein ? resolveCanonicalTitle(canonicalByKey.protein) : undefined}
        proteinHelperText={canonicalByKey.protein ? resolveCanonicalHelperText(canonicalByKey.protein) : undefined}
        proteinOptionLabels={optionLabelMap(canonicalByKey.protein)}
        flavorTitle={canonicalByKey.flavor ? resolveCanonicalTitle(canonicalByKey.flavor) : undefined}
        flavorHelperText={canonicalByKey.flavor ? resolveCanonicalHelperText(canonicalByKey.flavor) : undefined}
        flavorOptionLabels={optionLabelMap(canonicalByKey.flavor)}
        adventurousnessTitle={canonicalByKey.adventurousness ? resolveCanonicalTitle(canonicalByKey.adventurousness) : undefined}
        adventurousnessHelperText={canonicalByKey.adventurousness ? resolveCanonicalHelperText(canonicalByKey.adventurousness) : undefined}
        adventurousnessMinLabel={canonicalByKey.adventurousness ? resolveCanonicalSliderMinLabel(canonicalByKey.adventurousness) : undefined}
        adventurousnessMaxLabel={canonicalByKey.adventurousness ? resolveCanonicalSliderMaxLabel(canonicalByKey.adventurousness) : undefined}
        extraContent={
          customQs.length > 0 ? (
            <>
              {customQs.map((q) => (
                <div key={q.id} style={{ order: q.order }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/design-preview/divider-line.svg" alt="" className="sv2-divider" />
                  <CustomQuestionField
                    question={q}
                    value={customAnswers[q.id]}
                    onChange={(value) => handleCustomAnswerChange(q.id, value)}
                  />
                </div>
              ))}
            </>
          ) : undefined
        }
      />
    )
  }

  return (
    <InviteCard
      loading={false}
      error={error}
      onRetry={loadData}
      title={event?.title ?? ''}
      note={event?.tagline ?? null}
      hostName={event?.host?.name ?? null}
      hostId={event?.host?.id ?? null}
      hostPhotoUrl={event?.host?.photo_url ?? null}
      dateLabel={event ? formatDate(event.event_date) : ''}
      timeLabel={event ? formatTime(event.event_date) : ''}
      venue={event?.venue ?? 'Venue pending'}
      dressCode={event?.dress_code ?? null}
      unlocked={hasExistingRsvp}
      guests={guests}
      submitting={submitting}
      onRespond={onRespond}
    />
  )
}
