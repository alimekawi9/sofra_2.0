'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { isEventManager } from '@/lib/event-access'
import { fetchEventTasteAttendees } from '@/lib/event-attendees'
import { buildIntel, type TasteProfile } from '@/lib/intel'
import { DISH_ROLES, type DishRole, withDishRole, withoutDishRoles } from '@/lib/dish-presets'
import { KITCHEN_ALLERGENS, SIGNATURE_TAG_GROUPS } from '@/lib/kitchen-tags'
import { formatTagLabel } from '@/lib/tag-format'
import {
  scoreConfirmedRestaurantDish,
  restaurantMenuSourceLabel,
  MAX_RESTAURANT_MENU_FILE_BYTES,
  RESTAURANT_NAME_SEARCH_MIN_LENGTH,
  RESTAURANT_NAME_SEARCH_DEBOUNCE_MS,
  type RestaurantDishProposal,
  type RestaurantMenu,
  type RestaurantMenuDish,
  type SimilarRestaurantMenu,
} from '@/lib/restaurant-menu'
import '@/components/sofra-v2/sofra-v2.css'

type DishDraft = { name: string; role: DishRole; tags: string[]; allergens: string[] }

function initialDraft(dish: RestaurantMenuDish): DishDraft {
  return { name: dish.name, role: dish.role, tags: withoutDishRoles(dish.tags), allergens: dish.contains_allergens }
}

function fileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('Could not read image'))
    reader.readAsDataURL(file)
  })
}

