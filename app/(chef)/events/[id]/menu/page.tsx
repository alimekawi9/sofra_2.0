'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import '@/components/sofra-v2/sofra-v2.css'
import { withoutDishRoles } from '@/lib/dish-presets'
import { normalizeProteinPreferences } from '@/lib/protein-preferences'
import { buildIntel } from '@/lib/intel'
import type { TasteProfile, TableIntel } from '@/lib/intel'
import { draftCourse, deriveMenu, inferSlot, portionGuidance } from '@/lib/menu'
import type { Course, Signature, PantryItem, Slot } from '@/lib/menu'
import { C } from '@/lib/theme'
import ChefTabs from '@/components/ChefTabs'
import { menuResponseLabel, newMenuResponseCount, newMenuResponseLabel } from '@/lib/menu-generation-snapshot'

type MenuDesignKey = 'folk' | 'doily' | 'stripe' | 'floral'

const MENU_DESIGNS: Array<{ key: MenuDesignKey; label: string; image: string }> = [
  { key: 'folk', label: 'Folk Garden', image: '/sofra/menu-frames/folk.png' },
  { key: 'doily', label: 'Paper Lace', image: '/sofra/menu-frames/doily.png' },
  { key: 'stripe', label: 'Garden Stripe', image: '/sofra/menu-frames/stripe.png' },
  { key: 'floral', label: 'Red Bloom', image: '/sofra/menu-frames/floral.png' },
]

