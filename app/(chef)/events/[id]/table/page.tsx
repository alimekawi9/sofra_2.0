'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import '@/components/sofra-v2/sofra-v2.css'
import { buildIntel } from '@/lib/intel'
import type { TasteProfile, TableIntel } from '@/lib/intel'
import { deriveCourse } from '@/lib/menu'
import type { Course, Signature, PantryItem } from '@/lib/menu'
import { C } from '@/lib/theme'
import ChefTabs from '@/components/ChefTabs'
import { formatTagLabel } from '@/lib/tag-format'
import { withoutDishRoles } from '@/lib/dish-presets'
import { formatProteinPreferenceLabel, normalizeProteinPreferences } from '@/lib/protein-preferences'
import { sortedQuestions, isCustom, relevantCanonicalTopics, CANONICAL_KEYS, type CanonicalKey, type QuestionnaireConfig, type CustomQuestionConfig } from '@/lib/questionnaire'
import Link from 'next/link'
import { hasEnoughGuestResponses, menuResponseGuidance, menuResponseLabel } from '@/lib/menu-generation-snapshot'
import { isEventManager, fetchEventHostIds } from '@/lib/event-access'
import { rankingInsight, type EventPlanningResult, type PlanningAnswerSummary } from '@/lib/event-planning'
import { guestHostLabel, guestHostBreakdown } from '@/lib/guest-host-count'

type CustomAnswerSummary = {
  question: CustomQuestionConfig
  responseCount: number
  counts?: { label: string; count: number }[]
  texts?: string[]
  rankings?: { label: string; bordaScore: number; firstChoiceVotes: number }[]
  average?: { value: number; responses: number }
}

function summarizeCustomAnswers(
  customQs: CustomQuestionConfig[],
  rows: Array<{ question_id: string; response: unknown }>
): CustomAnswerSummary[] {
  return customQs.map((q) => {
    const answers = rows.filter((r) => r.question_id === q.id).map((r) => r.response)
    if (q.type === 'text') {
      const texts = answers.filter((a): a is string => typeof a === 'string' && a.trim().length > 0)
      return { question: q, texts, responseCount: texts.length }
    }
    if (q.type === 'ranking') {
      const rankedAnswers = answers.filter((answer): answer is string[] => Array.isArray(answer) && answer.every((value) => typeof value === 'string'))
      // Borda count: with N options, 1st place earns N points down to 1 point
      // for last place, summed across every response. This lets several 2nd-
      // place picks outweigh a lone 1st-place pick, unlike raw first-choice tallies.
      const optionCount = (q.options ?? []).length
      const rankings = (q.options ?? [])
        .map((option) => {
          const positions = rankedAnswers.map((answer) => answer.indexOf(option.value)).filter((position) => position >= 0)
          const bordaScore = positions.reduce((sum, position) => sum + (optionCount - position), 0)
          const firstChoiceVotes = rankedAnswers.filter((answer) => answer[0] === option.value).length
          return { label: option.label, bordaScore, firstChoiceVotes, ranked: positions.length > 0 }
        })
        .filter((item) => item.ranked)
        .sort((a, b) => b.bordaScore - a.bordaScore)
        .map(({ label, bordaScore, firstChoiceVotes }) => ({ label, bordaScore, firstChoiceVotes }))
      return { question: q, rankings, responseCount: rankedAnswers.length }
    }
    if (q.type === 'slider') {
      const values = answers.filter((answer): answer is number => typeof answer === 'number' && Number.isFinite(answer))
      return { question: q, average: values.length ? { value: values.reduce((sum, value) => sum + value, 0) / values.length, responses: values.length } : undefined, responseCount: values.length }
    }
    const tally = new Map<string, number>()
    for (const a of answers) {
      const values = Array.isArray(a) ? a : typeof a === 'string' ? [a] : []
      for (const v of values) tally.set(v, (tally.get(v) ?? 0) + 1)
    }
    const counts = (q.options ?? [])
      .map((opt) => ({ label: opt.label, count: tally.get(opt.value) ?? 0 }))
      .filter((c) => c.count > 0)
      .sort((a, b) => b.count - a.count)
    return { question: q, counts, responseCount: answers.length }
  })
}

