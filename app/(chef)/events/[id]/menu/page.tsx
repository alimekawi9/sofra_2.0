'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { buildIntel } from '@/lib/intel'
import type { TasteProfile, TableIntel } from '@/lib/intel'
import { draftCourse, draftMenu, deriveMenu, inferSlot, portionGuidance, SLOT_LABELS } from '@/lib/menu'
import type { Course, Signature, PantryItem, Slot } from '@/lib/menu'
import { C } from '@/lib/theme'
import ChefTabs from '@/components/ChefTabs'

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
  event: { title: string; event_date: string }
): string {
  const dateStr = new Date(event.event_date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const coursesHtml = derivedCourses
    .map((c) => {
      const originLabel =
        c.origin === 'signature'
          ? 'Signature'
          : c.origin === 'pantry-composed'
          ? 'Composed for this table'
          : c.origin === 'fallback'
          ? 'Chef’s adaptation'
          : ''
      const substitutionsHtml =
        c.substitutions && c.substitutions.length > 0
          ? `<div class="subs"><div class="subs-h">Guest alternates</div>${c.substitutions
              .map(
                (s) =>
                  `<div class="sub"><span class="sub-g">${escHtml(s.guests.join(', '))}</span> get instead: ${escHtml(s.dishName)}</div>`
              )
              .join('')}</div>`
          : ''
      const unmetHtml =
        c.excludes.length > 0 && (!c.substitutions || c.substitutions.length === 0)
          ? `<div class="alt">Alternative required for: ${c.excludes
              .map((e) => `${escHtml(e.guest)} (${escHtml(e.reason)})`)
              .join(', ')}</div>`
          : ''
      const portionHtml =
        c.origin === 'empty'
          ? ''
          : `<div class="portion">${escHtml(portionGuidance(c.slot))}</div>`
      return `
        <div class="course">
          <div class="slot">${escHtml(c.slotLabel)}</div>
          <div class="dish">${escHtml(c.dishName) || '— TBD —'}</div>
          ${originLabel ? `<div class="origin">${originLabel}</div>` : ''}
          ${portionHtml}
          ${substitutionsHtml}
          ${unmetHtml}
        </div>`
    })
    .join('')

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escHtml(event.title)} — Menu</title>
    <style>
      @page { size:A4; margin:0; }
      *{margin:0;padding:0;box-sizing:border-box;}
      body{font-family:Georgia,'Times New Roman',serif;background:#F3E9DD;color:#2A1A1C;
        display:flex;align-items:center;justify-content:center;min-height:100vh;padding:40px;}
      .menu{width:100%;max-width:600px;background:#FBF5EC;padding:64px 56px 56px;
        border:1px solid #C9A96E;box-shadow:0 20px 60px rgba(0,0,0,0.12);position:relative;}
      .menu:before{content:"";position:absolute;inset:14px;border:1px solid #C9A96E;pointer-events:none;}
      .brand{text-align:center;color:#5C1A1B;font-style:italic;font-size:26px;letter-spacing:0.5px;}
      .rule{width:44px;height:2px;background:#C9A96E;margin:14px auto 26px;}
      .title{text-align:center;font-size:34px;color:#2A1A1C;line-height:1.15;margin-bottom:8px;}
      .meta{text-align:center;color:#8A6A4E;font-size:13px;letter-spacing:2px;text-transform:uppercase;margin-bottom:40px;font-family:system-ui,-apple-system,sans-serif;}
      .course{text-align:center;padding:18px 0;border-bottom:1px solid #E8D9C6;}
      .course:last-of-type{border-bottom:none;}
      .slot{color:#9A7A2B;font-size:11px;letter-spacing:2.5px;text-transform:uppercase;font-family:system-ui,sans-serif;margin-bottom:8px;}
      .dish{font-size:23px;color:#2A1A1C;line-height:1.25;}
      .origin{color:#8A6A4E;font-size:13px;font-style:italic;margin-top:5px;}
      .portion{color:#8A6A4E;font-size:11px;letter-spacing:1px;text-transform:uppercase;margin-top:4px;font-family:system-ui,sans-serif;}
      .alt{color:#9A7A2B;font-size:12px;margin-top:6px;font-family:system-ui,sans-serif;}
      .subs{margin-top:10px;padding-top:8px;border-top:1px dashed #C9A96E;font-family:system-ui,sans-serif;}
      .subs-h{color:#8A6A4E;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:4px;}
      .sub{color:#2A1A1C;font-size:12px;line-height:1.5;}
      .sub-g{color:#5C1A1B;font-style:italic;}
      .foot{text-align:center;margin-top:38px;color:#8A6A4E;font-size:12px;letter-spacing:1px;font-family:system-ui,sans-serif;}
      .foot .s{color:#5C1A1B;font-style:italic;font-family:Georgia,serif;font-size:15px;letter-spacing:0;}
      @media print{body{background:#FBF5EC;padding:0;}.menu{box-shadow:none;border:none;max-width:none;}}
    </style></head><body>
      <div class="menu">
        <div class="brand">Sofra</div>
        <div class="rule"></div>
        <div class="title">${escHtml(event.title)}</div>
        <div class="meta">${dateStr} · ${guestCount} cover${guestCount !== 1 ? 's' : ''}</div>
        ${coursesHtml}
        <div class="foot">Curated for this table · <span class="s">Sofra</span></div>
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
      flavorPreference: p?.flavor_preference ?? [],
      adventurousness: p?.adventurousness ?? 50,
    }
  })
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
  const [popupBlocked, setPopupBlocked] = useState(false)
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
          .select('id, name, tags, contains_allergens, slot')
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
      // Fire-and-forget — we already use the inferred slot in memory below.
      const backfilled: Signature[] = (sigs ?? []).map((s: Signature) => {
        if (s.slot) return s
        const inferred = inferSlot(s.name, s.tags)
        if (!inferred) return s
        void supabase.from('signatures').update({ slot: inferred }).eq('id', s.id)
        return { ...s, slot: inferred }
      })
      setSignatures(backfilled)
      setPantry(pantryItems ?? [])

      const { data: menu } = await supabase
        .from('menus')
        .select('id')
        .eq('event_id', id)
        .maybeSingle()

      if (menu) {
        const { data: rows } = await supabase
          .from('menu_courses')
          .select('*')
          .eq('menu_id', menu.id)
          .order('sort_order', { ascending: true })
        setCourses(rows ?? [])
      } else {
        const drafted = draftMenu(builtIntel, backfilled, pantryItems ?? [])
        const { data: newMenu, error: menuErr } = await supabase
          .from('menus')
          .insert({ event_id: id })
          .select('id')
          .single()
        if (menuErr || !newMenu) throw new Error('menu insert failed')

        const inserts = drafted.map((c, i) => ({
          menu_id: newMenu.id,
          slot: c.slot,
          dish_name: c.dishName,
          dish_origin: c.origin,
          source: c.sourceId,
          component_ids: c.componentIds ?? null,
          locked: false,
          sort_order: i,
        }))
        const { data: rows } = await supabase
          .from('menu_courses')
          .insert(inserts)
          .select('*')
        setCourses(rows ?? [])
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
    if (!intel) return
    setActionError('')
    setAiNotice('')
    const unlocked = courses.filter((c) => !c.locked)
    if (unlocked.length === 0) return

    setAiLoading(true)
    try {
      const res = await fetch('/api/menu/generate-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intel, signatures, pantry }),
      })

      if (!res.ok) {
        setActionError('AI generation failed. The rule-based draft is still on screen.')
        return
      }

      const result = (await res.json()) as {
        courses: Course[]
        aiFailed: boolean
        fallbackReason?: string
      }

      if (result.aiFailed) {
        setAiNotice(
          `AI generation unavailable — showing rule-based draft instead${
            result.fallbackReason ? ` (${result.fallbackReason})` : ''
          }.`
        )
      }

      // Map AI courses back onto persisted courses by slot; only update unlocked.
      const bySlot = new Map<string, Course>()
      for (const c of result.courses) bySlot.set(c.slot, c)

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
    win.document.write(buildMenuHtml(derivedCourses, intel.guestCount, event))
    win.addEventListener('load', () => setTimeout(() => win.print(), 150))
    win.document.close()
  }

  const allLocked = courses.length > 0 && courses.every((c) => c.locked)

  const dateSub = event
    ? new Date(event.event_date).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })
    : undefined

  return (
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
          active="menu"
          title={event?.title}
          subtitle={
            dateSub
              ? `${dateSub}${intel ? ` · ${intel.guestCount} covers` : ''}`
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
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button
                  className="regen"
                  onClick={() => void handleRegenerateAI()}
                  disabled={allLocked || aiLoading}
                  title={
                    allLocked
                      ? 'Everything is locked'
                      : aiLoading
                      ? 'AI is thinking…'
                      : 'Compose a fresh draft with Gemini'
                  }
                  style={{
                    ...(allLocked || aiLoading
                      ? { opacity: 0.5, cursor: 'not-allowed' }
                      : undefined),
                    borderColor: C.gold,
                    color: C.gold,
                  }}
                >
                  {aiLoading ? '✦ Thinking…' : '✦ Set the Table'}
                </button>
              </div>
            </div>

            {aiNotice && (
              <p
                style={{
                  color: C.gold,
                  fontSize: 13,
                  marginBottom: 12,
                  fontFamily: 'system-ui, sans-serif',
                  lineHeight: 1.45,
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
                <div
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
                    {derived.dishName || '— TBD —'}
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
                    {derived.origin === 'empty' && 'No signatures yet — add one in Kitchen'}
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
                      {portionGuidance(derived.slot)}
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
                        ? '— Draft a dish for this slot'
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
                          No substitute available — add a signature that avoids these constraints.
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
                </div>
              )
            })}

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                marginTop: 18,
                flexWrap: 'wrap',
              }}
            >
              <button className="prim" onClick={handleGeneratePdf}>
                ⎙ Generate menu PDF
              </button>
              <span
                style={{
                  color: C.faint,
                  fontSize: 12,
                  fontFamily: 'system-ui, sans-serif',
                }}
              >
                Opens a print-ready menu — save as PDF or print.
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
