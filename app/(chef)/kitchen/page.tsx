'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { C } from '@/lib/theme'
import { DISH_PRESETS, CUISINES, type DishPreset } from '@/lib/dish-presets'

const CUISINE_FILTERS = ['All', ...CUISINES] as const
type CuisineFilter = (typeof CUISINE_FILTERS)[number]

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
  const router = useRouter()
  const supabase = createClient()
  const uidRef = useRef<string | null>(null)

  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState('')

  const [signatures, setSignatures] = useState<Signature[]>([])
  const [sigName, setSigName] = useState('')
  const [sigTags, setSigTags] = useState('')
  const [sigAllergens, setSigAllergens] = useState('')
  const [sigAdding, setSigAdding] = useState(false)
  const [sigAddError, setSigAddError] = useState('')
  const [sigDeleteError, setSigDeleteError] = useState('')
  const [presetCuisine, setPresetCuisine] = useState<CuisineFilter>('All')
  const [customName, setCustomName] = useState('')
  const [customAdding, setCustomAdding] = useState(false)
  const [customError, setCustomError] = useState('')

  const [pantry, setPantry] = useState<PantryItem[]>([])
  const [pantryName, setPantryName] = useState('')
  const [pantryAdding, setPantryAdding] = useState(false)
  const [pantryAddError, setPantryAddError] = useState('')
  const [pantryDeleteError, setPantryDeleteError] = useState('')

  const weekOf = currentMonday()

  async function loadData() {
    setLoading(true)
    setFetchError('')
    try {
      const stored = localStorage.getItem('sofra_user_id')
      if (!stored) { router.push('/login'); return }
      uidRef.current = stored
      const uid = stored

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

  async function addSignature() {
    const uid = uidRef.current
    if (!uid || sigAdding) return
    const name = sigName.trim()
    if (!name) { setSigAddError('Name is required.'); return }
    setSigAdding(true)
    setSigAddError('')

    const tags = sigTags.split(',').map((t) => t.trim()).filter(Boolean)
    const allergens = sigAllergens.split(',').map((a) => a.trim()).filter(Boolean)

    const { data, error } = await supabase
      .from('signatures')
      .insert({ chef_id: uid, name, tags, contains_allergens: allergens })
      .select('id, name, tags, contains_allergens')
      .single()

    if (error || !data) {
      setSigAddError('Failed to add signature. Try again.')
    } else {
      setSignatures((prev) => [data, ...prev])
      setSigName('')
      setSigTags('')
      setSigAllergens('')
    }
    setSigAdding(false)
  }

  function applyPreset(p: DishPreset) {
    setSigName(p.name)
    setSigTags(p.tags.join(', '))
    setSigAllergens(p.allergens.join(', '))
  }

  async function addCustomToMyList() {
    const uid = uidRef.current
    if (!uid || customAdding) return
    const name = customName.trim()
    if (!name) { setCustomError('Name is required.'); return }
    setCustomAdding(true)
    setCustomError('')

    const { data, error } = await supabase
      .from('signatures')
      .insert({ chef_id: uid, name, tags: [], contains_allergens: [] })
      .select('id, name, tags, contains_allergens')
      .single()

    if (error || !data) {
      setCustomError('Failed to add. Try again.')
    } else {
      setSignatures((prev) => [data, ...prev])
      setCustomName('')
    }
    setCustomAdding(false)
  }

  const filteredPresets =
    presetCuisine === 'All'
      ? DISH_PRESETS
      : DISH_PRESETS.filter((d) => d.cuisine === presetCuisine)

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
                  {filteredPresets.map((p) => (
                    <button
                      key={`${p.cuisine}-${p.name}`}
                      onClick={() => applyPreset(p)}
                      style={presetBtn}
                      title={`${p.cuisine} · fills the form`}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>

                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    marginTop: 6,
                    paddingTop: 10,
                    borderTop: `1px dashed ${C.line}`,
                  }}
                >
                  <div
                    style={{
                      color: C.faint,
                      fontSize: 11,
                      fontFamily: 'system-ui, sans-serif',
                    }}
                  >
                    Don’t see it? Add your own — saves to your signatures only.
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      className="field sm"
                      placeholder="Dish name…"
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && void addCustomToMyList()}
                    />
                    <button
                      className="add"
                      onClick={() => void addCustomToMyList()}
                      disabled={customAdding}
                    >
                      {customAdding ? '…' : 'Add to my list'}
                    </button>
                  </div>
                  {customError && (
                    <p style={{ color: C.rose, fontSize: 12, margin: 0 }}>{customError}</p>
                  )}
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  marginTop: 14,
                }}
              >
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
                <input
                  className="field sm"
                  placeholder="Tags — comma separated (optional)"
                  value={sigTags}
                  onChange={(e) => setSigTags(e.target.value)}
                />
                <input
                  className="field sm"
                  placeholder="Allergens — comma separated (optional)"
                  value={sigAllergens}
                  onChange={(e) => setSigAllergens(e.target.value)}
                />
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

const presetBtn: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)',
  border: `1px solid ${C.line}`,
  borderRadius: 10,
  color: C.dim,
  padding: '5px 10px',
  fontSize: 12,
  fontFamily: 'system-ui, sans-serif',
  cursor: 'pointer',
  transition: 'all 0.18s',
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
