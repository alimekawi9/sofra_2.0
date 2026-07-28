'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const THEMES = [
  { id: 'ember',    name: 'Ember',    bg: 'radial-gradient(120% 80% at 50% 0%, #7A2324 0%, #3A1416 45%, #140E10 100%)', accent: '#D9A15B' },
  { id: 'olive',    name: 'Olive',    bg: 'radial-gradient(120% 80% at 50% 0%, #5B6B4E 0%, #2E3826 50%, #14140E 100%)', accent: '#D9C05B' },
  { id: 'midnight', name: 'Midnight', bg: 'radial-gradient(120% 80% at 50% 0%, #26304A 0%, #161C2E 50%, #0C0E14 100%)', accent: '#C97B6E' },
  { id: 'saffron',  name: 'Saffron',  bg: 'radial-gradient(120% 80% at 50% 0%, #B5701E 0%, #6E4212 50%, #17100A 100%)', accent: '#F3D9A0' },
  { id: 'plum',     name: 'Plum',     bg: 'radial-gradient(120% 80% at 50% 0%, #4A2540 0%, #2A162A 50%, #120A12 100%)', accent: '#D98FB0' },
]

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

export default function HostNewPage() {
  const router       = useRouter()
  const supabase     = createClient()
  const uidRef       = useRef<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const coverFileRef = useRef<File | null>(null)

  const [theme,      setTheme]      = useState('ember')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [title,      setTitle]      = useState('')
  const [tagline,    setTagline]    = useState('')
  const [date,       setDate]       = useState('')
  const [venue,      setVenue]      = useState('')
  const [dressCode,  setDressCode]  = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState('')

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      uidRef.current = user.id
    }
    init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function onFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    coverFileRef.current = file
    setPreviewUrl(URL.createObjectURL(file))
  }

  async function handleSubmit() {
    if (!uidRef.current || submitting) return
    setSubmitting(true)
    setError('')

    let publicUrl: string | null = null
    if (coverFileRef.current) {
      const file = coverFileRef.current
      const ext  = file.name.split('.').pop() ?? 'jpg'
      const path = `${uidRef.current}/${crypto.randomUUID()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('covers')
        .upload(path, file)

      if (uploadError) {
        setError('Photo upload failed. Please try again.')
        setSubmitting(false)
        return
      }

      publicUrl = supabase.storage
        .from('covers')
        .getPublicUrl(path).data.publicUrl
    }

    const { data, error: insertError } = await supabase
      .from('events')
      .insert({
        host_id:    uidRef.current,
        title,
        tagline:    tagline   || null,
        event_date: new Date(date).toISOString(),
        venue:      venue     || null,
        dress_code: dressCode || null,
        theme,
        cover_url:  publicUrl,
      })
      .select('id')
      .single()

    if (insertError) {
      setError('Something went wrong. Please try again.')
      setSubmitting(false)
      return
    }

    router.push('/events/' + data!.id)
  }

  return (
    <>
      <style>{`
        input:focus { outline: none; border-color: #D9A15B; }
        input[type="datetime-local"]::-webkit-calendar-picker-indicator { filter: invert(0.6); }
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

        <button
          onClick={() => router.push('/events')}
          style={{
            background: 'none', border: 'none', color: C.dim,
            alignSelf: 'flex-start', fontSize: 14,
            position: 'relative', zIndex: 1, cursor: 'pointer', padding: 0,
          }}
        >← Events</button>

        <h1 style={{
          fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 52,
          color: C.cream, textAlign: 'center', margin: '12px 0 24px',
          position: 'relative', zIndex: 1,
        }}>Sofra</h1>

        <div style={{
          width: '100%', maxWidth: 400,
          position: 'relative', zIndex: 1,
          display: 'flex', flexDirection: 'column', gap: 24,
        }}>

          {/* Cover button */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                width: '100%', height: 240, borderRadius: 16, overflow: 'hidden',
                background: previewUrl
                  ? '#000'
                  : (THEMES.find(t => t.id === theme) ?? THEMES[0]).bg,
                border: 'none', cursor: 'pointer',
                display: 'block', position: 'relative',
              }}
            >
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="cover"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <>
                  <div style={{
                    position: 'absolute', inset: 0, pointerEvents: 'none',
                    background: 'radial-gradient(ellipse 80% 40% at 50% 0%, rgba(217,161,91,0.18) 0%, transparent 70%)',
                  }} />
                  <div style={{
                    position: 'absolute', inset: 0,
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}>
                    <span style={{ fontSize: 28, color: C.dim }}>＋</span>
                    <span style={{ fontSize: 14, color: C.dim }}>Upload cover photo</span>
                  </div>
                </>
              )}
              <div style={{
                position: 'absolute', bottom: 10, left: 10,
                background: 'rgba(0,0,0,0.45)', borderRadius: 999,
                padding: '3px 10px', fontSize: 12, color: C.cream,
              }}>
                {previewUrl ? 'Change photo' : 'Recommended 1:1'}
              </div>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={onFilePick}
            />
          </div>

          {/* Theme swatches */}
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
            {THEMES.map(t => {
              const selected = theme === t.id
              return (
                <button
                  key={t.id}
                  data-selected={selected}
                  onClick={() => setTheme(t.id)}
                  style={{
                    minWidth: 88, height: 60, borderRadius: 14,
                    background: t.bg, border: 'none', cursor: 'pointer',
                    flexShrink: 0,
                    outline: selected ? `2px solid ${t.accent}` : '2px solid transparent',
                    outlineOffset: 2,
                    display: 'flex', alignItems: 'flex-end',
                    justifyContent: 'center', paddingBottom: 8,
                  }}
                >
                  <span style={{ fontSize: 12, color: C.cream }}>{t.name}</span>
                </button>
              )
            })}
          </div>

          {/* Form fields */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            <div>
              <p style={{ color: C.dim, fontSize: 12, margin: '0 0 6px' }}>Title</p>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Dinner at Casa Mekawi"
                aria-label="Title"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: 'rgba(0,0,0,0.24)',
                  border: '1px solid rgba(243,233,221,0.16)',
                  borderRadius: 14, padding: '12px 16px',
                  color: C.cream, fontSize: 14,
                }}
              />
            </div>

            <div>
              <p style={{ color: C.dim, fontSize: 12, margin: '0 0 6px' }}>Tagline</p>
              <input
                type="text"
                value={tagline}
                onChange={e => setTagline(e.target.value)}
                placeholder="A night of good food and conversation"
                aria-label="Tagline"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: 'rgba(0,0,0,0.24)',
                  border: '1px solid rgba(243,233,221,0.16)',
                  borderRadius: 14, padding: '12px 16px',
                  color: C.cream, fontSize: 14,
                }}
              />
            </div>

            <div>
              <p style={{ color: C.dim, fontSize: 12, margin: '0 0 6px' }}>Date & Time</p>
              <input
                type="datetime-local"
                value={date}
                onChange={e => setDate(e.target.value)}
                data-testid="date-input"
                aria-label="Date & Time"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: 'rgba(0,0,0,0.24)',
                  border: '1px solid rgba(243,233,221,0.16)',
                  borderRadius: 14, padding: '12px 16px',
                  color: C.cream, fontSize: 14,
                  colorScheme: 'dark',
                }}
              />
            </div>

            <div>
              <p style={{ color: C.dim, fontSize: 12, margin: '0 0 6px' }}>Venue</p>
              <input
                type="text"
                value={venue}
                onChange={e => setVenue(e.target.value)}
                placeholder="The Garden Room, San Francisco"
                aria-label="Venue"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: 'rgba(0,0,0,0.24)',
                  border: '1px solid rgba(243,233,221,0.16)',
                  borderRadius: 14, padding: '12px 16px',
                  color: C.cream, fontSize: 14,
                }}
              />
            </div>

            <div>
              <p style={{ color: C.dim, fontSize: 12, margin: '0 0 6px' }}>Dress code</p>
              <input
                type="text"
                value={dressCode}
                onChange={e => setDressCode(e.target.value)}
                placeholder="Smart casual"
                aria-label="Dress code"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: 'rgba(0,0,0,0.24)',
                  border: '1px solid rgba(243,233,221,0.16)',
                  borderRadius: 14, padding: '12px 16px',
                  color: C.cream, fontSize: 14,
                }}
              />
            </div>

          </div>

          {/* Publish button */}
          <div>
            <button
              onClick={handleSubmit}
              disabled={!title || !date || submitting}
              style={{
                width: '100%', padding: '14px', borderRadius: 12,
                background: C.burgundy, color: C.cream, border: 'none',
                fontSize: 16,
                cursor: !title || !date ? 'default' : 'pointer',
                opacity: !title || !date || submitting ? 0.5 : 1,
                boxShadow: '0 0 16px rgba(92,26,27,0.5)',
              }}
            >Publish invite</button>

            {error && (
              <p style={{ color: C.rose, fontSize: 13, textAlign: 'center', marginTop: 12 }}>
                {error}
              </p>
            )}
          </div>

        </div>
      </div>
    </>
  )
}
