'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { C, THEMES, getTheme } from '@/lib/theme'

export default function HostNewPage() {
  const router = useRouter()
  const supabase = createClient()
  const uidRef = useRef<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const coverFileRef = useRef<File | null>(null)

  const [theme, setTheme] = useState('ember')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [tagline, setTagline] = useState('')
  const [date, setDate] = useState('')
  const [venue, setVenue] = useState('')
  const [address, setAddress] = useState('')
  const [dressCode, setDressCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const stored = localStorage.getItem('sofra_user_id')
    if (!stored) { router.push('/login'); return }
    uidRef.current = stored
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function onFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    coverFileRef.current = file
    setPreviewUrl(URL.createObjectURL(file))
  }

  async function handleSubmit() {
    if (submitting) return
    if (!uidRef.current) {
      setError('Session not ready. Please try again.')
      return
    }
    setSubmitting(true)
    setError('')

    let publicUrl: string | null = null
    if (coverFileRef.current) {
      const file = coverFileRef.current
      const ext = file.name.split('.').pop() ?? 'jpg'
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
        host_id: uidRef.current,
        title,
        tagline: tagline || null,
        event_date: new Date(date).toISOString(),
        venue: venue || null,
        address: address || null,
        dress_code: dressCode || null,
        theme,
        cover_url: publicUrl,
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

  const activeTheme = getTheme(theme)

  return (
    <>
      <style>{`
        input[type="datetime-local"]::-webkit-calendar-picker-indicator { filter: invert(0.6); }
      `}</style>
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
          style={{ maxWidth: 392, margin: '0 auto', padding: '22px 22px 32px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <button
              onClick={() => router.push('/events')}
              aria-label="← Events"
              style={{
                background: 'none',
                border: 'none',
                color: C.dim,
                fontSize: 14,
                cursor: 'pointer',
                padding: '4px 6px',
                fontFamily: 'Georgia, serif',
              }}
            >
              ← Events
            </button>
            <div style={{ flex: 1 }} />
          </div>

          <h1
            style={{
              color: C.cream,
              fontSize: 42,
              fontStyle: 'italic',
              letterSpacing: 0.5,
              textAlign: 'center',
              margin: '4px 0 4px',
              fontWeight: 400,
            }}
          >
            Sofra
          </h1>
          <div
            style={{
              color: C.cream,
              fontSize: 17,
              fontStyle: 'italic',
              textAlign: 'center',
              marginBottom: 22,
            }}
          >
            Host a Sofra
          </div>

          {/* Cover upload */}
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              width: '100%',
              height: 280,
              borderRadius: 24,
              position: 'relative',
              overflow: 'hidden',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: previewUrl ? '#000' : activeTheme.bg,
            }}
            aria-label="Upload cover photo"
          >
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <>
                <div
                  style={{
                    position: 'absolute',
                    top: -60,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: 280,
                    height: 280,
                    background:
                      'radial-gradient(circle, rgba(255,255,255,0.16), transparent 65%)',
                  }}
                />
                <div
                  style={{
                    color: C.cream,
                    fontSize: 34,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    zIndex: 2,
                  }}
                >
                  ＋
                  <div
                    style={{
                      fontSize: 13,
                      marginTop: 6,
                      fontFamily: 'system-ui, sans-serif',
                      opacity: 0.85,
                    }}
                  >
                    Upload cover photo
                  </div>
                </div>
              </>
            )}
            <div
              style={{
                position: 'absolute',
                bottom: 12,
                right: 12,
                background: 'rgba(0,0,0,0.55)',
                color: C.cream,
                fontSize: 11,
                padding: '5px 10px',
                borderRadius: 20,
                fontFamily: 'system-ui, sans-serif',
                zIndex: 3,
              }}
            >
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

          <label style={lbl}>Or pick a theme (used if no photo)</label>
          <div
            style={{
              display: 'flex',
              gap: 10,
              overflowX: 'auto',
              paddingBottom: 6,
            }}
          >
            {THEMES.map((t) => (
              <button
                key={t.id}
                onClick={() => setTheme(t.id)}
                data-selected={theme === t.id}
                style={{
                  minWidth: 88,
                  height: 60,
                  borderRadius: 14,
                  border: 'none',
                  cursor: 'pointer',
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'flex-end',
                  padding: 8,
                  background: t.bg,
                  outline:
                    theme === t.id ? `2px solid ${t.accent}` : '2px solid transparent',
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    color: C.cream,
                    fontSize: 11,
                    fontFamily: 'system-ui, sans-serif',
                    textShadow: '0 1px 4px rgba(0,0,0,0.6)',
                  }}
                >
                  {t.name}
                </span>
              </button>
            ))}
          </div>

          <label style={lbl} htmlFor="host-title">Event name</label>
          <input
            id="host-title"
            className="field"
            aria-label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Layla’s Long Table"
          />

          <label style={lbl} htmlFor="host-tagline">Tagline</label>
          <input
            id="host-tagline"
            className="field"
            aria-label="Tagline"
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            placeholder="A dinner for the ones who show up hungry."
          />

          <label style={lbl} htmlFor="host-date">When</label>
          <input
            id="host-date"
            className="field"
            type="datetime-local"
            aria-label="Date & Time"
            data-testid="date-input"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{ colorScheme: 'dark' }}
          />

          <label style={lbl} htmlFor="host-venue">Venue</label>
          <input
            id="host-venue"
            className="field"
            aria-label="Venue"
            value={venue}
            onChange={(e) => setVenue(e.target.value)}
            placeholder="Krasi — Meze & Wine"
          />

          <label style={lbl} htmlFor="host-address">Address</label>
          <input
            id="host-address"
            className="field"
            aria-label="Address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="48 Gloucester St, Boston"
          />

          <label style={lbl} htmlFor="host-dress">Dress code</label>
          <input
            id="host-dress"
            className="field"
            aria-label="Dress code"
            value={dressCode}
            onChange={(e) => setDressCode(e.target.value)}
            placeholder="Smart casual — wear something you can feast in."
          />

          <button
            className="prim wide"
            style={{ marginTop: 18 }}
            onClick={handleSubmit}
            disabled={!title || !date || submitting}
          >
            Publish invite
          </button>

          {error && (
            <p
              style={{
                color: C.rose,
                fontSize: 13,
                textAlign: 'center',
                marginTop: 12,
                fontFamily: 'system-ui, sans-serif',
              }}
            >
              {error}
            </p>
          )}
        </div>
      </div>
    </>
  )
}

const lbl: React.CSSProperties = {
  color: C.faint,
  fontSize: 12,
  letterSpacing: 1,
  fontWeight: 600,
  fontFamily: 'system-ui, sans-serif',
  display: 'block',
  margin: '18px 0 8px',
  textTransform: 'uppercase',
}