export default function RestaurantMenusPage({ params }: { params: { id: string } }) {
  const { id } = params
  const router = useRouter()
  const search = useSearchParams()
  const supabase = useMemo(() => createClient(), [])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [eventTitle, setEventTitle] = useState('')
  const [restrictedChef, setRestrictedChef] = useState(false)
  const [userId, setUserId] = useState('')
  const [restaurantName, setRestaurantName] = useState('')
  const [menuText, setMenuText] = useState('')
  const [menuFile, setMenuFile] = useState<File | null>(null)
  const [menus, setMenus] = useState<RestaurantMenu[]>([])
  const [guests, setGuests] = useState<TasteProfile[]>([])
  const [drafts, setDrafts] = useState<Record<string, DishDraft>>({})
  const [editingDishIds, setEditingDishIds] = useState<Set<string>>(new Set())
  const [addingAnotherMenu, setAddingAnotherMenu] = useState(false)
  const [similarMenu, setSimilarMenu] = useState<SimilarRestaurantMenu | null>(null)
  const [similarDismissed, setSimilarDismissed] = useState(false)
  const [reusing, setReusing] = useState(false)

  async function loadMenus(currentUserId: string) {
    const { data, error: loadError } = await supabase.rpc('get_event_restaurant_menus', {
      p_event_id: id,
      p_user_id: currentUserId,
    })
    if (loadError) throw loadError
    if (data === null) throw new Error('Not authorized')
    const loaded = (Array.isArray(data) ? data : []) as RestaurantMenu[]
    setMenus(loaded)
    setDrafts(Object.fromEntries(loaded.flatMap((menu) => menu.dishes.map((dish) => [dish.id, initialDraft(dish)]))))
  }

  async function load() {
    setLoading(true)
    setError('')
    try {
      const stored = localStorage.getItem('sofra_user_id')
      if (!stored) { router.push(`/login?next=${encodeURIComponent(`/events/${id}/out`)}`); return }
      const { data: event, error: eventError } = await supabase.from('events').select('host_id,chef_id,title').eq('id', id).maybeSingle()
      if (eventError || !event) throw eventError ?? new Error('Missing event')
      const manager = await isEventManager(supabase, id, stored, event.host_id)
      const assignedChef = event.chef_id === stored
      if (!manager && !assignedChef) { router.replace(`/events/${id}`); return }
      setUserId(stored)
      setEventTitle(event.title)
      setRestrictedChef(!manager && assignedChef)
      const attendees = await fetchEventTasteAttendees(supabase, id)
      setGuests(attendees)
      await loadMenus(stored)
    } catch (loadError) {
      console.error(loadError)
      setError("Couldn't load restaurant menus. Make sure the restaurant-menu migration is applied, then try again.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const name = restaurantName.trim()
    setSimilarDismissed(false)
    if (name.length < RESTAURANT_NAME_SEARCH_MIN_LENGTH || !userId) {
      setSimilarMenu(null)
      return
    }
    let cancelled = false
    const timer = window.setTimeout(async () => {
      try {
        const { data, error: searchError } = await supabase.rpc('search_similar_restaurant_menu', {
          p_user_id: userId,
          p_restaurant_name: name,
        })
        if (cancelled) return
        setSimilarMenu(searchError || !data ? null : data as SimilarRestaurantMenu)
      } catch (searchError) {
        if (!cancelled) { console.error('Similar restaurant menu search failed', searchError); setSimilarMenu(null) }
      }
    }, RESTAURANT_NAME_SEARCH_DEBOUNCE_MS)

    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [restaurantName, userId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function extract() {
    if (!restaurantName.trim()) { setError('Add the restaurant name first.'); return }
    if (!menuText.trim() && !menuFile) { setError('Paste menu text or choose a menu image or PDF.'); return }
    if (menuFile && menuFile.size > MAX_RESTAURANT_MENU_FILE_BYTES) { setError('Choose a menu file under 5 MB.'); return }
    setBusy(true); setError(''); setNotice('')
    try {
      const fileDataUrl = menuFile ? await fileAsDataUrl(menuFile) : undefined
      const response = await fetch('/api/restaurant-menus/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ menuText: menuText.trim(), fileDataUrl }),
      })
      const payload = await response.json() as { dishes?: RestaurantDishProposal[]; error?: string }
      if (!response.ok || !payload.dishes?.length) throw new Error(payload.error ?? 'No dishes found')
      const { data: menuId, error: saveError } = await supabase.rpc('save_restaurant_menu_extraction', {
        p_event_id: id,
        p_user_id: userId,
        p_restaurant_name: restaurantName.trim(),
        p_source_type: menuFile ? (menuFile.type === 'application/pdf' ? 'pdf' : 'image') : 'text',
        p_raw_menu_text: menuText.trim(),
        p_dishes: payload.dishes,
      })
      if (saveError || !menuId) throw saveError ?? new Error('Could not save extraction')
      setRestaurantName(''); setMenuText(''); setMenuFile(null)
      setAddingAnotherMenu(false)
      setNotice(`${payload.dishes.length} dishes extracted. Review every suggestion before comparing table fit.`)
      await loadMenus(userId)
    } catch (extractError) {
      setError(extractError instanceof Error ? extractError.message : 'Could not extract this menu.')
    } finally { setBusy(false) }
  }

  async function reuseSimilarMenu() {
    if (!similarMenu) return
    setReusing(true); setError(''); setNotice('')
    const { data: menuId, error: reuseError } = await supabase.rpc('reuse_restaurant_menu', {
      p_event_id: id,
      p_user_id: userId,
      p_restaurant_name: similarMenu.restaurant_name,
      p_dishes: similarMenu.dishes,
    })
    if (reuseError || !menuId) {
      setError('Could not reuse this menu. Try again.')
    } else {
      const dishCount = similarMenu.dishes.length
      setRestaurantName(''); setMenuText(''); setMenuFile(null)
      setSimilarMenu(null); setSimilarDismissed(false)
      setAddingAnotherMenu(false)
      setNotice(`${dishCount} dish${dishCount === 1 ? '' : 'es'} reused from a previously reviewed '${similarMenu.restaurant_name}' menu.`)
      await loadMenus(userId)
    }
    setReusing(false)
  }

  function updateDraft(dishId: string, next: Partial<DishDraft>) {
    setDrafts((current) => ({ ...current, [dishId]: { ...current[dishId], ...next } }))
  }

  function toggleValue(dishId: string, field: 'tags' | 'allergens', value: string) {
    const current = drafts[dishId]?.[field] ?? []
    updateDraft(dishId, { [field]: current.includes(value) ? current.filter((item) => item !== value) : [...current, value] })
  }

  async function review(dish: RestaurantMenuDish, status: 'confirmed' | 'excluded') {
    const draft = drafts[dish.id]
    if (!draft?.name.trim()) { setError('Every confirmed dish needs a name.'); return }
    setBusy(true); setError(''); setNotice('')
    const { data, error: reviewError } = await supabase.rpc('review_restaurant_menu_dish', {
      p_dish_id: dish.id,
      p_user_id: userId,
      p_name: draft.name.trim(),
      p_role: draft.role,
      p_tags: withDishRole(draft.tags, draft.role),
      p_allergens: draft.allergens,
      p_review_status: status,
    })
    if (reviewError || !data) setError('Could not save this review. Try again.')
    else {
      setNotice(status === 'confirmed' ? `${draft.name.trim()} is confirmed and now scored.` : `${draft.name.trim()} was excluded from comparison.`)
      setEditingDishIds((current) => { const next = new Set(current); next.delete(dish.id); return next })
      await loadMenus(userId)
    }
    setBusy(false)
  }

  const intel = useMemo(() => buildIntel(guests), [guests])
  const fromPage = search.get('from_page') === 'table' ? 'table' : 'menu'
  const choiceQuery = new URLSearchParams({ from_page: fromPage })
  if (restrictedChef) choiceQuery.set('delegate', '1')

  return <div className="sv2-root sv2-device-page sv2-app-page sv2-production-table sv2-restaurant-page">
    <main className="sv2-device-shell sv2-app-shell sv2-table-intel-shell sv2-restaurant-shell">
      <button type="button" className="sv2-back-link" onClick={() => router.push(`/events/${id}/kitchen-setup?${choiceQuery.toString()}`)}>← Kitchen type</button>
      <header className="sv2-restaurant-intro">
        <p>OUT · RESTAURANT COMPARISON</p>
        <h1>Bring the menu to the table</h1>
        <span>{eventTitle} · AI extracts possible metadata. You confirm every dish before Sofra applies its existing deterministic table-fit rules.</span>
      </header>

      {loading && <p className="sv2-restaurant-loading">Loading restaurant menus…</p>}

      {!loading && (menus.length > 0 && !addingAnotherMenu ? (
        <button type="button" className="sv2-restaurant-add-another" onClick={() => setAddingAnotherMenu(true)}>+ ADD ANOTHER RESTAURANT MENU</button>
      ) : (
        <section className="sv2-restaurant-upload" aria-labelledby="restaurant-upload-title">
          <div><h2 id="restaurant-upload-title">Add a restaurant menu</h2><span>Paste text or upload one clear menu image or PDF.</span></div>
          <label>RESTAURANT NAME<input value={restaurantName} onChange={(event) => setRestaurantName(event.target.value)} maxLength={160} placeholder="Restaurant name" /></label>
          {similarMenu && !similarDismissed && (
            <div className="sv2-restaurant-reuse-suggestion" role="status">
              <p>A previously reviewed menu for <strong>{similarMenu.restaurant_name}</strong> already exists ({similarMenu.dishes.length} dish{similarMenu.dishes.length === 1 ? '' : 'es'}).</p>
              <div>
                <button type="button" disabled={reusing || busy} onClick={() => void reuseSimilarMenu()}>{reusing ? 'ADDING…' : 'USE THIS MENU'}</button>
                <button type="button" disabled={reusing || busy} onClick={() => setSimilarDismissed(true)}>UPLOAD A NEW MENU INSTEAD</button>
              </div>
            </div>
          )}
          <label>PASTE MENU TEXT<textarea value={menuText} onChange={(event) => setMenuText(event.target.value)} rows={7} maxLength={40000} placeholder="Paste dish names and descriptions…" /></label>
          <label className="sv2-restaurant-file">OR UPLOAD A MENU FILE<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setMenuFile(event.target.files?.[0] ?? null)} /><span>{menuFile?.name ?? 'CHOOSE JPG, PNG, WEBP, OR PDF'}</span></label>
          <button type="button" disabled={busy || reusing} onClick={() => void extract()}>{busy ? 'READING MENU…' : 'EXTRACT DISHES FOR REVIEW'}</button>
        </section>
      ))}

      {error && <p className="sv2-restaurant-message error" role="alert">{error}</p>}
      {notice && <p className="sv2-restaurant-message" role="status">{notice}</p>}

      {!loading && menus.map((menu) => <section className="sv2-restaurant-menu" key={menu.id}>
        <header><div><p>{restaurantMenuSourceLabel(menu.source_type)}</p><h2>{menu.restaurant_name}</h2></div><span>{menu.status === 'confirmed' ? 'REVIEW COMPLETE' : 'HUMAN REVIEW REQUIRED'}</span></header>
        <div className="sv2-restaurant-dishes">
          {menu.dishes.map((dish) => {
            const draft = drafts[dish.id] ?? initialDraft(dish)
            const score = scoreConfirmedRestaurantDish(dish, intel, guests)
            const isEditing = dish.review_status === 'unconfirmed' || editingDishIds.has(dish.id)
            const statusLabel = dish.review_status === 'unconfirmed'
              ? 'NEEDS YOUR CONFIRMATION'
              : dish.review_status === 'auto_confirmed'
                ? `AUTO-CONFIRMED · ${Math.round(dish.ai_confidence * 100)}% CONFIDENCE`
                : dish.review_status.toUpperCase()
            return <article key={dish.id} className={`sv2-restaurant-dish ${dish.review_status}`}>
              <div className="sv2-restaurant-dish-status"><span>{statusLabel}</span>{dish.source_text && <small>{dish.source_text}</small>}</div>
              {dish.review_status === 'unconfirmed' && dish.ai_uncertainties.length > 0 && <p className="sv2-restaurant-uncertainty">Please check: {dish.ai_uncertainties.join(' · ')}</p>}
              {isEditing ? <>
                <label>DISH NAME<input value={draft.name} onChange={(event) => updateDraft(dish.id, { name: event.target.value })} /></label>
                <label>ROLE<select value={draft.role} onChange={(event) => updateDraft(dish.id, { role: event.target.value as DishRole })}>{DISH_ROLES.map((role) => <option key={role} value={role}>{formatTagLabel(role)}</option>)}</select></label>
                <details><summary>REVIEW SUGGESTED TAGS</summary>{SIGNATURE_TAG_GROUPS.filter((group) => group.label !== 'Role').map((group) => <fieldset key={group.label}><legend>{group.label}</legend><div>{group.tags.map((tag) => <button type="button" aria-pressed={draft.tags.includes(tag)} key={tag} onClick={() => toggleValue(dish.id, 'tags', tag)}>{formatTagLabel(tag)}</button>)}</div></fieldset>)}</details>
                <details><summary>REVIEW POSSIBLE ALLERGENS</summary><div className="sv2-restaurant-chip-list">{KITCHEN_ALLERGENS.map((allergen) => <button type="button" aria-pressed={draft.allergens.includes(allergen)} key={allergen} onClick={() => toggleValue(dish.id, 'allergens', allergen)}>{formatTagLabel(allergen)}</button>)}</div></details>
                <div className="sv2-restaurant-review-actions"><button disabled={busy} type="button" onClick={() => void review(dish, 'confirmed')}>CONFIRM &amp; SCORE</button><button disabled={busy} type="button" onClick={() => void review(dish, 'excluded')}>EXCLUDE DISH</button></div>
              </> : <>
                <h3>{dish.name}</h3>
                {score && <div className="sv2-restaurant-score"><strong>Safe for {score.safeGuestCount}/{score.guestCount} seated guests</strong><span>Preference fit {Math.round(score.averagePreferenceFit * 100)}%</span>{score.exclusions.length > 0 && <small>Needs an alternative for {score.exclusions.map((item) => `${item.guest} (${item.reason})`).join(', ')}.</small>}</div>}
                <p>{formatTagLabel(dish.role)} · {withoutDishRoles(dish.tags).map(formatTagLabel).join(' · ') || 'No descriptive tags confirmed'}</p>
                {dish.contains_allergens.length > 0 && <p>Confirmed allergens: {dish.contains_allergens.map(formatTagLabel).join(', ')}</p>}
                {dish.review_status !== 'excluded' && <button className="sv2-restaurant-review-anyway" type="button" onClick={() => setEditingDishIds((current) => new Set(current).add(dish.id))}>REVIEW OR CORRECT</button>}
              </>}
            </article>
          })}
        </div>
      </section>)}
    </main>
  </div>
}
