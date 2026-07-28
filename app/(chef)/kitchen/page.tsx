'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

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
  const d = new Date()
  const day = d.getDay()               // 0=Sun … 6=Sat
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)  // YYYY-MM-DD
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
  const router   = useRouter()
  const supabase = createClient()
  const uidRef   = useRef<string | null>(null)

  const [loading,    setLoading]    = useState(true)
  const [fetchError, setFetchError] = useState('')

  const [signatures,     setSignatures]     = useState<Signature[]>([])
  const [sigName,        setSigName]        = useState('')
  const [sigTags,        setSigTags]        = useState('')
  const [sigAllergens,   setSigAllergens]   = useState('')
  const [sigAdding,      setSigAdding]      = useState(false)
  const [sigAddError,    setSigAddError]    = useState('')
  const [sigDeleteError, setSigDeleteError] = useState('')

  const [pantry,            setPantry]            = useState<PantryItem[]>([])
  const [pantryName,        setPantryName]        = useState('')
  const [pantryAdding,      setPantryAdding]      = useState(false)
  const [pantryAddError,    setPantryAddError]    = useState('')
  const [pantryDeleteError, setPantryDeleteError] = useState('')

  const weekOf = currentMonday()

  async function loadData() {
    setLoading(true)
    setFetchError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      uidRef.current = user.id
      const uid = user.id

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

    const tags      = sigTags.split(',').map(t => t.trim()).filter(Boolean)
    const allergens = sigAllergens.split(',').map(a => a.trim()).filter(Boolean)

    const { data, error } = await supabase
      .from('signatures')
      .insert({ chef_id: uid, name, tags, contains_allergens: allergens })
      .select('id, name, tags, contains_allergens')
      .single()

    if (error || !data) {
      setSigAddError('Failed to add signature. Try again.')
    } else {
      setSignatures(prev => [data, ...prev])
      setSigName('')
      setSigTags('')
      setSigAllergens('')
    }
    setSigAdding(false)
  }

  async function deleteSignature(sig: Signature) {
    const uid = uidRef.current
    if (!uid) return
    setSigDeleteError('')
    const prev = signatures
    setSignatures(s => s.filter(x => x.id !== sig.id))

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
      setPantry(prev => [data, ...prev])
      setPantryName('')
    }
    setPantryAdding(false)
  }

  async function deletePantryItem(item: PantryItem) {
    const uid = uidRef.current
    if (!uid) return
    setPantryDeleteError('')
    const prev = pantry
    setPantry(p => p.filter(x => x.id !== item.id))

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

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 10,
    background: 'rgba(0,0,0,0.24)',
    border: '1px solid rgba(243,233,221,0.12)',
    color: C.cream,
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
  }

  function addBtnStyle(busy: boolean): React.CSSProperties {
    return {
      flexShrink: 0,
      padding: '10px 18px',
      borderRadius: 10,
      background: busy ? 'rgba(217,161,91,0.18)' : C.gold,
      color: busy ? C.dim : C.ink,
      border: 'none',
      fontSize: 14,
      fontWeight: 600,
      cursor: busy ? 'default' : 'pointer',
    }
  }

  const deleteBtnStyle: React.CSSProperties = {
    background: 'none',
    border: 'none',
    color: C.faint,
    fontSize: 18,
    cursor: 'pointer',
    padding: '2px 6px',
    lineHeight: 1,
    flexShrink: 0,
  }

  const cardStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px 14px',
    borderRadius: 14,
    background: 'rgba(0,0,0,0.24)',
    border: '1px solid rgba(243,233,221,0.10)',
  }

  return (
    <>
      <style>{`
        @keyframes skPulse { 0%,100%{opacity:.4} 50%{opacity:.7} }
        @keyframes spin    { to { transform: rotate(360deg); } }
        input::placeholder { color: #7C6B5F; }
      `}</style>

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
          color: C.cream, textAlign: 'center', margin: '0 0 32px',
          position: 'relative', zIndex: 1,
        }}>Sofra</h1>

        <div style={{
          width: '100%', maxWidth: 400,
          position: 'relative', zIndex: 1,
          display: 'flex', flexDirection: 'column', gap: 40,
        }}>

          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[0, 1, 2, 3].map(i => (
                <div key={i} style={{
                  height: 52, borderRadius: 14,
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
                onClick={loadData}
                style={{
                  background: 'none',
                  border: `1px solid ${C.dim}`,
                  borderRadius: 8,
                  color: C.dim,
                  padding: '8px 20px',
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >Retry</button>
            </div>
          )}

          {!loading && !fetchError && (
            <>
              {/* ── Signatures ── */}
              <section>
                <p style={{ color: C.dim, fontSize: 13, margin: '0 0 12px' }}>Signatures</p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      placeholder="Dish name"
                      value={sigName}
                      onChange={e => setSigName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') void addSignature() }}
                      style={inputStyle}
                    />
                    <button
                      onClick={() => void addSignature()}
                      disabled={sigAdding}
                      style={addBtnStyle(sigAdding)}
                    >
                      {sigAdding ? '…' : 'Add'}
                    </button>
                  </div>
                  <input
                    placeholder="Tags — comma-separated (optional)"
                    value={sigTags}
                    onChange={e => setSigTags(e.target.value)}
                    style={inputStyle}
                  />
                  <input
                    placeholder="Allergens — comma-separated (optional)"
                    value={sigAllergens}
                    onChange={e => setSigAllergens(e.target.value)}
                    style={inputStyle}
                  />
                  {sigAddError && (
                    <p style={{ color: C.rose, fontSize: 13, margin: 0 }}>{sigAddError}</p>
                  )}
                </div>

                {sigDeleteError && (
                  <p style={{ color: C.rose, fontSize: 13, marginBottom: 8 }}>{sigDeleteError}</p>
                )}

                {signatures.length === 0 ? (
                  <p style={{ color: C.faint, fontSize: 14, textAlign: 'center', paddingTop: 12 }}>
                    No signatures yet
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {signatures.map(sig => (
                      <div key={sig.id} style={cardStyle}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{
                            color: C.cream, fontSize: 15, fontWeight: 500, margin: '0 0 3px',
                          }}>{sig.name}</p>
                          {(sig.tags.length > 0 || sig.contains_allergens.length > 0) && (
                            <p style={{
                              color: C.dim, fontSize: 12, margin: 0,
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                              {[
                                sig.tags.length > 0 ? sig.tags.join(', ') : null,
                                sig.contains_allergens.length > 0
                                  ? `⚠ ${sig.contains_allergens.join(', ')}`
                                  : null,
                              ].filter(Boolean).join(' · ')}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => void deleteSignature(sig)}
                          style={deleteBtnStyle}
                          title="Remove"
                        >×</button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* ── This Week's Pantry ── */}
              <section>
                <p style={{ color: C.dim, fontSize: 13, margin: '0 0 12px' }}>
                  This Week&apos;s Pantry
                </p>

                <div style={{ display: 'flex', gap: 8, marginBottom: pantryAddError ? 8 : 16 }}>
                  <input
                    placeholder="Ingredient"
                    value={pantryName}
                    onChange={e => setPantryName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') void addPantryItem() }}
                    style={inputStyle}
                  />
                  <button
                    onClick={() => void addPantryItem()}
                    disabled={pantryAdding}
                    style={addBtnStyle(pantryAdding)}
                  >
                    {pantryAdding ? '…' : 'Add'}
                  </button>
                </div>
                {pantryAddError && (
                  <p style={{ color: C.rose, fontSize: 13, marginBottom: 16 }}>{pantryAddError}</p>
                )}

                {pantryDeleteError && (
                  <p style={{ color: C.rose, fontSize: 13, marginBottom: 8 }}>{pantryDeleteError}</p>
                )}

                {pantry.length === 0 ? (
                  <p style={{ color: C.faint, fontSize: 14, textAlign: 'center', paddingTop: 12 }}>
                    Nothing in the pantry this week
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {pantry.map(item => (
                      <div key={item.id} style={cardStyle}>
                        <p style={{
                          flex: 1, color: C.cream, fontSize: 15, fontWeight: 500, margin: 0,
                        }}>{item.name}</p>
                        <button
                          onClick={() => void deletePantryItem(item)}
                          style={deleteBtnStyle}
                          title="Remove"
                        >×</button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}

        </div>
      </div>
    </>
  )
}
