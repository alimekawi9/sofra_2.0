'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { buildIntel } from '@/lib/intel'
import type { TasteProfile, TableIntel } from '@/lib/intel'
import { draftCourse, draftMenu, scoreDish, SLOT_LABELS, SLOTS } from '@/lib/menu'
import type { Course, Signature, PantryItem, Slot, CourseOrigin } from '@/lib/menu'

const C = {
  ink:         '#140E10',
  ink2:        '#1E1518',
  burgundy:    '#5C1A1B',
  burgundyLit: '#7A2324',
  cream:       '#F3E9DD',
  dim:         '#B7A493',
  faint:       '#7C6B5F',
  gold:        '#D9A15B',
  rose:        '#C97B6E',
}

function currentMonday(): string {
  const d   = new Date()
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
}

function mergeGuests(
  rsvps: Array<{ user_id: string; users: { name: string } | null }>,
  profiles: Array<{ user_id: string; dietary: string[]; avoid: string[]; drinks: string[]; adventurousness: number }>
): TasteProfile[] {
  return rsvps.map(r => {
    const p = profiles.find(x => x.user_id === r.user_id)
    return {
      name: r.users?.name ?? 'Unknown',
      dietary:         p?.dietary         ?? [],
      avoid:           p?.avoid           ?? [],
      drinks:          p?.drinks          ?? [],
      adventurousness: p?.adventurousness ?? 50,
    }
  })
}