function planningAnswerSummaries(summaries: CustomAnswerSummary[]): PlanningAnswerSummary[] {
  return summaries.map(({ question, responseCount, counts, texts, rankings, average }) => {
    if (question.type === 'ranking') return {
      question: question.title,
      type: 'ranking',
      insight: rankingInsight(rankings ?? [], responseCount),
      evidence: (rankings ?? []).map((item, index) => `${index + 1}. ${item.label}; weighted score ${item.bordaScore} (${item.firstChoiceVotes} first-choice vote${item.firstChoiceVotes === 1 ? '' : 's'})`),
    }
    if (question.type === 'text') return { question: question.title, type: 'text', insight: `${responseCount} written response${responseCount === 1 ? '' : 's'}`, evidence: texts ?? [] }
    if (question.type === 'slider') return { question: question.title, type: 'slider', insight: average ? `Typical response: ${average.value.toFixed(1)} out of ${question.sliderSteps ?? 5}` : 'No responses yet.', evidence: [] }
    return {
      question: question.title,
      type: 'choice',
      insight: counts?.length ? `${counts[0].label} was selected most often.` : 'No responses yet.',
      evidence: (counts ?? []).map((item) => `${item.label}: ${item.count} selection${item.count === 1 ? '' : 's'}`),
    }
  })
}

function currentMonday(): string {
  const d = new Date()
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)
}

type RsvpRow = { user_id: string; users: { name: string; photo_url: string | null } | null }
type ProfileRow = {
  user_id: string
  dietary: string[]
  avoid: string[]
  protein_anchor: string | null
  protein_preferences?: string[]
  flavor_preference: string[]
  adventurousness: number
}

function mergeGuests(rsvps: RsvpRow[], profiles: ProfileRow[]): TasteProfile[] {
  return rsvps.map((r) => {
    const p = profiles.find((x) => x.user_id === r.user_id)
    return {
      userId: r.user_id,
      name: r.users?.name ?? 'Unknown',
      photoUrl: r.users?.photo_url ?? null,
      dietary: p?.dietary ?? [],
      avoid: p?.avoid ?? [],
      proteinAnchor: p?.protein_anchor ?? null,
      proteinPreferences: normalizeProteinPreferences(p?.protein_preferences, p?.protein_anchor),
      flavorPreference: p?.flavor_preference ?? [],
      adventurousness: p?.adventurousness ?? 50,
    }
  })
}

