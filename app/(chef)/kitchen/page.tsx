'use client'

import { Suspense, useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { C } from '@/lib/theme'
import { DISH_PRESETS, CUISINES, type DishPreset } from '@/lib/dish-presets'
import { INGREDIENT_PRESETS, INGREDIENT_CATEGORIES } from '@/lib/ingredient-presets'

const CUISINE_FILTERS = ['All', ...CUISINES] as const
type CuisineFilter = (typeof CUISINE_FILTERS)[number]

const INGREDIENT_CATEGORY_FILTERS = ['All', ...INGREDIENT_CATEGORIES] as const
type IngredientCategoryFilter = (typeof INGREDIENT_CATEGORY_FILTERS)[number]

// Fixed vocabularies keep tag/allergen values consistent so the hard-limit
// safety check in lib/menu.ts (case-insensitive) reliably matches guest avoid
// entries — e.g. chef "nuts" ↔ guest "Nuts".
const TAG_VOCAB = ['veg', 'vegan', 'meat', 'seafood', 'dessert', 'pescatarian'] as const
const ALLERGEN_VOCAB = ['nuts', 'shellfish', 'dairy', 'gluten', 'eggs', 'soy', 'pork'] as const

function dishKey(p: DishPreset): string {
  return `${p.cuisine}::${p.name}`
}

function currentMonday(): string {
  const d = new Date()
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)
}

type Signature = {
  id: string
  name: string
  tags: string[]
  contains_allergens: string[]
}

type PantryItem = {
  id: string
  name: string
  week_of: string
}

export default function KitchenPage() {
  return (
    <Suspense fallback={null}>
      <KitchenPageInner />
    </Suspense>
  )
}

function KitchenPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const fromEventId = searchParams?.get('from') ?? null
  const fromPage = searchParams?.get('from_page') === 'table' ? 'table' : 'menu'
  const supabase = createClient()
  const uidRef = useRef<string | null>(null)

  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState('')
  const [backEvent, setBackEvent] = useState<{ id: string; title: string } | null>(null)

  const [signatures, setSignatures] = useState<Signature[]>([])
  const [sigName, setSigName] = useState('')
  const [sigTagsList, setSigTagsList] = useState<string[]>([])
  const [sigAllergensList, setSigAllergensList] = useState<string[]>([])
  const [sigAdding, setSigAdding] = useState(false)
  const [sigAddError, setSigAddError] = useState('')
  const [sigDeleteError, setSigDeleteError] = useState('')
  const [presetCuisine, setPresetCuisine] = useState<CuisineFilter>('All')
  const [selectedDishKeys, setSelectedDishKeys] = useState<string[]>([])
  const [dishBatchAdding, setDishBatchAdding] = useState(false)
  const [dishBatchError, setDishBatchError] = useState('')

  const [pantry, setPantry] = useState<PantryItem[]>([])
  const [pantryName, setPantryName] = useState('')
  const [pantryAdding, setPantryAdding] = useState(false)
  const [pantryAddError, setPantryAddError] = useState('')
  const [pantryDeleteError, setPantryDeleteError] = useState('')
  const [pantryDoneSaved, setPantryDoneSaved] = useState(false)
  const pantryDoneTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [ingredientCategory, setIngredientCategory] = useState<IngredientCategoryFilter>('All')
  const [selectedIngredients, setSelectedIngredients] = useState<string[]>([])
  const [ingredientBatchAdding, setIngredientBatchAdding] = useState(false)
  const [ingredientBatchError, setIngredientBatchError] = useState('')

  const weekOf = currentMonday()

  async function loadData() {
    setLoading(true)
    setFetchError('')
    try {
      const stored = localStorage.getItem('sofra_user_id')
      if (!stored) { router.push('/login'); return }
      uidRef.current = stored
      const uid = stored

      if (fromEventId) void loadBackEvent(uid, fromEventId)

      const [{ data: sigs, error: e1 }, { data: items, error: e2 }] = await Promise.all([
        supabase
          .from('signatures')
          .select('id, name, tags, contains_allergens')
          .eq('chef_id', uid)
          .order('created_at', { ascending: false }),
        supabase
          .from('pantry_items')
          .select('id, name, week_of')
          .eq('chef_id', uid)
          .eq('week_of', weekOf)
          .order('created_at', { ascending: false }),
      ])

      if (e1 || e2) throw new Error('fetch failed')
      setSignatures(sigs ?? [])
      setPantry(items ?? [])
    } catch {
      setFetchError("Couldn't load your kitchen. Try again.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadBackEvent(uid: string, eventId: string) {
    const { data, error } = await supabase
      .from('events')
      .select('id, host_id, chef_id, title')
      .eq('id', eventId)
      .single()

    if (error || !data) return
    if (data.host_id !== uid && data.chef_id !== uid) return
    setBackEvent({ id: data.id, title: data.title })
  }

  async function addSignature() {
    const uid = uidRef.current
    if (!uid || sigAdding) return
    const name = sigName.trim()
    if (!name) { setSigAddError('Name is required.'); return }
    setSigAdding(true)
    setSigAddError('')

    const { data, error } = await supabase
      .from('signatures')
      .insert({
        chef_id: uid,
        name,
        tags: sigTagsList,
        contains_allergens: sigAllergensList,
      })
      .select('id, name, tags, contains_allergens')
      .single()

    if (error || !data) {
      setSigAddError('Failed to add signature. Try again.')
    } else {
      setSignatures((prev) => [data, ...prev])
      setSigName('')
      setSigTagsList([])
      setSigAllergensList([])
    }
    setSigAdding(false)
  }

  function toggleDishSelection(p: DishPreset) {
    const key = dishKey(p)
    setSelectedDishKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    )
  }

  function toggleTag(t: string) {
    setSigTagsList((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))
  }

  function toggleAllergen(a: string) {
    setSigAllergensList((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]))
  }

  async function addSelectedDishes() {
    const uid = uidRef.current
    if (!uid || dishBatchAdding || selectedDishKeys.length === 0) return
    setDishBatchAdding(true)
    setDishBatchError('')

    const keyToPreset = new Map(DISH_PRESETS.map((p) => [dishKey(p), p] as const))
    const targets = selectedDishKeys
      .map((k) => keyToPreset.get(k))
      .filter((p): p is DishPreset => Boolean(p))

    const results = await Promise.allSettled(
      targets.map((p) =>
        supabase
          .from('signatures')
          .insert({
            chef_id: uid,
            name: p.name,
            tags: p.tags,
            contains_allergens: p.allergens,
          })
          .select('id, name, tags, contains_allergens')
          .single()
      )
    )

    const inserted: Signature[] = []
    const failedKeys: string[] = []
    const failedNames: string[] = []
    results.forEach((res, i) => {
      const preset = targets[i]
      const ok = res.status === 'fulfilled' && !res.value.error && res.value.data
      if (ok) {
        inserted.push(res.value.data as Signature)
      } else {
        failedKeys.push(dishKey(preset))
        failedNames.push(preset.name)
      }
    })

    if (inserted.length > 0) {
      setSignatures((prev) => [...inserted, ...prev])
    }
    setSelectedDishKeys(failedKeys)
    if (failedNames.length > 0) {
      const list = failedNames.join(', ')
      setDishBatchError(
        `Couldn't add: ${list}. They stay selected — tap "Add selected" again to retry just those.`
      )
    }
    setDishBatchAdding(false)
  }

  function toggleIngredientSelection(name: string) {
    setSelectedIngredients((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    )
  }

  async function addSelectedIngredients() {
    const uid = uidRef.current
    if (!uid || ingredientBatchAdding || selectedIngredients.length === 0) return
    setIngredientBatchAdding(true)
    setIngredientBatchError('')

    const targets = [...selectedIngredients]
    const results = await Promise.allSettled(
      targets.map((name) =>
        supabase
          .from('pantry_items')
          .insert({ chef_id: uid, name, week_of: weekOf })
          .select('id, name, week_of')
          .single()
      )
    )

    const inserted: PantryItem[] = []
    const failedNames: string[] = []
    results.forEach((res, i) => {
      const name = targets[i]
      const ok = res.status === 'fulfilled' && !res.value.error && res.value.data
      if (ok) {
        inserted.push(res.value.data as PantryItem)
      } else {
        failedNames.push(name)
      }
    })

    if (inserted.length > 0) {
      setPantry((prev) => [...inserted, ...prev])
    }
    setSelectedIngredients(failedNames)
    if (failedNames.length > 0) {
      const list = failedNames.join(', ')
      setIngredientBatchError(
        `Couldn't add: ${list}. They stay selected — tap "Add selected" again to retry just those.`
      )
    }
    setIngredientBatchAdding(false)
  }

  const filteredPresets =
    presetCuisine === 'All'
      ? DISH_PRESETS
      : DISH_PRESETS.filter((d) => d.cuisine === presetCuisine)

  const filteredIngredients: string[] =
    ingredientCategory === 'All'
      ? INGREDIENT_CATEGORIES.flatMap((c) => INGREDIENT_PRESETS[c] ?? [])
      : (INGREDIENT_PRESETS[ingredientCategory] ?? [])

  const pantryNamesLC = new Set(pantry.map((p) => p.name.toLowerCase()))

  async function deleteSignature(sig: Signature) {
    const uid = uidRef.current
    if (!uid) return
    setSigDeleteError('')
    const prev = signatures
    setSignatures((s) => s.filter((x) => x.id !== sig.id))

    const { error } = await supabase
      .from('signatures')
      .delete()
      .eq('id', sig.id)
      .eq('chef_id', uid)

    if (error) {
      setSignatures(prev)
      setSigDeleteError('Failed to remove signature. Try again.')
    }
  }

  async function addPantryItem() {
    const uid = uidRef.current
    if (!uid || pantryAdding) return
    const name = pantryName.trim()
    if (!name) { setPantryAddError('Name is required.'); return }
    setPantryAdding(true)
    setPantryAddError('')

    const { data, error } = await supabase
      .from('pantry_items')
      .insert({ chef_id: uid, name, week_of: weekOf })
      .select('id, name, week_of')
      .single()

    if (error || !data) {
      setPantryAddError('Failed to add item. Try again.')
    } else {
      setPantry((prev) => [data, ...prev])
      setPantryName('')
    }
    setPantryAdding(false)
  }

  async function deletePantryItem(item: PantryItem) {
    const uid = uidRef.current
    if (!uid) return
    setPantryDeleteError('')
    const prev = pantry
    setPantry((p) => p.filter((x) => x.id !== item.id))

    const { error } = await supabase
      .from('pantry_items')
      .delete()
      .eq('id', item.id)
      .eq('chef_id', uid)

    if (error) {
      setPantry(prev)
      setPantryDeleteError('Failed to remove item. Try again.')
    }
  }

  function handlePantryDone() {
    if (backEvent) {
      router.push(`/events/${backEvent.id}/${fromPage}`)
      return
    }
    setPantryDoneSaved(true)
    if (pantryDoneTimeoutRef.current) clearTimeout(pantryDoneTimeoutRef.current)
    pantryDoneTimeoutRef.current = setTimeout(() => setPantryDoneSaved(false), 2000)
  }

  useEffect(() => {
    return () => {
      if (pantryDoneTimeoutRef.current) clearTimeout(pantryDoneTimeoutRef.current)
    }
  }, [])

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
        {backEvent && (
          <button
            onClick={() => router.push(`/events/${backEvent.id}/${fromPage}`)}
            style={{
              display: 'block',
              background: 'none',
              border: 'none',
              color: C.gold,
              fontSize: 13,
              fontFamily: 'system-ui, sans-serif',
              cursor: 'pointer',
              padding: 0,
              marginBottom: 12,
            }}
          >
            ← Back to {backEvent.title}
          </button>
        )}

        {/* Chef header */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ color: C.cream, fontSize: 24, fontStyle: 'italic' }}>
            Sofra{' '}
            <span
              style={{
                color: C.gold,
                fontSize: 14,
                fontStyle: 'normal',
                fontFamily: 'system-ui, sans-serif',
                letterSpacing: 1,
              }}
            >
              · Kitchen
            </span>
          </div>
          <div
            style={{
              color: C.dim,
              fontSize: 13,
              marginTop: 4,
              fontFamily: 'system-ui, sans-serif',
            }}
          >
            Your signatures and this week’s pantry.
          </div>
        </div>

        {loading && (
          <div style={{ color: C.dim, fontSize: 13, fontFamily: 'system-ui, sans-serif' }}>
            Loading…
          </div>
        )}

        {!loading && fetchError && (
          <div style={{ textAlign: 'center', paddingTop: 40 }}>
            <p style={{ color: C.rose, fontSize: 14, marginBottom: 16 }}>{fetchError}</p>
            <button
              onClick={loadData}
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
            {/* ── Signatures ── */}
            <div style={cardStyle}>
              <div style={cardHeadRow}>
                <span style={cardTitle}>Your signatures</span>
                <span style={faintSm}>dishes Sofra can always plate</span>
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  marginTop: 12,
                }}
              >
                {signatures.length === 0 ? (
                  <div style={{ color: C.faint, fontSize: 14, fontFamily: 'system-ui, sans-serif' }}>
                    No signatures yet.
                  </div>
                ) : (
                  signatures.map((s) => (
                    <div key={s.id} style={sigRow}>
                      <span
                        style={{
                          color: C.cream,
                          fontSize: 15,
                          fontFamily: 'system-ui, sans-serif',
                        }}
                      >
                        {s.name}
                      </span>
                      <div
                        style={{
                          display: 'flex',
                          gap: 5,
                          flexWrap: 'wrap',
                          justifyContent: 'flex-end',
                          alignItems: 'center',
                        }}
                      >
                        {s.tags.map((t) => (
                          <span key={t} style={tagOk}>{t}</span>
                        ))}
                        {s.contains_allergens.map((c) => (
                          <span key={c} style={tagWarn}>contains {c}</span>
                        ))}
                        <button
                          onClick={() => void deleteSignature(s)}
                          style={xBtn}
                          title="Remove"
                          aria-label={`Remove ${s.name}`}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  marginTop: 14,
                  paddingTop: 14,
                  borderTop: `1px solid ${C.line}`,
                }}
              >
                <div
                  style={{
                    color: C.faint,
                    fontSize: 11,
                    fontFamily: 'system-ui, sans-serif',
                    letterSpacing: 0.5,
                    textTransform: 'uppercase',
                  }}
                >
                  Quick add from presets
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {CUISINE_FILTERS.map((c) => {
                    const on = presetCuisine === c
                    return (
                      <button
                        key={c}
                        className="chip"
                        onClick={() => setPresetCuisine(c)}
                        style={{
                          background: on ? C.burgundy : 'transparent',
                          borderColor: on ? C.gold : 'rgba(243,233,221,0.18)',
                          color: on ? C.cream : C.dim,
                          padding: '5px 11px',
                          fontSize: 12,
                          fontFamily: 'system-ui, sans-serif',
                          borderRadius: 14,
                        }}
                      >
                        {c}
                      </button>
                    )
                  })}
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 6,
                    maxHeight: 168,
                    overflowY: 'auto',
                    paddingRight: 2,
                  }}
                >
                  {filteredPresets.map((p) => {
                    const key = dishKey(p)
                    const on = selectedDishKeys.includes(key)
                    return (
                      <button
                        key={key}
                        onClick={() => toggleDishSelection(p)}
                        style={presetChip(on)}
                        aria-pressed={on}
                        title={`${p.cuisine}`}
                      >
                        {p.name}
                      </button>
                    )
                  })}
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginTop: 4,
                  }}
                >
                  <button
                    className="add"
                    onClick={() => void addSelectedDishes()}
                    disabled={dishBatchAdding || selectedDishKeys.length === 0}
                  >
                    {dishBatchAdding
                      ? '…'
                      : `Add selected (${selectedDishKeys.length})`}
                  </button>
                  {selectedDishKeys.length > 0 && !dishBatchAdding && (
                    <button
                      onClick={() => {
                        setSelectedDishKeys([])
                        setDishBatchError('')
                      }}
                      style={clearBtn}
                    >
                      Clear
                    </button>
                  )}
                </div>
                {dishBatchError && (
                  <p style={{ color: C.rose, fontSize: 12, margin: 0 }}>{dishBatchError}</p>
                )}
              </div>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  marginTop: 14,
                  paddingTop: 14,
                  borderTop: `1px solid ${C.line}`,
                }}
              >
                <div
                  style={{
                    color: C.faint,
                    fontSize: 11,
                    fontFamily: 'system-ui, sans-serif',
                    letterSpacing: 0.5,
                    textTransform: 'uppercase',
                  }}
                >
                  Add your own dish
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    className="field sm"
                    placeholder="Add a signature dish…"
                    value={sigName}
                    onChange={(e) => setSigName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && void addSignature()}
                  />
                  <button
                    className="add"
                    onClick={() => void addSignature()}
                    disabled={sigAdding}
                  >
                    {sigAdding ? '…' : 'Add'}
                  </button>
                </div>
                <div
                  style={{
                    color: C.faint,
                    fontSize: 11,
                    fontFamily: 'system-ui, sans-serif',
                  }}
                >
                  Tags
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {TAG_VOCAB.map((t) => {
                    const on = sigTagsList.includes(t)
                    return (
                      <button
                        key={t}
                        onClick={() => toggleTag(t)}
                        style={vocabChip(on, false)}
                        aria-pressed={on}
                      >
                        {t}
                      </button>
                    )
                  })}
                </div>
                <div
                  style={{
                    color: C.faint,
                    fontSize: 11,
                    fontFamily: 'system-ui, sans-serif',
                  }}
                >
                  Contains allergens
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {ALLERGEN_VOCAB.map((a) => {
                    const on = sigAllergensList.includes(a)
                    return (
                      <button
                        key={a}
                        onClick={() => toggleAllergen(a)}
                        style={vocabChip(on, true)}
                        aria-pressed={on}
                      >
                        {a}
                      </button>
                    )
                  })}
                </div>
                {sigAddError && (
                  <p style={{ color: C.rose, fontSize: 13, margin: 0 }}>{sigAddError}</p>
                )}
                {sigDeleteError && (
                  <p style={{ color: C.rose, fontSize: 13, margin: 0 }}>{sigDeleteError}</p>
                )}
              </div>
            </div>

            {/* ── Pantry ── */}
            <div style={cardStyle}>
              <div style={cardHeadRow}>
                <span style={cardTitle}>This week’s pantry</span>
                <span style={faintSm}>what’s fresh — Sofra builds new dishes from it</span>
              </div>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                  marginTop: 14,
                }}
              >
                {pantry.length === 0 ? (
                  <div style={{ color: C.faint, fontSize: 14, fontFamily: 'system-ui, sans-serif' }}>
                    Nothing in the pantry this week.
                  </div>
                ) : (
                  pantry.map((p) => (
                    <span
                      key={p.id}
                      className="pantry"
                      onClick={() => void deletePantryItem(p)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && void deletePantryItem(p)}
                      aria-label={`Remove ${p.name}`}
                    >
                      {p.name} <span style={{ color: C.faint }}>×</span>
                    </span>
                  ))
                )}
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  marginTop: 14,
                  paddingTop: 14,
                  borderTop: `1px solid ${C.line}`,
                }}
              >
                <div
                  style={{
                    color: C.faint,
                    fontSize: 11,
                    fontFamily: 'system-ui, sans-serif',
                    letterSpacing: 0.5,
                    textTransform: 'uppercase',
                  }}
                >
                  Quick add from presets
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {INGREDIENT_CATEGORY_FILTERS.map((c) => {
                    const on = ingredientCategory === c
                    return (
                      <button
                        key={c}
                        className="chip"
                        onClick={() => setIngredientCategory(c)}
                        style={{
                          background: on ? C.burgundy : 'transparent',
                          borderColor: on ? C.gold : 'rgba(243,233,221,0.18)',
                          color: on ? C.cream : C.dim,
                          padding: '5px 11px',
                          fontSize: 12,
                          fontFamily: 'system-ui, sans-serif',
                          borderRadius: 14,
                        }}
                      >
                        {c}
                      </button>
                    )
                  })}
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 6,
                    maxHeight: 168,
                    overflowY: 'auto',
                    paddingRight: 2,
                  }}
                >
                  {filteredIngredients.map((name) => {
                    const on = selectedIngredients.includes(name)
                    const already = pantryNamesLC.has(name.toLowerCase())
                    return (
                      <button
                        key={name}
                        onClick={() => toggleIngredientSelection(name)}
                        style={presetChip(on, already)}
                        disabled={already}
                        aria-pressed={on}
                        title={already ? 'Already in this week’s pantry' : undefined}
                      >
                        {name}
                      </button>
                    )
                  })}
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginTop: 4,
                  }}
                >
                  <button
                    className="add"
                    onClick={() => void addSelectedIngredients()}
                    disabled={ingredientBatchAdding || selectedIngredients.length === 0}
                  >
                    {ingredientBatchAdding
                      ? '…'
                      : `Add selected (${selectedIngredients.length})`}
                  </button>
                  {selectedIngredients.length > 0 && !ingredientBatchAdding && (
                    <button
                      onClick={() => {
                        setSelectedIngredients([])
                        setIngredientBatchError('')
                      }}
                      style={clearBtn}
                    >
                      Clear
                    </button>
                  )}
                </div>
                {ingredientBatchError && (
                  <p style={{ color: C.rose, fontSize: 12, margin: 0 }}>{ingredientBatchError}</p>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <input
                  className="field sm"
                  placeholder="Add an ingredient…"
                  value={pantryName}
                  onChange={(e) => setPantryName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void addPantryItem()}
                />
                <button
                  className="add"
                  onClick={() => void addPantryItem()}
                  disabled={pantryAdding}
                >
                  {pantryAdding ? '…' : 'Add'}
                </button>
              </div>
              {pantryAddError && (
                <p style={{ color: C.rose, fontSize: 13, marginTop: 8 }}>{pantryAddError}</p>
              )}
              {pantryDeleteError && (
                <p style={{ color: C.rose, fontSize: 13, marginTop: 8 }}>{pantryDeleteError}</p>
              )}

              <button
                onClick={handlePantryDone}
                disabled={pantryDoneSaved}
                style={{
                  width: '100%',
                  marginTop: 16,
                  background: pantryDoneSaved ? 'rgba(217,161,91,0.25)' : C.gold,
                  color: C.ink,
                  border: 'none',
                  borderRadius: 12,
                  padding: '12px 16px',
                  fontSize: 14,
                  fontWeight: 600,
                  fontFamily: 'system-ui, sans-serif',
                  cursor: pantryDoneSaved ? 'default' : 'pointer',
                  transition: 'all 0.18s',
                }}
              >
                {pantryDoneSaved ? 'Saved ✓' : "Done — this week's pantry"}
              </button>
            </div>

            {/* Brief */}
            <div style={briefStyle}>
              <span style={{ color: C.gold, fontSize: 15 }}>✦</span>
              <span>
                Signatures give Sofra dishes it can trust. The pantry lets it invent new ones that
                fit the table — without you writing every recipe.
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const cardStyle: React.CSSProperties = {
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
  gap: 10,
}

const cardTitle: React.CSSProperties = {
  color: C.cream,
  fontSize: 17,
}

const faintSm: React.CSSProperties = {
  color: C.faint,
  fontSize: 12,
  fontFamily: 'system-ui, sans-serif',
  textAlign: 'right',
}

const sigRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 10,
  padding: '10px 0',
  borderBottom: `1px solid ${C.line}`,
}

const tagOk: React.CSSProperties = {
  color: C.sage,
  fontSize: 10,
  border: '1px solid rgba(138,160,110,0.4)',
  borderRadius: 10,
  padding: '2px 7px',
  fontFamily: 'system-ui, sans-serif',
}

const tagWarn: React.CSSProperties = {
  color: C.gold,
  fontSize: 10,
  border: '1px solid rgba(217,161,91,0.4)',
  borderRadius: 10,
  padding: '2px 7px',
  fontFamily: 'system-ui, sans-serif',
}

const xBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: C.faint,
  fontSize: 16,
  cursor: 'pointer',
  padding: '2px 4px',
  lineHeight: 1,
}