function currentMonday(): string {
  const d = new Date()
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function buildMenuHtml(
  derivedCourses: Course[],
  guestCount: number,
  event: { title: string; event_date: string },
  design: MenuDesignKey = 'folk',
  origin = ''
): string {
  const selectedDesign = MENU_DESIGNS.find((option) => option.key === design) ?? MENU_DESIGNS[0]
  const frameUrl = `${origin}${selectedDesign.image}`
  const dateStr = new Date(event.event_date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const coursesHtml = derivedCourses
    .map((c) => `
        <div class="course">
          <div class="slot">${escHtml(c.slotLabel)}</div>
          <div class="dish">${escHtml(c.dishName) || 'TBD'}</div>
        </div>`)
    .join('')

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escHtml(event.title)} | Menu</title>
    <style>
      @page { size:A4; margin:0; }
      *{margin:0;padding:0;box-sizing:border-box;}
      body{font-family:Georgia,'Times New Roman',serif;background:#F3E9DD;color:#2A1A1C;
        display:flex;align-items:center;justify-content:center;min-height:100vh;padding:30px;}
      .menu{width:100%;max-width:600px;aspect-ratio:2/3;background:#FBF5EC url('${escHtml(frameUrl)}') center/100% 100% no-repeat;
        box-shadow:0 20px 60px rgba(0,0,0,0.12);position:relative;
        -webkit-print-color-adjust:exact;print-color-adjust:exact;}
      .copy{position:absolute;inset:12% 17% 11%;display:flex;text-align:center;flex-direction:column;overflow:hidden;}
      .menu.folk .copy{inset:14% 16% 11%;}.menu.stripe .copy{inset:11% 15%;}
      .brand{margin:0 0 9px;text-align:center;color:#5C1A1B;font-style:italic;font-size:29px;}
      .title{text-align:center;font-size:40px;color:#2A1A1C;line-height:1.04;margin:0;}
      .meta{text-align:center;color:#8A6A4E;font-size:9px;letter-spacing:1.3px;text-transform:uppercase;margin:11px 0 18px;font-family:system-ui,-apple-system,sans-serif;}
      .courses{display:flex;min-height:0;flex:1;flex-direction:column;justify-content:space-evenly;gap:6px;}
      .course{text-align:center;display:flex;flex-direction:column;gap:2px;}
      .slot{color:#9A7A2B;font-size:8px;letter-spacing:1.4px;text-transform:uppercase;font-family:system-ui,sans-serif;}
      .dish{font-size:22px;color:#2A1A1C;line-height:1.12;font-weight:normal;}
      .foot{text-align:center;margin:18px 0 0;color:#8A6A4E;font-size:12px;font-style:italic;}
      @media print{
        html,body{width:210mm;height:297mm;overflow:hidden;}
        body{background:#fff;padding:0;}
        .menu{box-shadow:none;width:184.667mm;height:277mm;max-width:none;aspect-ratio:auto;}
      }
    </style></head><body>
      <div class="menu ${design}">
        <div class="copy">
          <div class="brand">Sofra</div>
          <div class="title">${escHtml(event.title)}</div>
          <div class="meta">${dateStr} · ${guestCount} guest${guestCount !== 1 ? 's' : ''}</div>
          <div class="courses">${coursesHtml}</div>
          <div class="foot">Made for this table</div>
        </div>
      </div>
    </body></html>`
}

type PersistedCourse = {
  id: string
  menu_id: string
  slot: string
  dish_name: string
  dish_origin: string | null
  locked: boolean
  source: string | null
  sort_order: number
  component_ids: string[] | null
}

function mergeGuests(
  rsvps: Array<{ user_id: string; users: { name: string } | null }>,
  profiles: Array<{
    user_id: string
    dietary: string[]
    avoid: string[]
    protein_anchor: string | null
    protein_preferences?: string[]
    flavor_preference: string[]
    adventurousness: number
  }>
): TasteProfile[] {
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

function MenuDesignPreview({
  design,
  event,
  courses,
  guestCount,
}: {
  design: (typeof MENU_DESIGNS)[number]
  event: { title: string; event_date: string }
  courses: Course[]
  guestCount: number
}) {
  const date = new Date(event.event_date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  return (
    <article
      className={`sv2-print-menu-preview sv2-print-menu-${design.key}`}
      style={{ backgroundImage: `url(${design.image})`, color: design.key === 'stripe' ? '#43522f' : '#651719' }}
      aria-label={`${design.label} preview for ${event.title}`}
    >
      <div className="sv2-print-menu-copy">
        <p className="sv2-print-menu-brand">Sofra</p>
        <h2>{event.title}</h2>
        <p className="sv2-print-menu-meta">{date} · {guestCount} guest{guestCount === 1 ? '' : 's'}</p>
        <div className="sv2-print-menu-courses">
          {courses.map((course, index) => (
            <div key={`${course.slot}-${index}`}>
              <span>{course.slotLabel}</span>
              <strong>{course.dishName || 'TBD'}</strong>
            </div>
          ))}
        </div>
        <p className="sv2-print-menu-foot">Made for this table</p>
      </div>
    </article>
  )
}

export default function MenuPage({ params }: { params: { id: string } }) {
  const { id } = params
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState('')
  const [actionError, setActionError] = useState('')
  const [courses, setCourses] = useState<PersistedCourse[]>([])
  const [intel, setIntel] = useState<TableIntel | null>(null)
  const [signatures, setSignatures] = useState<Signature[]>([])
  const [pantry, setPantry] = useState<PantryItem[]>([])
  const [event, setEvent] = useState<{ title: string; event_date: string } | null>(null)
  const [generatedGuestCount, setGeneratedGuestCount] = useState<number | null>(null)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [popupBlocked, setPopupBlocked] = useState(false)
  const [exportStep, setExportStep] = useState<'draft' | 'choose' | 'preview'>('draft')
  const [menuDesign, setMenuDesign] = useState<MenuDesignKey>('folk')
  const [swapNoOptions, setSwapNoOptions] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiNotice, setAiNotice] = useState('')
  // Reasoning is not persisted; it only exists for the current AI session so
  // the chef can compare the two paths side by side.
  const [reasoningByCourseId, setReasoningByCourseId] = useState<Record<string, string>>({})

  const derivedCourses = useMemo<Course[]>(() => {
    if (!intel) return []
    return deriveMenu(courses, signatures, pantry, intel)
  }, [courses, intel, signatures, pantry])

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
      if (stored !== ev.host_id && stored !== ev.chef_id) {
        router.replace(`/events/${id}`)
        return
      }
      setEvent({ title: ev.title, event_date: ev.event_date })

      const { data: rsvps } = await supabase
        .from('rsvps')
        .select('user_id, users(name)')
        .eq('event_id', id)
        .in('status', ['going', 'maybe'])

      const userIds = (rsvps ?? []).map((r: { user_id: string }) => r.user_id)

      const { data: profiles } = userIds.length
        ? await supabase.from('taste_profiles').select('*').in('user_id', userIds)
        : {
            data: [] as Array<{
              user_id: string
              dietary: string[]
              avoid: string[]
              protein_anchor: string | null
              flavor_preference: string[]
              adventurousness: number
            }>,
          }

      const guests = mergeGuests(
        (rsvps ?? []) as unknown as Array<{ user_id: string; users: { name: string } | null }>,
        profiles ?? []
      )
      const builtIntel = buildIntel(guests)
      setIntel(builtIntel)

      const [{ data: sigs }, { data: pantryItems }] = await Promise.all([
        supabase
          .from('signatures')
          .select('id, name, tags, contains_allergens, slot, novelty_score, is_substantial')
          .eq('chef_id', stored),
        supabase
          .from('pantry_items')
          .select('id, name, tags, contains_allergens')
          .eq('chef_id', stored)
          .eq('week_of', currentMonday()),
      ])

      // Backfill: the signatures table gained a `slot` column but the Kitchen
      // UI never sets it, so every existing row is NULL. That made the rule-
      // based draftCourse filter out every signature and return empty slots.
      // Infer from tags/name and persist so future draws hit the fast path.
      // Fire-and-forget; we already use the inferred slot in memory below.
      const backfilled: Signature[] = (sigs ?? []).map((s: Signature) => {
        if (s.slot) return s
        const inferred = inferSlot(s.name, s.tags)
        if (!inferred) return s
        void supabase.from('signatures').update({ slot: inferred }).eq('id', s.id)
        return { ...s, slot: inferred }
      })
      setSignatures(backfilled)
      const roleFreePantry = (pantryItems ?? []).map((item: PantryItem) => ({
        ...item,
        tags: withoutDishRoles(item.tags),
      }))
      setPantry(roleFreePantry)

      const { data: menu } = await supabase
        .from('menus')
        .select('id,generated_guest_count,generated_at')
        .eq('event_id', id)
        .maybeSingle()

      if (menu) {
        setGeneratedGuestCount(menu.generated_guest_count ?? null)
        setGeneratedAt(menu.generated_at ?? null)
        const { data: rows } = await supabase
          .from('menu_courses')
          .select('*')
          .eq('menu_id', menu.id)
          .order('sort_order', { ascending: true })
        setCourses(rows ?? [])
      } else {
        setCourses([])
        setGeneratedGuestCount(null)
        setGeneratedAt(null)
      }
    } catch {
      setFetchError("Couldn't load the menu. Try again.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadAll() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSwap(course: PersistedCourse) {
    if (!intel) return
    setActionError('')
    const exclude = new Set(course.source ? [course.source] : [])
    const next = draftCourse(course.slot as Slot, intel, signatures, pantry, exclude)

    if (next.origin === 'empty') {
      setSwapNoOptions(course.id)
      setTimeout(() => setSwapNoOptions(null), 2000)
      return
    }

    const prev = courses
    setCourses(
      courses.map((c) =>
        c.id === course.id
          ? {
              ...c,
              dish_name: next.dishName,
              dish_origin: next.origin,
              source: next.sourceId,
              component_ids: next.componentIds ?? null,
            }
          : c
      )
    )
    const { error } = await supabase
      .from('menu_courses')
      .update({
        dish_name: next.dishName,
        dish_origin: next.origin,
        source: next.sourceId,
        component_ids: next.componentIds ?? null,
      })
      .eq('id', course.id)
    if (error) {
      setCourses(prev)
      setActionError('Failed to swap dish. Try again.')
    }
  }

  async function handleLock(course: PersistedCourse) {
    setActionError('')
    const newLocked = !course.locked
    const prev = courses
    setCourses(courses.map((c) => (c.id === course.id ? { ...c, locked: newLocked } : c)))
    const { error } = await supabase
      .from('menu_courses')
      .update({ locked: newLocked })
      .eq('id', course.id)
    if (error) {
      setCourses(prev)
      setActionError('Failed to update lock. Try again.')
    }
  }

  async function handleRegenerateAI() {
    if (!id || !intel || aiLoading) return
    setActionError('')
    setAiNotice('')
    const unlocked = courses.filter((c) => !c.locked)
    if (courses.length > 0 && unlocked.length === 0) return

    setAiLoading(true)
    try {
      const res = await fetch('/api/menu/generate-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: id, userId: localStorage.getItem('sofra_user_id') }),
      })

      if (!res.ok) {
        setActionError('Menu generation failed. Try again.')
        return
      }

      const result = (await res.json()) as {
        rows?: PersistedCourse[]
        courses?: Course[]
        aiFailed: boolean
        fallbackReason?: string
        reasoningByName?: Record<string,string>
        generatedGuestCount?: number
        generatedAt?: string
      }

      if (result.aiFailed) {
        setAiNotice(
          `AI generation unavailable\nShowing rule-based draft instead${
            result.fallbackReason ? ` (${result.fallbackReason})` : ''
          }.`
        )
      }

      if (result.rows) {
        setCourses(result.rows)
        if (typeof result.generatedGuestCount === 'number') setGeneratedGuestCount(result.generatedGuestCount)
        if (result.generatedAt) setGeneratedAt(result.generatedAt)
        setReasoningByCourseId(Object.fromEntries(result.rows.flatMap(row => {
          const reasoning = result.reasoningByName?.[row.dish_name]
          return reasoning ? [[row.id, reasoning]] : []
        })))
        return
      }

      // Map AI courses back onto persisted courses by slot; only update unlocked.
      const bySlot = new Map<string, Course>()
      for (const c of result.courses ?? []) bySlot.set(c.slot, c)

      const updates = unlocked.map((c) => ({
        id: c.id,
        next: bySlot.get(c.slot),
      })).filter((u): u is { id: string; next: Course } => !!u.next)

      const prev = courses
      const prevReasoning = reasoningByCourseId

      setCourses(
        courses.map((c) => {
          const upd = updates.find((u) => u.id === c.id)
          if (!upd) return c
          return {
            ...c,
            dish_name: upd.next.dishName,
            dish_origin: upd.next.origin,
            source: upd.next.sourceId,
            component_ids: upd.next.componentIds ?? null,
          }
        })
      )

      // Store reasoning locally (not persisted) for the AI-updated courses.
      const nextReasoning: Record<string, string> = { ...reasoningByCourseId }
      for (const u of updates) {
        if (u.next.reasoning) nextReasoning[u.id] = u.next.reasoning
        else delete nextReasoning[u.id]
      }
      setReasoningByCourseId(nextReasoning)

      const results = await Promise.all(
        updates.map(({ id: cid, next }) =>
          supabase
            .from('menu_courses')
            .update({
              dish_name: next.dishName,
              dish_origin: next.origin,
              source: next.sourceId,
              component_ids: next.componentIds ?? null,
            })
            .eq('id', cid)
        )
      )
      if (results.some((r) => r.error)) {
        setCourses(prev)
        setReasoningByCourseId(prevReasoning)
        setActionError('Failed to save AI menu. Try again.')
      }
    } catch {
      setActionError('AI generation failed. Try again.')
    } finally {
      setAiLoading(false)
    }
  }

  function handleGeneratePdf() {
    setPopupBlocked(false)
    if (!event || !intel) return
    const win = window.open('', '_blank')
    if (!win) {
      setPopupBlocked(true)
      return
    }
    win.document.write(buildMenuHtml(derivedCourses, intel.guestCount, event, menuDesign, window.location.origin))
    win.addEventListener('load', () => setTimeout(() => win.print(), 150))
    win.document.close()
  }

  const allLocked = courses.length > 0 && courses.every((c) => c.locked)
  const responseCount = intel?.guestCount ?? 0
  const newResponseCount = newMenuResponseCount(responseCount, generatedGuestCount)

  const dateSub = event
    ? new Date(event.event_date).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })
    : undefined

  const selectedMenuDesign = MENU_DESIGNS.find((option) => option.key === menuDesign) ?? MENU_DESIGNS[0]

  if (!loading && !fetchError && event && intel && exportStep !== 'draft') {
    return (
      <div className="sv2-root sv2-menu-design-page">
        <main className="sv2-menu-design-shell">
          {exportStep === 'choose' ? (
            <>
              <button className="sv2-menu-design-back" type="button" onClick={() => setExportStep('draft')}>
                Back to drafted menu
              </button>
              <section className="sv2-menu-design-chooser" aria-labelledby="choose-menu-title">
                <h1 id="choose-menu-title">Choose your menu</h1>
                <div className="sv2-menu-design-grid">
                  {MENU_DESIGNS.map((option) => (
                    <button
                      type="button"
                      key={option.key}
                      className="sv2-menu-design-option"
                      aria-pressed={menuDesign === option.key}
                      onClick={() => setMenuDesign(option.key)}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={option.image} alt={`${option.label} menu design`} />
                      <span>{option.label}</span>
                    </button>
                  ))}
                </div>
                <button className="sv2-menu-design-confirm" type="button" onClick={() => setExportStep('preview')}>
                  That one
                </button>
              </section>
            </>
          ) : (
            <>
              <div className="sv2-menu-preview-heading">
                <button className="sv2-menu-design-back" type="button" onClick={() => setExportStep('choose')}>
                  Choose another design
                </button>
                <h1>Drafted menu</h1>
              </div>
              <MenuDesignPreview
                design={selectedMenuDesign}
                event={event}
                courses={derivedCourses}
                guestCount={intel.guestCount}
              />
              <button className="sv2-menu-design-confirm" type="button" onClick={handleGeneratePdf}>
                Print menu
              </button>
              {popupBlocked && <p className="sv2-menu-popup-warning">Allow popups for Sofra, then try printing again.</p>}
            </>
          )}
        </main>
      </div>
    )
  }

  return (
    <div
      className="sv2-root sv2-device-page sv2-app-page sv2-production-menu-draft"
      style={{
        minHeight: '100vh',
        background: C.ink,
        fontFamily: 'Georgia, serif',
        paddingBottom: 120,
      }}
    >
      <div
        className="fade sv2-device-shell sv2-app-shell sv2-menu-draft-shell"
        style={{ maxWidth: 440, margin: '0 auto', padding: '22px 20px 32px' }}
      >
        <ChefTabs
          eventId={id}
          active="menu"
          title={event?.title}
          subtitle={
            dateSub
              ? `${dateSub}${intel ? ` · ${intel.guestCount} guests` : ''}`
              : undefined
          }
        />

        {loading && (
          <div style={{ color: C.dim, fontSize: 13, fontFamily: 'system-ui, sans-serif', padding: 20 }}>
            Loading…
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

        {!loading && !fetchError && (
          <>
            {/* Header row */}
            <div
              className="sv2-menu-draft-heading"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: 16,
              }}
            >
              <div>
                <div style={{ color: C.cream, fontSize: 22 }}>Tonight’s draft</div>
                <div
                  style={{
                    color: C.dim,
                    fontSize: 13,
                    marginTop: 4,
                    fontFamily: 'system-ui, sans-serif',
                    maxWidth: 260,
                    lineHeight: 1.4,
                  }}
                >
                  Composed for this table. Every dish is allergy-safe by construction.
                </div>
              </div>
            </div>

            <section className="sv2-rsvp-progress" aria-label="RSVP response progress">
              <strong>{menuResponseLabel(responseCount)}</strong>
              <span>Going and maybe responses currently included in table planning.</span>
            </section>

            {courses.length > 0 && generatedGuestCount !== null && (
              <p className="sv2-menu-generation-stamp" title={generatedAt ? `Generated ${new Date(generatedAt).toLocaleString()}` : undefined}>
                Generated for {generatedGuestCount} guest{generatedGuestCount === 1 ? '' : 's'}
              </p>
            )}

            {courses.length > 0 && newResponseCount > 0 && (
              <section className="sv2-menu-rsvp-alert" role="status">
                <div>
                  <strong>{newMenuResponseLabel(newResponseCount)}</strong>
                  <span>The current menu has not changed.</span>
                </div>
                <button type="button" onClick={() => void handleRegenerateAI()} disabled={allLocked || aiLoading}>
                  {aiLoading ? 'Regenerating…' : 'Regenerate'}
                </button>
              </section>
            )}

            {aiNotice && (
              <p
                style={{
                  color: C.gold,
                  fontSize: 13,
                  marginBottom: 12,
                  fontFamily: 'system-ui, sans-serif',
                  lineHeight: 1.45,
                  whiteSpace: 'pre-line',
                }}
              >
                {aiNotice}
              </p>
            )}

            {actionError && (
              <p style={{ color: C.rose, fontSize: 13, marginBottom: 12, fontFamily: 'system-ui, sans-serif' }}>
                {actionError}
              </p>
            )}

            {courses.length === 0 && (
              <div className="sv2-menu-draft-empty">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="sv2-menu-draft-empty-illustration"
                  src="/design-preview/menu-draft-table.png"
                  alt=""
                />
                <p
                  style={{
                    color: C.dim,
                    fontSize: 13,
                    fontFamily: 'system-ui, sans-serif',
                    maxWidth: 260,
                    lineHeight: 1.5,
                  }}
                >
                  Nothing drafted yet
                  <br />
                  Tap <strong>Set the Table</strong> to compose your first draft.
                </p>
              </div>
            )}

            {derivedCourses.map((derived, idx) => {
              const persisted = courses[idx]
              if (!persisted) return null
              const isLocked = persisted.locked
              // Every excluded guest has a substitute → still "serves the whole
              // table" (main dish for most, alt for the rest).
              const excludedGuestsWithSub = new Set(
                (derived.substitutions ?? []).flatMap((s) => s.guests)
              )
              const allExcludedCovered = derived.excludes.every((e) =>
                excludedGuestsWithSub.has(e.guest)
              )
              const ok =
                derived.origin !== 'empty' &&
                (derived.excludes.length === 0 || allExcludedCovered)
              return (
                <article
                  className={`sv2-menu-draft-course${isLocked ? ' sv2-menu-draft-course-locked' : ''}`}
                  key={persisted.id}
                  style={{
                    background: C.panel,
                    border: `1px solid ${isLocked ? 'rgba(217,161,91,0.4)' : C.line}`,
                    borderRadius: 18,
                    padding: 16,
                    marginBottom: 12,
                  }}
                >
                  <div
                    className={`sv2-menu-table-fit${ok ? ' sv2-menu-table-fit-ok' : ''}`}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 8,
                    }}
                  >
                    <span
                      style={{
                        color: C.gold,
                        fontSize: 11,
                        letterSpacing: 1.5,
                        textTransform: 'uppercase',
                        fontFamily: 'system-ui, sans-serif',
                        fontWeight: 600,
                      }}
                    >
                      {derived.slotLabel}
                    </span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="mini"
                        disabled={isLocked}
                        onClick={() => !isLocked && void handleSwap(persisted)}
                      >
                        Swap
                      </button>
                      <button
                        className="mini"
                        onClick={() => void handleLock(persisted)}
                      >
                        {isLocked ? 'Locked ✓' : 'Lock'}
                      </button>
                    </div>
                  </div>
                  <div style={{ color: C.cream, fontSize: 19 }}>
                    {derived.dishName || 'TBD'}
                  </div>
                  {reasoningByCourseId[persisted.id] && (
                    <div
                      style={{
                        color: C.gold,
                        fontSize: 12,
                        marginTop: 5,
                        fontStyle: 'italic',
                        fontFamily: 'Georgia, serif',
                        lineHeight: 1.45,
                        opacity: 0.9,
                      }}
                    >
                      ✦ {reasoningByCourseId[persisted.id]}
                    </div>
                  )}
                  <div
                    style={{
                      color: C.faint,
                      fontSize: 12,
                      marginTop: 3,
                      fontStyle: 'italic',
                    }}
                  >
                    {derived.origin === 'signature' && 'Chef’s signature'}
                    {derived.origin === 'pantry-composed' && 'Composed for this table'}
                    {derived.origin === 'fallback' && 'Chef’s adaptation (best available for this slot)'}
                    {derived.origin === 'empty' && <>No signatures yet<br />Add one in Kitchen</>}
                  </div>
                  {derived.origin !== 'empty' && (
                    <div
                      style={{
                        color: C.faint,
                        fontSize: 11,
                        letterSpacing: 1,
                        textTransform: 'uppercase',
                        marginTop: 6,
                        fontFamily: 'system-ui, sans-serif',
                      }}
                    >
                      {portionGuidance(derived.slot, intel?.guestCount)}
                    </div>
                  )}

                  <div
                    style={{
                      border: `1px solid ${
                        ok
                          ? 'rgba(138,160,110,0.3)'
                          : 'rgba(224,119,107,0.3)'
                      }`,
                      borderRadius: 12,
                      padding: '9px 12px',
                      marginTop: 12,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13,
                        fontFamily: 'system-ui, sans-serif',
                        fontWeight: 600,
                        color: ok ? C.sage : C.gold,
                      }}
                    >
                      {derived.origin === 'empty'
                        ? 'Draft a dish for this slot'
                        : allExcludedCovered && derived.excludes.length > 0
                        ? `✓ Table fit: safe for ${intel?.guestCount ?? 0}/${intel?.guestCount ?? 0} guests`
                        : ok
                        ? `✓ Table fit: safe for ${intel?.guestCount ?? 0}/${intel?.guestCount ?? 0} guests`
                        : `Table fit: safe for ${(intel?.guestCount ?? 0) - derived.excludes.length}/${intel?.guestCount ?? 0} guests`}
                    </div>
                    {derived.excludes.length > 0 && (
                      <div
                        style={{
                          color: C.dim,
                          fontSize: 12,
                          marginTop: 4,
                          fontFamily: 'system-ui, sans-serif',
                          lineHeight: 1.45,
                        }}
                      >
                        Excludes{' '}
                        {derived.excludes.map((e) => `${e.guest} (${e.reason})`).join(', ')}
                      </div>
                    )}
                    {derived.substitutions && derived.substitutions.length > 0 && (
                      <div
                        style={{
                          marginTop: 8,
                          paddingTop: 8,
                          borderTop: `1px dashed ${C.line}`,
                        }}
                      >
                        <div
                          style={{
                            color: C.faint,
                            fontSize: 11,
                            letterSpacing: 1.2,
                            textTransform: 'uppercase',
                            fontFamily: 'system-ui, sans-serif',
                            marginBottom: 4,
                          }}
                        >
                          Guest alternates
                        </div>
                        {derived.substitutions.map((sub, si) => (
                          <div
                            key={si}
                            style={{
                              color: C.cream,
                              fontSize: 12,
                              marginBottom: 2,
                              fontFamily: 'system-ui, sans-serif',
                              lineHeight: 1.45,
                            }}
                          >
                            <span style={{ color: C.gold }}>{sub.guests.join(', ')}</span>{' '}
                            <span>get instead: {sub.dishName}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {derived.excludes.length > 0 &&
                      (!derived.substitutions || derived.substitutions.length === 0) && (
                        <div
                          style={{
                            color: C.rose,
                            fontSize: 12,
                            marginTop: 6,
                            fontFamily: 'system-ui, sans-serif',
                          }}
                        >
                          No substitute available
                          <br />
                          Add a signature that avoids these constraints.
                        </div>
                      )}
                  </div>

                  {swapNoOptions === persisted.id && (
                    <p
                      style={{
                        color: C.dim,
                        fontSize: 12,
                        marginTop: 6,
                        fontFamily: 'system-ui, sans-serif',
                      }}
                    >
                      No other options available
                    </p>
                  )}
                </article>
              )
            })}

            {responseCount <= 1 && (
              <p className="sv2-menu-response-notice">
                Only {responseCount} guest{responseCount === 1 ? ' has' : 's have'} responded so far. You can still generate a menu, but it may not reflect everyone.
              </p>
            )}
            <div className="sv2-menu-generate-row">
              <button
                type="button"
                className="regen"
                onClick={() => void handleRegenerateAI()}
                disabled={allLocked || aiLoading}
                title={allLocked ? 'Everything is locked' : courses.length > 0 ? 'Create a fresh menu draft' : 'Create your menu draft'}
              >
                {aiLoading ? 'Setting the Table…' : courses.length > 0 ? 'Regenerate' : 'Set the Table'}
              </button>
            </div>

            <div
              className="sv2-menu-export-row"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                marginTop: 18,
                flexWrap: 'wrap',
              }}
            >
              <button className="prim" onClick={() => setExportStep('choose')}>
                Generate menu PDF
              </button>
              <span
                style={{
                  color: C.faint,
                  fontSize: 12,
                  fontFamily: 'system-ui, sans-serif',
                }}
              >
                Opens a print-ready menu
                <br />
                Save as PDF or print.
              </span>
            </div>

            {popupBlocked && (
              <p
                style={{
                  color: C.dim,
                  fontSize: 13,
                  marginTop: 12,
                  fontFamily: 'system-ui, sans-serif',
                }}
              >
                Your browser blocked the print window. Allow popups for this site and try again.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