export default function TablePage({ params }: { params: { id: string } }) {
  const { id } = params
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState('')
  const [intel, setIntel] = useState<TableIntel | null>(null)
  const [guests, setGuests] = useState<TasteProfile[]>([])
  const [hostUserIds, setHostUserIds] = useState<Set<string>>(new Set())
  const [eventTitle, setEventTitle] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [courses, setCourses] = useState<Course[]>([])
  const [customAnswerSummaries, setCustomAnswerSummaries] = useState<CustomAnswerSummary[]>([])
  const [guestResponseCount, setGuestResponseCount] = useState(0)
  const [relevantTopics, setRelevantTopics] = useState<CanonicalKey[]>(CANONICAL_KEYS)
  const [questionnaireLoaded, setQuestionnaireLoaded] = useState(false)
  const [planning, setPlanning] = useState<EventPlanningResult | null>(null)
  const [planningLoading, setPlanningLoading] = useState(false)
  const [planningError, setPlanningError] = useState('')

  async function loadAll() {
    setLoading(true)
    setFetchError('')
    try {
      const stored = localStorage.getItem('sofra_user_id')
      if (!stored) { router.push('/login'); return }

      const { data: ev, error: evErr } = await supabase
        .from('events')
        .select('host_id, chef_id, title, event_date')
        .eq('id', id)
        .single()
      if (evErr || !ev) { router.replace(`/events/${id}`); return }
      if (!(await isEventManager(supabase, id, stored, ev.host_id))) { router.replace(`/events/${id}`); return }
      setEventTitle(ev.title)
      setEventDate(ev.event_date)

      const hostIds = await fetchEventHostIds(supabase, id, ev.host_id)
      setHostUserIds(hostIds)

      const { data: rsvps } = await supabase
        .from('rsvps')
        .select('user_id, users(name,photo_url)')
        .eq('event_id', id)
        .in('status', ['going', 'maybe'])

      const userIds = ((rsvps ?? []) as unknown as RsvpRow[]).map((r) => r.user_id)
      setGuestResponseCount(userIds.filter((userId) => !hostIds.has(userId)).length)

      // Custom-question tallies must include every host/co-host too, not
      // just RSVP'd attendees -- a co-host without their own RSVP row (e.g.
      // one added after the survey existed) still answers it, and excluding
      // them silently undercounts every tally and hides that they answered.
      const responseUserIdSet = new Set(userIds)
      hostIds.forEach((hostUserId) => responseUserIdSet.add(hostUserId))
      const responseUserIds = Array.from(responseUserIdSet)

      const { data: profiles } = userIds.length
        ? await supabase
            .from('taste_profiles')
            .select('user_id, dietary, avoid, protein_anchor, protein_preferences, flavor_preference, adventurousness')
            .in('user_id', userIds)
        : { data: [] as ProfileRow[] }

      const merged = mergeGuests(
        (rsvps ?? []) as unknown as RsvpRow[],
        (profiles ?? []) as ProfileRow[]
      )
      setGuests(merged)
      const builtIntel = buildIntel(merged)
      setIntel(builtIntel)

      // Load the persisted menu (if any) so we can display the per-guest
      // substitution plan alongside table intel. Chef owns the signatures
      // and pantry, so lookups run against the chef's account.
      const chefId = ev.chef_id ?? stored
      const [{ data: sigs }, { data: pantryRows }, { data: menu }] = await Promise.all([
        supabase
          .from('signatures')
          .select('id, name, tags, contains_allergens, slot, novelty_score, is_substantial')
          .eq('chef_id', chefId),
        supabase
          .from('pantry_items')
          .select('id, name, tags, contains_allergens')
          .eq('chef_id', chefId)
          .eq('week_of', currentMonday()),
        supabase.from('menus').select('id').eq('event_id', id).maybeSingle(),
      ])
      if (menu) {
        const { data: courseRows } = await supabase
          .from('menu_courses')
          .select('slot, dish_name, dish_origin, source, sort_order')
          .eq('menu_id', menu.id)
          .order('sort_order', { ascending: true })
        const derived: Course[] = (courseRows ?? []).map((c) =>
          deriveCourse(
            {
              slot: c.slot,
              dish_name: c.dish_name,
              dish_origin: c.dish_origin,
              source: c.source,
            },
            (sigs ?? []) as Signature[],
            ((pantryRows ?? []) as PantryItem[]).map((item) => ({
              ...item,
              tags: withoutDishRoles(item.tags),
            })),
            builtIntel
          )
        )
        setCourses(derived)
      }

      // Event-specific custom questions/responses are optional and additive.
      // If these tables aren't set up yet, the section simply doesn't render.
      try {
        const { data: qRow } = await supabase
          .from('event_questionnaires')
          .select('config')
          .eq('event_id', id)
          .maybeSingle()

        const config = qRow?.config?.questions ? qRow.config as QuestionnaireConfig : null
        const customQs = config ? sortedQuestions(config).filter(isCustom) : []
        if (config) setRelevantTopics(relevantCanonicalTopics(config))

        if (customQs.length > 0) {
          const { data: responseRows } = responseUserIds.length
            ? await supabase
                .from('event_question_responses')
                .select('question_id,response')
                .eq('event_id', id)
                .in('user_id', responseUserIds)
            : { data: [] as Array<{ question_id: string; response: unknown }> }

          setCustomAnswerSummaries(summarizeCustomAnswers(customQs, responseRows ?? []))
        }
      } catch {
        // Swallowed deliberately -- see comment above.
      } finally {
        setQuestionnaireLoaded(true)
      }
    } catch {
      setFetchError("Couldn't load table intel. Try again.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadAll() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!intel || !questionnaireLoaded || intel.guestCount === 0 || customAnswerSummaries.length === 0) return
    const controller = new AbortController()
    setPlanningLoading(true)
    setPlanningError('')
    void fetch(`/api/events/${id}/planning-recommendations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventTitle, eventDate, intel, answers: planningAnswerSummaries(customAnswerSummaries) }),
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error('Planning request failed')
      setPlanning(await response.json() as EventPlanningResult)
    }).catch((error) => {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setPlanningError("Couldn't generate planning recommendations right now.")
    }).finally(() => {
      if (!controller.signal.aborted) setPlanningLoading(false)
    })
    return () => controller.abort()
  }, [customAnswerSummaries, eventDate, eventTitle, id, intel, questionnaireLoaded])

  const dateSub = eventDate
    ? new Date(eventDate).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })
    : undefined

  const { guests: guestsOnlyCount, hosts: hostsInAttendance } = guestHostBreakdown(
    guests.map((g) => g.userId).filter((id): id is string => id !== undefined),
    hostUserIds
  )

  return (
    <>
    <style>{`@keyframes sofraPulse { 0%,100%{opacity:.4} 50%{opacity:.7} }`}</style>
    <div
      className="sv2-root sv2-device-page sv2-app-page sv2-production-table"
      style={{
        minHeight: '100vh',
        background: C.ink,
        fontFamily: 'Georgia, serif',
        paddingBottom: 120,
      }}
    >
      <div
        className="fade sv2-device-shell sv2-app-shell sv2-table-intel-shell"
        style={{ maxWidth: 440, margin: '0 auto', padding: '22px 20px 32px' }}
      >
        <ChefTabs
          eventId={id}
          active="table"
          title={eventTitle}
          subtitle={
            dateSub
              ? `${dateSub}${intel ? ` · ${guestHostLabel(guestsOnlyCount, hostsInAttendance)}` : ''}`
              : undefined
          }
        />

        {loading && (
          <div
            data-testid="skeleton"
            style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
          >
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                style={{
                  height: 80,
                  borderRadius: 18,
                  background: 'rgba(255,255,255,0.08)',
                  animation: 'sofraPulse 1.4s ease-in-out infinite',
                }}
              />
            ))}
          </div>
        )}

        {!loading && fetchError && (
          <div style={{ textAlign: 'center', paddingTop: 40 }}>
            <p style={{ color: C.rose, fontSize: 14, marginBottom: 16 }}>{fetchError}</p>
            <button
              onClick={() => void loadAll()}
              style={{
                background: 'none',
                border: `1px solid ${C.dim}`,
                borderRadius: 10,
                color: C.dim,
                padding: '8px 20px',
                cursor: 'pointer',
                fontSize: 14,
                fontFamily: 'Georgia, serif',
              }}
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !fetchError && intel && (
          <>
            <section className={`sv2-rsvp-progress ${hasEnoughGuestResponses(guestResponseCount) ? 'is-ready' : 'is-low'}`} aria-label="RSVP response progress">
              <strong>{menuResponseLabel(guestResponseCount)}</strong>
              <span>{menuResponseGuidance(guestResponseCount)}</span>
            </section>

            {/* Hard limits */}
            {(relevantTopics.includes('dietary') || relevantTopics.includes('avoid')) && <section className="sv2-intel-card sv2-intel-hard-limits" style={{ ...card, borderColor: 'rgba(224,119,107,0.35)' }}>
              <div style={cardHeadRow}>
                <span style={cardTitle}>Hard Limits with non-negotiable needs</span>
                <span
                  style={{
                    color: C.danger,
                    fontSize: 11,
                    letterSpacing: 1,
                    textTransform: 'uppercase',
                    fontFamily: 'system-ui, sans-serif',
                    fontWeight: 600,
                  }}
                >
                  must not violate
                </span>
              </div>
              <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 9 }}>
                {intel.hardLimits.length === 0 ? (
                  <div style={{ color: C.faint, fontSize: 14, fontFamily: 'system-ui, sans-serif' }}>
                    Open table with no hard limits.
                  </div>
                ) : (
                  intel.hardLimits.map((limit) => (
                    <div
                      key={`${limit.type}-${limit.label}`}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 12,
                      }}
                    >
                      <span
                        style={{
                          color: C.cream,
                          fontSize: 14,
                          fontFamily: 'system-ui, sans-serif',
                        }}
                      >
                        <span aria-hidden>⛔ </span>
                        <span>{formatTagLabel(limit.label)}</span>
                      </span>
                      <span
                        style={{
                          color: C.dim,
                          fontSize: 12,
                          fontFamily: 'system-ui, sans-serif',
                          textAlign: 'right',
                        }}
                      >
                        {limit.guests.map((guestName, index) => {
                          const person = guests.find((guest) => guest.name === guestName)
                          return person?.userId ? (
                            <span key={person.userId}>
                              {index > 0 && ', '}
                              <Link className="sv2-intel-name-link" href={`/profile/${person.userId}`}>{person.name}</Link>
                            </span>
                          ) : <span key={`${guestName}-${index}`}>{index > 0 && ', '}{guestName}</span>
                        })}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </section>}

            {/* Diet mix + protein anchor grid */}
            {(relevantTopics.includes('dietary') || relevantTopics.includes('protein')) && <div className="sv2-intel-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {relevantTopics.includes('dietary') && <section className="sv2-intel-card" style={card}>
                <div style={cardTitle}>Diet Mix</div>
                <div style={{ marginTop: 12 }}>
                  {intel.dietMix.length === 0 ? (
                    <div
                      style={{
                        color: C.faint,
                        fontSize: 13,
                        fontFamily: 'system-ui, sans-serif',
                      }}
                    >
                      No dietary preferences on record
                    </div>
                  ) : (
                    intel.dietMix.map((d) => (
                      <Bar
                        key={d.label}
                        label={d.label}
                        n={d.count}
                        total={intel.guestCount}
                        tint={C.gold}
                      />
                    ))
                  )}
                </div>
              </section>}
              {relevantTopics.includes('protein') && <section className="sv2-intel-card" style={card}>
                <div style={cardTitle}>Tonight&apos;s Picks</div>
                <div style={{ marginTop: 12 }}>
                  {intel.proteinCounts.length === 0 ? (
                    <div
                      style={{
                        color: C.faint,
                        fontSize: 13,
                        fontFamily: 'system-ui, sans-serif',
                      }}
                    >
                      No picks on record
                    </div>
                  ) : (
                    intel.proteinCounts.map((d) => (
                      <Bar
                        key={d.label}
                        label={d.label}
                        formatLabel={formatProteinPreferenceLabel}
                        n={d.count}
                        total={intel.guestCount}
                        tint={C.sage}
                      />
                    ))
                  )}
                </div>
              </section>}
            </div>}

            {/* Flavor preference */}
            {relevantTopics.includes('flavor') && <section className="sv2-intel-card" style={card}>
              <div style={cardTitle}>Flavor Preference</div>
              <div style={{ marginTop: 12 }}>
                {intel.flavorCounts.length === 0 ? (
                  <div
                    style={{
                      color: C.faint,
                      fontSize: 13,
                      fontFamily: 'system-ui, sans-serif',
                    }}
                  >
                    No flavor preferences on record
                  </div>
                ) : (
                  intel.flavorCounts.map((d) => (
                    <Bar
                      key={d.label}
                      label={d.label}
                      n={d.count}
                      total={intel.guestCount}
                      tint={C.rose}
                    />
                  ))
                )}
              </div>
            </section>}

            {/* Adventurousness */}
            {relevantTopics.includes('adventurousness') && <section className="sv2-intel-card sv2-intel-adventurousness" style={card}>
              <div style={cardHeadRow}>
                <span style={cardTitle}>Adventurousness</span>
                <span
                  style={{
                    color: C.gold,
                    fontSize: 13,
                    fontFamily: 'system-ui, sans-serif',
                  }}
                >
                  <span>{intel.avgAdventurousness} / 100</span>
                  <span> · </span>
                  <span>{intel.adventurousnessLabel}</span>
                </span>
              </div>
              <div
                style={{
                  position: 'relative',
                  height: 10,
                  background: 'rgba(255,255,255,0.06)',
                  borderRadius: 8,
                  marginTop: 16,
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: `${intel.avgAdventurousness}%`,
                    background: 'linear-gradient(90deg,#5C1A1B,#D9A15B)',
                    borderRadius: 8,
                    opacity: 0.5,
                  }}
                />
                {guests.map((g, i) => (
                  <div
                    key={i}
                    title={`${g.name}: ${g.adventurousness}`}
                    style={{
                      position: 'absolute',
                      top: -3,
                      left: `${g.adventurousness}%`,
                      width: 4,
                      height: 16,
                      background: C.cream,
                      borderRadius: 2,
                      transform: 'translateX(-50%)',
                      boxShadow: `0 0 0 2px ${C.panel}`,
                    }}
                  />
                ))}
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  color: C.faint,
                  fontSize: 11,
                  marginTop: 12,
                  fontFamily: 'system-ui, sans-serif',
                }}
              >
                <span>Keep it familiar</span>
                <span>Chef, surprise me</span>
              </div>
            </section>}

            {/* Brief */}
            {relevantTopics.length > 0 && <aside className="sv2-intel-brief" style={brief}>
              <span style={{ color: C.gold, fontSize: 15 }}>✦</span>
              <span>{intel.brief}</span>
            </aside>}

            {/* Event-specific custom question answers — kept fully separate
                from canonical taste-profile data and menu scoring above. */}
            {customAnswerSummaries.length > 0 && (
              <section className="sv2-intel-card" style={card}>
                <div style={cardTitle}>Event-Specific Answers</div>
                {customAnswerSummaries.map(({ question, responseCount, counts, texts, rankings, average }) => (
                  <div key={question.id} style={{ marginTop: 14 }}>
                    <div style={{ color: C.cream, fontSize: 14, fontFamily: 'system-ui, sans-serif', marginBottom: 6 }}>
                      {question.title}
                    </div>
                    {question.type === 'text' ? (
                      texts && texts.length > 0 ? (
                        <ul style={{ margin: 0, paddingLeft: 18, color: C.dim, fontSize: 13, fontFamily: 'system-ui, sans-serif', lineHeight: 1.6 }}>
                          {texts.map((t, i) => <li key={i}>{t}</li>)}
                        </ul>
                      ) : (
                        <div style={{ color: C.faint, fontSize: 12, fontFamily: 'system-ui, sans-serif' }}>No answers yet.</div>
                      )
                    ) : question.type === 'slider' ? (
                      average ? <div style={{ color: C.dim, fontSize: 13, fontFamily: 'system-ui, sans-serif' }}>Average: <span style={{ color: C.cream }}>{average.value.toFixed(1)} / {question.sliderSteps ?? 5}</span> · {average.responses} response{average.responses === 1 ? '' : 's'}</div> : <div style={{ color: C.faint, fontSize: 12, fontFamily: 'system-ui, sans-serif' }}>No answers yet.</div>
                    ) : question.type === 'ranking' ? (
                      rankings && rankings.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {rankings.map((item, index) => <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, color: C.dim, fontSize: 13, fontFamily: 'system-ui, sans-serif' }}><span>{index + 1}. {item.label}</span><span style={{ color: C.cream }}>{item.firstChoiceVotes} first</span></div>)}
                        </div>
                      ) : <div style={{ color: C.faint, fontSize: 12, fontFamily: 'system-ui, sans-serif' }}>No answers yet.</div>
                    ) : counts && counts.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {counts.map((c) => (
                          <div
                            key={c.label}
                            style={{ display: 'flex', justifyContent: 'space-between', gap: 12, color: C.dim, fontSize: 13, fontFamily: 'system-ui, sans-serif' }}
                          >
                            <span>{c.label}</span>
                            <span style={{ color: C.cream }}>{c.count} of {responseCount}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ color: C.faint, fontSize: 12, fontFamily: 'system-ui, sans-serif' }}>No answers yet.</div>
                    )}
                  </div>
                ))}
              </section>
            )}

            {(planningLoading || planning || planningError) && (
              <section className="sv2-intel-card" style={card} aria-live="polite">
                <div style={cardTitle}>Sofra&apos;s Planning Recommendations</div>
                {planningLoading ? (
                  <div style={{ color: C.faint, fontSize: 13, fontFamily: 'system-ui, sans-serif' }}>Reading the room…</div>
                ) : planning ? (
                  <>
                    <p style={{ color: C.dim, fontSize: 13, fontFamily: 'system-ui, sans-serif', lineHeight: 1.55, margin: '0 0 14px' }}>{planning.overview}</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      {planning.recommendations.map((recommendation) => (
                        <div key={`${recommendation.title}-${recommendation.action}`}>
                          <div style={{ color: C.cream, fontSize: 14, fontFamily: 'system-ui, sans-serif', marginBottom: 4 }}>{recommendation.title}</div>
                          <div style={{ color: C.gold, fontSize: 13, fontFamily: 'system-ui, sans-serif', lineHeight: 1.45 }}>{recommendation.action}</div>
                          <div style={{ color: C.faint, fontSize: 12, fontFamily: 'system-ui, sans-serif', lineHeight: 1.45, marginTop: 3 }}>{recommendation.reason}</div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : <div style={{ color: C.faint, fontSize: 12, fontFamily: 'system-ui, sans-serif' }}>{planningError}</div>}
              </section>
            )}

            {/* Per-guest substitution plan — group by guest so the chef sees
                what each cover receives if it differs from the main. */}
            {courses.length > 0 && (() => {
              const perGuest = new Map<string, { slotLabel: string; dishName: string }[]>()
              for (const c of courses) {
                if (!c.substitutions || c.origin === 'empty') continue
                for (const sub of c.substitutions) {
                  for (const g of sub.guests) {
                    const list = perGuest.get(g) ?? []
                    list.push({ slotLabel: c.slotLabel, dishName: sub.dishName })
                    perGuest.set(g, list)
                  }
                }
              }
              const unmet = courses.flatMap((c) =>
                c.excludes
                  .filter(
                    (e) => !(c.substitutions ?? []).some((s) => s.guests.includes(e.guest))
                  )
                  .map((e) => ({
                    slotLabel: c.slotLabel,
                    guest: e.guest,
                    reason: e.reason,
                    kind: e.kind,
                  }))
              )

              if (perGuest.size === 0 && unmet.length === 0) return null

              return (
                <section className="sv2-intel-card" style={{ ...card, marginTop: 14 }}>
                  <div style={cardTitle}>Substitution plan</div>
                  <div
                    style={{
                      color: C.faint,
                      fontSize: 12,
                      marginTop: 4,
                      marginBottom: 12,
                      fontFamily: 'system-ui, sans-serif',
                    }}
                  >
                    What each guest gets when the main course doesn’t fit them.
                  </div>
                  {Array.from(perGuest.entries()).map(([guest, subs]) => (
                    <div
                      key={guest}
                      style={{
                        marginBottom: 10,
                        paddingBottom: 8,
                        borderBottom: `1px dashed ${C.line}`,
                      }}
                    >
                      <div
                        style={{
                          color: C.gold,
                          fontSize: 13,
                          fontFamily: 'system-ui, sans-serif',
                          fontWeight: 600,
                          marginBottom: 4,
                        }}
                      >
                        {guest}
                      </div>
                      {subs.map((s, i) => (
                        <div
                          key={i}
                          style={{
                            color: C.cream,
                            fontSize: 13,
                            fontFamily: 'system-ui, sans-serif',
                            lineHeight: 1.55,
                          }}
                        >
                          <span style={{ color: C.dim }}>{s.slotLabel}:</span> {s.dishName}
                        </div>
                      ))}
                    </div>
                  ))}
                  {unmet.length > 0 && (
                    <div
                      style={{
                        color: C.rose,
                        fontSize: 12,
                        fontFamily: 'system-ui, sans-serif',
                        lineHeight: 1.5,
                        marginTop: 6,
                      }}
                    >
                      No substitute available for:{' '}
                      {unmet
                        .map((u) => `${u.guest} on ${u.slotLabel} (${u.reason})`)
                        .join('; ')}
                      . Add more signatures to cover these.
                    </div>
                  )}
                </section>
              )
            })()}
          </>
        )}
      </div>
    </div>
    </>
  )
}

function Bar({
  label,
  n,
  total,
  tint,
  formatLabel = formatTagLabel,
}: {
  label: string
  n: number
  total: number
  tint: string
  formatLabel?: (label: string) => string
}) {
  const pct = total === 0 ? 0 : Math.round((n / total) * 100)
  return (
    <div className="sv2-intel-bar" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 9 }}>
      <span
        style={{
          color: C.dim,
          fontSize: 12,
          width: 78,
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {formatLabel(label)}
      </span>
      <div
        className="sv2-intel-bar-track"
        style={{
          flex: 1,
          height: 8,
          background: 'rgba(255,255,255,0.06)',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            borderRadius: 8,
            width: `${pct}%`,
            background: tint,
          }}
        />
      </div>
      <span
        style={{
          color: C.cream,
          fontSize: 12,
          width: 16,
          textAlign: 'right',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {n}
      </span>
    </div>
  )
}

const card: React.CSSProperties = {
  background: C.panel,
  border: `1px solid ${C.line}`,
  borderRadius: 18,
  padding: 18,
  marginBottom: 14,
}

const cardHeadRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  gap: 12,
}

const cardTitle: React.CSSProperties = {
  color: C.cream,
  fontSize: 17,
}

const brief: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  background: 'rgba(217,161,91,0.08)',
  border: '1px solid rgba(217,161,91,0.22)',
  borderRadius: 16,
  padding: '14px 16px',
  color: C.cream,
  fontSize: 14,
  lineHeight: 1.5,
  fontFamily: 'system-ui, sans-serif',
  marginTop: 4,
}
