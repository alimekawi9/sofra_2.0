'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { buildIntel } from '@/lib/intel'
import type { TasteProfile, TableIntel } from '@/lib/intel'
import { deriveCourse } from '@/lib/menu'
import type { Course, Signature, PantryItem } from '@/lib/menu'
import { C } from '@/lib/theme'
import ChefTabs from '@/components/ChefTabs'
import { formatTagLabel } from '@/lib/tag-format'
import { withoutDishRoles } from '@/lib/dish-presets'
import { formatProteinPreferenceLabel, normalizeProteinPreferences } from '@/lib/protein-preferences'
import { sortedQuestions, isCustom, type QuestionnaireConfig, type CustomQuestionConfig } from '@/lib/questionnaire'

type CustomAnswerSummary = {
  question: CustomQuestionConfig
  counts?: { label: string; count: number }[]
  texts?: string[]
}

function summarizeCustomAnswers(
  customQs: CustomQuestionConfig[],
  rows: Array<{ question_id: string; response: unknown }>
): CustomAnswerSummary[] {
  return customQs.map((q) => {
    const answers = rows.filter((r) => r.question_id === q.id).map((r) => r.response)
    if (q.type === 'text') {
      const texts = answers.filter((a): a is string => typeof a === 'string' && a.trim().length > 0)
      return { question: q, texts }
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
    return { question: q, counts }
  })
}

function currentMonday(): string {
  const d = new Date()
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)
}

type RsvpRow = { user_id: string; users: { name: string } | null }
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
      name: r.users?.name ?? 'Unknown',
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
  const [eventTitle, setEventTitle] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [courses, setCourses] = useState<Course[]>([])
  const [customAnswerSummaries, setCustomAnswerSummaries] = useState<CustomAnswerSummary[]>([])

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
      if (stored !== ev.host_id) { router.replace(`/events/${id}`); return }
      setEventTitle(ev.title)
      setEventDate(ev.event_date)

      const { data: rsvps } = await supabase
        .from('rsvps')
        .select('user_id, users(name)')
        .eq('event_id', id)
        .in('status', ['going', 'maybe'])

      const userIds = ((rsvps ?? []) as unknown as RsvpRow[]).map((r) => r.user_id)

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
          .select('id, name, tags, contains_allergens, slot')
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

        const customQs = qRow?.config?.questions?.length
          ? sortedQuestions(qRow.config as QuestionnaireConfig).filter(isCustom)
          : []

        if (customQs.length > 0) {
          const { data: responseRows } = userIds.length
            ? await supabase
                .from('event_question_responses')
                .select('question_id,response')
                .eq('event_id', id)
                .in('user_id', userIds)
            : { data: [] as Array<{ question_id: string; response: unknown }> }

          setCustomAnswerSummaries(summarizeCustomAnswers(customQs, responseRows ?? []))
        }
      } catch {
        // Swallowed deliberately -- see comment above.
      }
    } catch {
      setFetchError("Couldn't load table intel. Try again.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadAll() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const dateSub = eventDate
    ? new Date(eventDate).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })
    : undefined

  return (
    <>
    <style>{`@keyframes sofraPulse { 0%,100%{opacity:.4} 50%{opacity:.7} }`}</style>
    <div
      style={{
        minHeight: '100vh',
        background: C.ink,
        fontFamily: 'Georgia, serif',
        paddingBottom: 120,
      }}
    >
      <div
        className="fade"
        style={{ maxWidth: 440, margin: '0 auto', padding: '22px 20px 32px' }}
      >
        <ChefTabs
          eventId={id}
          active="table"
          title={eventTitle}
          subtitle={
            dateSub
              ? `${dateSub}${intel ? ` · ${intel.guestCount} covers` : ''}`
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
            {/* Hard limits */}
            <div style={{ ...card, borderColor: 'rgba(224,119,107,0.35)' }}>
              <div style={cardHeadRow}>
                <span style={cardTitle}>Hard Limits — non-negotiable</span>
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
                    Open table — no hard limits.
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
                        {limit.guests.join(', ')}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Diet mix + protein anchor grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div style={card}>
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
              </div>
              <div style={card}>
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
              </div>
            </div>

            {/* Flavor preference */}
            <div style={card}>
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
            </div>

            {/* Adventurousness */}
            <div style={card}>
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
            </div>

            {/* Brief */}
            <div style={brief}>
              <span style={{ color: C.gold, fontSize: 15 }}>✦</span>
              <span>{intel.brief}</span>
            </div>

            {/* Event-specific custom question answers — kept fully separate
                from canonical taste-profile data and menu scoring above. */}
            {customAnswerSummaries.length > 0 && (
              <div style={card}>
                <div style={cardTitle}>Event-Specific Answers</div>
                {customAnswerSummaries.map(({ question, counts, texts }) => (
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
                    ) : counts && counts.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {counts.map((c) => (
                          <div
                            key={c.label}
                            style={{ display: 'flex', justifyContent: 'space-between', gap: 12, color: C.dim, fontSize: 13, fontFamily: 'system-ui, sans-serif' }}
                          >
                            <span>{c.label}</span>
                            <span style={{ color: C.cream }}>{c.count}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ color: C.faint, fontSize: 12, fontFamily: 'system-ui, sans-serif' }}>No answers yet.</div>
                    )}
                  </div>
                ))}
              </div>
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
                <div style={{ ...card, marginTop: 14 }}>
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
                </div>
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 9 }}>
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