export function buildMenuHtml(
  derivedCourses: Course[],
  guestCount: number,
  event: { title: string; event_date: string }
): string {
  const dateStr = new Date(event.event_date).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  })

  const coursesHtml = derivedCourses.map(c => {
    const originLabel =
      c.origin === 'signature'         ? 'Signature'
      : c.origin === 'pantry-composed' ? 'Pantry-composed'
      : ''

    const alternativeHtml = c.excludes.length > 0
      ? `<p style="font-size:12px;font-style:italic;color:#8C7560;margin-top:6px;">Alternative required for: ${
          c.excludes.map(e => `${e.guest} (${e.reason})`).join(', ')
        }</p>`
      : ''

    return `
      <div style="text-align:center;margin:32px 0;">
        <p style="font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:#8C7560;margin-bottom:8px;">
          ${c.slotLabel}
        </p>
        <p style="font-size:20px;margin-bottom:6px;">${c.dishName || '— TBD —'}</p>
        ${originLabel ? `<p style="font-size:12px;color:#8C7560;margin-bottom:${c.excludes.length > 0 ? '0' : '4px'};">${originLabel}</p>` : ''}
        ${alternativeHtml}
      </div>`
  }).join('')

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Menu — ${event.title}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0;}
    body{background:#F3E9DD;font-family:Georgia,serif;color:#2C1F16;min-height:100vh;display:flex;align-items:flex-start;justify-content:center;padding:48px 24px;}
    .page{width:100%;max-width:560px;border:1px solid #C9A96E;padding:48px 56px;}
    @media print{body{padding:0;}.page{border:1px solid #C9A96E;}}
  </style>
</head>
<body>
  <div class="page">
    <div style="text-align:center;margin-bottom:40px;border-bottom:1px solid #C9A96E;padding-bottom:32px;">
      <p style="font-style:italic;font-size:48px;letter-spacing:0.02em;margin-bottom:16px;">Sofra</p>
      <p style="font-size:18px;margin-bottom:8px;">${event.title}</p>
      <p style="font-size:13px;color:#8C7560;">${dateStr} · ${guestCount} cover${guestCount !== 1 ? 's' : ''}</p>
    </div>
    ${coursesHtml}
  </div>
</body>
</html>`
}

export default function MenuPage({ params }: { params: { id: string } }) {
  const { id } = params
  const router   = useRouter()
  const supabase = createClient()
  const uidRef   = useRef<string | null>(null)

  const [loading,       setLoading]       = useState(true)
  const [fetchError,    setFetchError]    = useState('')
  const [actionError,   setActionError]   = useState('')
  const [menuId,        setMenuId]        = useState<string | null>(null)
  const [courses,       setCourses]       = useState<PersistedCourse[]>([])
  const [intel,         setIntel]         = useState<TableIntel | null>(null)
  const [signatures,    setSignatures]    = useState<Signature[]>([])
  const [pantry,        setPantry]        = useState<PantryItem[]>([])
  const [event,         setEvent]         = useState<{ title: string; event_date: string } | null>(null)
  const [popupBlocked,  setPopupBlocked]  = useState(false)
  const [swapNoOptions, setSwapNoOptions] = useState<string | null>(null)

  const derivedCourses = useMemo<Course[]>(() => {
    if (!intel) return []
    return courses.map(c => {
      const slot      = c.slot as Slot
      const slotLabel = SLOT_LABELS[slot] ?? slot
      if (!c.dish_name || c.dish_origin === 'empty') {
        return { slot, slotLabel, dishName: '', origin: 'empty' as CourseOrigin, sourceId: null, excludes: [] }
      }
      let sourceDish: Signature | PantryItem | undefined
      if (c.dish_origin === 'signature') {
        sourceDish = signatures.find(s => s.id === c.source)
      } else if (c.dish_origin === 'pantry-composed') {
        sourceDish = pantry.find(p => p.id === c.source)
      }
      return {
        slot,
        slotLabel,
        dishName:  c.dish_name,
        origin:    (c.dish_origin as CourseOrigin) ?? 'empty',
        sourceId:  c.source,
        excludes:  sourceDish ? scoreDish(sourceDish, intel) : [],
      }
    })
  }, [courses, intel, signatures, pantry])

  async function loadAll() {
    setLoading(true)
    setFetchError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      uidRef.current = user.id

      const { data: ev, error: evErr } = await supabase
        .from('events')
        .select('host_id, chef_id, title, event_date')
        .eq('id', id)
        .single()
      if (evErr || !ev) { router.replace(`/events/${id}`); return }
      if (user.id !== ev.host_id && user.id !== ev.chef_id) {
        router.replace(`/events/${id}`); return
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
        : { data: [] as Array<{ user_id: string; dietary: string[]; avoid: string[]; drinks: string[]; adventurousness: number }> }

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
          .eq('chef_id', user.id),
        supabase
          .from('pantry_items')
          .select('id, name')
          .eq('chef_id', user.id)
          .eq('week_of', currentMonday()),
      ])
      setSignatures(sigs ?? [])
      setPantry(pantryItems ?? [])

      const { data: menu } = await supabase
        .from('menus')
        .select('id')
        .eq('event_id', id)
        .maybeSingle()

      if (menu) {
        setMenuId(menu.id)
        const { data: rows } = await supabase
          .from('menu_courses')
          .select('*')
          .eq('menu_id', menu.id)
          .order('sort_order', { ascending: true })
        setCourses(rows ?? [])
      } else {
        const drafted = draftMenu(builtIntel, sigs ?? [], pantryItems ?? [])
        const { data: newMenu, error: menuErr } = await supabase
          .from('menus')
          .insert({ event_id: id })
          .select('id')
          .single()
        if (menuErr || !newMenu) throw new Error('menu insert failed')
        setMenuId(newMenu.id)

        const inserts = drafted.map((c, i) => ({
          menu_id:     newMenu.id,
          slot:        c.slot,
          dish_name:   c.dishName,
          dish_origin: c.origin,
          source:      c.sourceId,
          locked:      false,
          sort_order:  i,
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
    setCourses(courses.map(c =>
      c.id === course.id
        ? { ...c, dish_name: next.dishName, dish_origin: next.origin, source: next.sourceId }
        : c
    ))
    const { error } = await supabase
      .from('menu_courses')
      .update({ dish_name: next.dishName, dish_origin: next.origin, source: next.sourceId })
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
    setCourses(courses.map(c => c.id === course.id ? { ...c, locked: newLocked } : c))
    const { error } = await supabase
      .from('menu_courses')
      .update({ locked: newLocked })
      .eq('id', course.id)
    if (error) {
      setCourses(prev)
      setActionError('Failed to update lock. Try again.')
    }
  }

  async function handleRegenerate() {
    if (!intel) return
    setActionError('')
    const unlocked = courses.filter(c => !c.locked)
    if (unlocked.length === 0) return

    const updates = unlocked.map(c => ({
      id: c.id,
      next: draftCourse(c.slot as Slot, intel, signatures, pantry),
    }))

    const prev = courses
    setCourses(courses.map(c => {
      const upd = updates.find(u => u.id === c.id)
      if (!upd) return c
      return { ...c, dish_name: upd.next.dishName, dish_origin: upd.next.origin, source: upd.next.sourceId }
    }))

    const results = await Promise.all(
      updates.map(({ id: cid, next }) =>
        supabase
          .from('menu_courses')
          .update({ dish_name: next.dishName, dish_origin: next.origin, source: next.sourceId })
          .eq('id', cid)
      )
    )
    if (results.some(r => r.error)) {
      setCourses(prev)
      setActionError('Failed to regenerate menu. Try again.')
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
    win.document.close()
    win.addEventListener('load', () => setTimeout(() => win.print(), 150))
  }

  const allLocked = courses.length > 0 && courses.every(c => c.locked)

  const cardStyle: React.CSSProperties = {
    padding: '16px 18px',
    borderRadius: 14,
    background: 'rgba(0,0,0,0.24)',
    border: '1px solid rgba(243,233,221,0.10)',
    marginBottom: 12,
  }

  const lockedCardStyle: React.CSSProperties = {
    ...cardStyle,
    border: `1px solid ${C.cream}`,
  }

  return (
    <>
      <style>{`@keyframes skPulse{0%,100%{opacity:.4}50%{opacity:.7}}`}</style>
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #1B1214 0%, #241619 100%)',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '24px 20px',
      }}>
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(ellipse 80% 40% at 50% 0%, rgba(217,161,91,0.18) 0%, transparent 70%)',
        }} />

        <h1 style={{
          fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 52,
          color: C.cream, textAlign: 'center', margin: '0 0 8px',
          position: 'relative', zIndex: 1,
        }}>Sofra</h1>

        {event && (
          <p style={{ color: C.dim, fontSize: 14, marginBottom: 24, position: 'relative', zIndex: 1 }}>
            {event.title}
          </p>
        )}

        <div style={{ width: '100%', maxWidth: 440, position: 'relative', zIndex: 1 }}>

          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[0,1,2,3,4].map(i => (
                <div key={i} style={{
                  height: 80, borderRadius: 14,
                  background: 'rgba(255,255,255,0.08)',
                  animation: 'skPulse 1.4s ease-in-out infinite',
                }} />
              ))}
            </div>
          )}

          {!loading && fetchError && (
            <div style={{ textAlign: 'center', paddingTop: 40 }}>
              <p style={{ color: C.rose, fontSize: 14, marginBottom: 16 }}>{fetchError}</p>
              <button
                onClick={() => void loadAll()}
                style={{
                  background: 'none', border: `1px solid ${C.dim}`,
                  borderRadius: 8, color: C.dim, padding: '8px 20px',
                  cursor: 'pointer', fontSize: 14,
                }}
              >Retry</button>
            </div>
          )}

          {!loading && !fetchError && (
            <>
              <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
                <button
                  onClick={() => void handleRegenerate()}
                  disabled={allLocked}
                  style={{
                    flex: 1, padding: '10px 16px', borderRadius: 10,
                    background: allLocked ? 'rgba(0,0,0,0.12)' : C.gold,
                    color: allLocked ? C.faint : C.ink,
                    border: 'none', fontSize: 14, fontWeight: 600,
                    cursor: allLocked ? 'default' : 'pointer',
                  }}
                  title={allLocked ? 'Everything is locked' : undefined}
                >
                  ↻ Regenerate
                </button>
                <button
                  onClick={handleGeneratePdf}
                  style={{
                    flex: 1, padding: '10px 16px', borderRadius: 10,
                    background: 'none', color: C.cream,
                    border: '1px solid rgba(243,233,221,0.24)',
                    fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  ↓ Generate menu PDF
                </button>
              </div>

              {popupBlocked && (
                <p style={{ color: C.dim, fontSize: 13, marginBottom: 16, textAlign: 'center' }}>
                  Your browser blocked the print window. Allow popups for this site and try again.
                </p>
              )}

              {actionError && (
                <p style={{ color: C.rose, fontSize: 13, marginBottom: 16 }}>{actionError}</p>
              )}

              {derivedCourses.map((derived, idx) => {
                const persisted = courses[idx]
                if (!persisted) return null
                const isLocked = persisted.locked

                return (
                  <div key={persisted.id} style={isLocked ? lockedCardStyle : cardStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <p style={{ flex: 1, color: C.dim, fontSize: 12 }}>
                        {derived.slotLabel}
                      </p>
                      <button
                        onClick={() => void handleLock(persisted)}
                        style={{
                          background: 'none', border: 'none',
                          color: isLocked ? C.gold : C.faint,
                          fontSize: 16, cursor: 'pointer', padding: '0 4px',
                        }}
                        title={isLocked ? 'Unlock' : 'Lock'}
                      >
                        {isLocked ? '🔒' : '🔓'}
                      </button>
                      <button
                        onClick={() => !isLocked && void handleSwap(persisted)}
                        disabled={isLocked}
                        style={{
                          background: 'none', border: 'none',
                          color: isLocked ? C.faint : C.cream,
                          fontSize: 16, cursor: isLocked ? 'default' : 'pointer', padding: '0 4px',
                          opacity: isLocked ? 0.4 : 1,
                        }}
                        title={isLocked ? 'Locked' : 'Swap'}
                      >
                        ↻
                      </button>
                    </div>

                    <p style={{ color: C.cream, fontSize: 17, fontWeight: 500, marginBottom: 4 }}>
                      {derived.dishName || '— TBD —'}
                    </p>

                    <p style={{ color: C.faint, fontSize: 12, marginBottom: derived.excludes.length > 0 ? 6 : 0 }}>
                      {derived.origin === 'signature' && 'signature'}
                      {derived.origin === 'pantry-composed' && 'pantry-composed · allergen check is a v1 substring heuristic'}
                      {derived.origin === 'empty' && 'No dish drafted — pantry and signatures are empty for this slot'}
                    </p>

                    {derived.excludes.length > 0 && (
                      <p style={{ color: C.rose, fontSize: 13 }}>
                        Serves {(intel?.guestCount ?? 0) - derived.excludes.length}/{intel?.guestCount ?? 0} — excludes{' '}
                        {derived.excludes.map(e => `${e.guest} (${e.reason})`).join(', ')}
                      </p>
                    )}

                    {derived.excludes.length === 0 && derived.origin !== 'empty' && (
                      <p style={{ color: C.cream, fontSize: 13 }}>Serves the whole table</p>
                    )}

                    {swapNoOptions === persisted.id && (
                      <p style={{ color: C.dim, fontSize: 12, marginTop: 4 }}>
                        No other options available
                      </p>
                    )}
                  </div>
                )
              })}
            </>
          )}
        </div>
      </div>
    </>
  )
}