function presetChip(on: boolean, disabled: boolean = false): React.CSSProperties {
  return {
    background: on ? C.burgundy : disabled ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.03)',
    border: `1px solid ${on ? C.gold : C.line}`,
    borderRadius: 10,
    color: on ? C.cream : disabled ? C.faint : C.dim,
    padding: '5px 10px',
    fontSize: 12,
    fontFamily: 'system-ui, sans-serif',
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transition: 'all 0.18s',
  }
}

function vocabChip(on: boolean, danger: boolean): React.CSSProperties {
  // Allergen chips use rose/danger palette to match how "avoid" chips look on
  // the guest RSVP page — visual language for "off-limits".
  return {
    background: on ? (danger ? '#4A1E1E' : C.burgundy) : 'transparent',
    border: `1px solid ${
      on ? (danger ? C.rose : C.gold) : 'rgba(243,233,221,0.18)'
    }`,
    borderRadius: 14,
    color: on ? C.cream : danger ? C.rose : C.dim,
    padding: '5px 11px',
    fontSize: 12,
    fontFamily: 'system-ui, sans-serif',
    cursor: 'pointer',
    transition: 'all 0.18s',
  }
}

const clearBtn: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: C.faint,
  fontSize: 12,
  fontFamily: 'system-ui, sans-serif',
  cursor: 'pointer',
  padding: '4px 6px',
  textDecoration: 'underline',
}

const briefStyle: React.CSSProperties = {
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
