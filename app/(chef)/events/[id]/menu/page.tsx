'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getCurrentAppUserId } from '@/lib/auth/client-user'
import '@/components/sofra-v2/sofra-v2.css'
import { withoutDishRoles } from '@/lib/dish-presets'
import { normalizeProteinPreferences } from '@/lib/protein-preferences'
import { buildIntel } from '@/lib/intel'
import type { TasteProfile, TableIntel } from '@/lib/intel'
import { draftCourse, deriveMenu, inferSlot, portionGuidance } from '@/lib/menu'
import type { Course, Signature, PantryItem, Slot } from '@/lib/menu'
import { C } from '@/lib/theme'
import ChefTabs from '@/components/ChefTabs'
import SofraTransition from '@/components/SofraTransition'
import { hasEnoughGuestResponses, menuResponseGuidance, menuResponseLabel, shouldShowMenuExport } from '@/lib/menu-generation-snapshot'
import { isEventManager, fetchEventHostIds } from '@/lib/event-access'
import { guestHostLabel, guestHostBreakdown } from '@/lib/guest-host-count'
import { formatEventDate } from '@/lib/event-date'
import { PrintPreviewActions } from '@/components/sofra-v2/PrintPreviewActions'

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
  const date = formatEventDate(event.event_date, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  return (
    <article
      className={`sv2-print-menu-preview sv2-print-menu-${design.key}`}
      style={{ color: design.key === 'stripe' ? '#43522f' : '#651719' }}
      aria-label={`${design.label} preview for ${event.title}`}
    >
      {/* A real image prints reliably on mobile Safari; CSS backgrounds may be omitted. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="sv2-print-menu-frame" src={design.image} alt="" aria-hidden="true" />
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
  const [guestResponseCount, setGuestResponseCount] = useState(0)
  const [guestHostCounts, setGuestHostCounts] = useState({ guests: 0, hosts: 0 })
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [exportStep, setExportStep] = useState<'draft' | 'choose' | 'preview'>('draft')
  const [menuDesign, setMenuDesign] = useState<MenuDesignKey>('folk')
  const [swapNoOptions, setSwapNoOptions] = useState<string | null>(null)
  const [swapAiCourseId, setSwapAiCourseId] = useState<string | null>(null)
  const [addingAfterId, setAddingAfterId] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [aiNotice, setAiNotice] = useState('')
  const [kitchenStatus, setKitchenStatus] = useState<'pending' | 'complete'>('complete')
  const [kitchenWarningOpen, setKitchenWarningOpen] = useState(false)
  const [restrictedChef, setRestrictedChef] = useState(false)
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
      const stored = await getCurrentAppUserId(supabase)
      if (!stored) { router.push('/login'); return }

      const { data: ev, error: evErr } = await supabase
        .from('events')
        .select('host_id, chef_id, title, event_date, kitchen_status')
        .eq('id', id)
        .single()
      if (evErr || !ev) { router.replace(`/events/${id}`); return }
      if (stored !== ev.chef_id && !(await isEventManager(supabase, id, stored, ev.host_id))) {
        router.replace(`/events/${id}`)
        return
      }
      setEvent({ title: ev.title, event_date: ev.event_date })
      setKitchenStatus(ev.kitchen_status === 'pending' ? 'pending' : 'complete')
      setRestrictedChef(stored === ev.chef_id && stored !== ev.host_id && !(await isEventManager(supabase, id, stored, ev.host_id)))

      const hostIds = await fetchEventHostIds(supabase, id, ev.host_id)

      const { data: rsvps } = await supabase
        .from('rsvps')
        .select('user_id, users(name)')
        .eq('event_id', id)
        .in('status', ['going', 'maybe'])

      const userIds = (rsvps ?? []).map((r: { user_id: string }) => r.user_id)
      setGuestResponseCount(userIds.filter((userId) => !hostIds.has(userId)).length)
      setGuestHostCounts(guestHostBreakdown(userIds, hostIds))

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

      const kitchenOwnerId = ev.chef_id ?? ev.host_id
      const [{ data: sigs }, { data: pantryItems }] = await Promise.all([
        supabase
          .from('signatures')
          .select('id, name, tags, contains_allergens, slot, novelty_score, is_substantial')
          .eq('chef_id', kitchenOwnerId),
        supabase
          .from('pantry_items')
          .select('id, name, tags, contains_allergens')
          .eq('chef_id', kitchenOwnerId)
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

  // Shared by Swap and by a freshly-added empty course: try the deterministic
  // signature pool first, falling back to the AI swap route once that pool is
  // confirmed empty. `currentCourses` is threaded through explicitly (rather
  // than reading the `courses` state closure) since a caller may have just
  // inserted a new row and not yet seen React re-render with it.
  async function fillCourse(course: PersistedCourse, currentCourses: PersistedCourse[]): Promise<void> {
    if (!intel) return
    // Exclude every dish already used anywhere in this menu, not just this
    // slot's own dish -- otherwise the same signature could be offered as
    // e.g. both a main and a side at once.
    const exclude = new Set(currentCourses.map((c) => c.source).filter((s): s is string => !!s))
    const next = draftCourse(course.slot as Slot, intel, signatures, pantry, exclude)

    if (next.origin === 'empty') {
      const generated = await requestAiSwap(course)
      if (!generated) {
        setSwapNoOptions(course.id)
        setTimeout(() => setSwapNoOptions(null), 2000)
      }
      return
    }

    setCourses(
      currentCourses.map((c) =>
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
      setCourses(currentCourses)
      setActionError('Failed to swap dish. Try again.')
    }
  }

  async function handleSwap(course: PersistedCourse) {
    setActionError('')
    await fillCourse(course, courses)
  }

  // Adds a new course of the same role as `afterCourse`, appended at the end
  // of the menu, and immediately tries to fill it the same way Swap would --
  // the host shouldn't have to add a blank slot and then separately remember
  // to press Swap on it.
  async function handleAddCourse(afterCourse: PersistedCourse) {
    setActionError('')
    setAddingAfterId(afterCourse.id)
    try {
      const maxSortOrder = courses.reduce((max, c) => Math.max(max, c.sort_order), -1)
      const { data: created, error: insertError } = await supabase
        .from('menu_courses')
        .insert({
          menu_id: afterCourse.menu_id,
          slot: afterCourse.slot,
          dish_name: '',
          dish_origin: 'empty',
          sort_order: maxSortOrder + 1,
        })
        .select('*')
        .single()
      if (insertError || !created) {
        setActionError('Failed to add a course. Try again.')
        return
      }
      const row = created as PersistedCourse
      const nextCourses = [...courses, row]
      setCourses(nextCourses)
      await fillCourse(row, nextCourses)
    } finally {
      setAddingAfterId(null)
    }
  }

  async function handleRemoveCourse(course: PersistedCourse) {
    if (course.locked) return
    setActionError('')
    const prev = courses
    setCourses(courses.filter((c) => c.id !== course.id))
    const { error } = await supabase.from('menu_courses').delete().eq('id', course.id)
    if (error) {
      setCourses(prev)
      setActionError('Failed to remove the course. Try again.')
    }
  }

  // Deterministic swap only ever draws from stored signatures (draftCourse in
  // lib/menu.ts) -- once those run out for this slot, guest preferences alone
  // can still produce a good dish, so this asks the LLM for exactly one new
  // one. Only reached once the deterministic path has already come up empty,
  // so it never adds a network/LLM call to an ordinary swap.
  async function requestAiSwap(course: PersistedCourse): Promise<boolean> {
    setSwapAiCourseId(course.id)
    try {
      const res = await fetch('/api/menu/swap-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: id, courseId: course.id }),
      })
      if (!res.ok) return false
      const { row } = (await res.json()) as { row?: PersistedCourse }
      if (!row) return false
      setCourses((prev) => prev.map((c) => (c.id === course.id ? row : c)))
      return true
    } catch {
      return false
    } finally {
      setSwapAiCourseId(null)
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

  async function handleRegenerateAI(proceedWithoutKitchen = false) {
    if (!id || !intel || aiLoading) return
    if (kitchenStatus === 'pending' && !proceedWithoutKitchen) {
      setKitchenWarningOpen(true)
      return
    }
    setKitchenWarningOpen(false)
    setActionError('')
    setAiNotice('')
    const unlocked = courses.filter((c) => !c.locked)
    if (courses.length > 0 && unlocked.length === 0) return

    setAiLoading(true)
    try {
      const res = await fetch('/api/menu/generate-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: id, proceedWithoutKitchen }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { code?: string; error?: string }
        if (body.code === 'KITCHEN_UNFILLED') {
          setKitchenWarningOpen(true)
          return
        }
        setActionError(body.error ?? 'Menu generation failed. Try again.')
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

  function handlePreviewMenu() {
    setPreviewLoading(true)
    const image = new Image()
    const finish = () => {
      setExportStep('preview')
      setPreviewLoading(false)
    }
    image.onload = finish
    image.onerror = finish
    image.src = selectedMenuDesign.image
    if (image.complete) finish()
  }

  const allLocked = courses.length > 0 && courses.every((c) => c.locked)
  const responseCount = guestResponseCount

  const dateSub = event
    ? formatEventDate(event.event_date, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })
    : undefined

  const selectedMenuDesign = MENU_DESIGNS.find((option) => option.key === menuDesign) ?? MENU_DESIGNS[0]

  if (!loading && !fetchError && event && intel && exportStep !== 'draft') {
    return (
      <div className="sv2-root sv2-menu-design-page">
        <SofraTransition active={previewLoading} label="Setting the menu" />
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
                <button className="sv2-menu-design-confirm" type="button" onClick={handlePreviewMenu} disabled={previewLoading}>
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
              <PrintPreviewActions label="PRINT / SAVE MENU" />
            </>
          )}
        </main>
      </div>
    )
  }

  return (
    <div
      className={`sv2-root sv2-device-page sv2-app-page sv2-production-menu-draft${restrictedChef ? ' sv2-restricted-chef-page' : ''}`}
      style={{
        minHeight: '100vh',
        background: C.ink,
        fontFamily: 'Georgia, serif',
        paddingBottom: 120,
      }}
    >
      <SofraTransition active={loading || aiLoading} label={aiLoading ? 'Assembling the plates' : 'Setting the table'} />
      <div
        className="fade sv2-device-shell sv2-app-shell sv2-menu-draft-shell"
        style={{ maxWidth: 440, margin: '0 auto', padding: '22px 20px 32px' }}
      >
        <ChefTabs
          eventId={id}
          active="menu"
          restrictedChef={restrictedChef}
          title={event?.title}
          subtitle={
            dateSub
              ? `${dateSub}${intel ? ` · ${guestHostLabel(guestHostCounts.guests, guestHostCounts.hosts)}` : ''}`
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
              {shouldShowMenuExport(courses.length) && (
                <button type="button" className="sv2-recipes-print" onClick={() => setExportStep('choose')}>
                  Print menu
                </button>
              )}
            </div>

            <section className={`sv2-rsvp-progress ${hasEnoughGuestResponses(responseCount) ? 'is-ready' : 'is-low'}`} aria-label="RSVP response progress">
              <strong>{menuResponseLabel(responseCount)}</strong>
              <span>{menuResponseGuidance(responseCount)}</span>
            </section>

            {kitchenWarningOpen && (
              <section className="sv2-kitchen-warning" role="alert">
                <strong>THE KITCHEN IS STILL UNFILLED</strong>
                <p>You can complete the inventory first for a more grounded menu, or continue without it.</p>
                <div>
                  <button type="button" onClick={() => router.push(`/events/${id}/kitchen-setup?from_page=menu${restrictedChef ? '&delegate=1' : ''}`)}>OPEN KITCHEN</button>
                  <button type="button" onClick={() => void handleRegenerateAI(true)}>CONTINUE ANYWAY</button>
                </div>
              </section>
            )}

            {courses.length > 0 && generatedGuestCount !== null && (
              <p className="sv2-menu-generation-stamp" title={generatedAt ? `Generated ${new Date(generatedAt).toLocaleString()}` : undefined}>
                Generated for {generatedGuestCount} guest{generatedGuestCount === 1 ? '' : 's'}
              </p>
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
                  src="/sofra-table-mark.png"
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
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        className="sv2-menu-course-step"
                        aria-label={`Remove ${derived.dishName || 'this course'}`}
                        disabled={isLocked || aiLoading}
                        onClick={() => void handleRemoveCourse(persisted)}
                      >
                        −
                      </button>
                      <button
                        type="button"
                        className="sv2-menu-course-step"
                        aria-label={`Add another ${derived.slotLabel.toLowerCase()} course`}
                        disabled={aiLoading || addingAfterId === persisted.id}
                        onClick={() => void handleAddCourse(persisted)}
                      >
                        +
                      </button>
                      <button
                        className="mini"
                        disabled={isLocked || swapAiCourseId === persisted.id}
                        onClick={() => !isLocked && void handleSwap(persisted)}
                      >
                        {swapAiCourseId === persisted.id ? 'Finding a dish…' : 'Swap'}
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

          </>
        )}
      </div>
    </div>
  )
}
