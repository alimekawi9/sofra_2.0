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

const THEME_GRADIENTS: Record<string, string> = {
  ember:    'radial-gradient(120% 80% at 50% 0%, #7A2324 0%, #3A1416 45%, #140E10 100%)',
  olive:    'radial-gradient(120% 80% at 50% 0%, #5B6B4E 0%, #2E3826 50%, #14140E 100%)',
  midnight: 'radial-gradient(120% 80% at 50% 0%, #26304A 0%, #161C2E 50%, #0C0E14 100%)',
  saffron:  'radial-gradient(120% 80% at 50% 0%, #B5701E 0%, #6E4212 50%, #17100A 100%)',
  plum:     'radial-gradient(120% 80% at 50% 0%, #4A2540 0%, #2A162A 50%, #120A12 100%)',
}

const STATUS_LABELS: Record<string, string> = {
  going: 'Going',
  maybe: 'Maybe',
  cant:  "Can't go",
}

type EventRow = {
  id:         string
  title:      string
  event_date: string
  venue:      string | null
  cover_url:  string | null
  theme:      string | null
}

type HistoryRow = {
  status: string
  events: EventRow
}

export default function ProfilePage() {
  const router   = useRouter()
  const supabase = createClient()
  const uidRef   = useRef<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [loading,     setLoading]     = useState(true)
  const [fetchError,  setFetchError]  = useState('')
  const [photoUrl,    setPhotoUrl]    = useState<string | null>(null)
  const [previewUrl,  setPreviewUrl]  = useState<string | null>(null)
  const [history,     setHistory]     = useState<HistoryRow[]>([])
  const [uploading,   setUploading]   = useState(false)
  const [uploadError, setUploadError] = useState('')

  async function loadData() {
    setLoading(true)
    setFetchError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      uidRef.current = user.id

      const [{ data: userRow, error: e1 }, { data: rsvpRows, error: e2 }] = await Promise.all([
        supabase.from('users').select('photo_url').eq('id', user.id).maybeSingle(),
        supabase
          .from('rsvps')
          .select('status, events!inner(id, title, event_date, venue, cover_url, theme)')
          .eq('user_id', user.id),
      ])

      if (e1 || e2) throw new Error('fetch failed')

      setPhotoUrl(userRow?.photo_url ?? null)

      const rows = (rsvpRows ?? []) as unknown as HistoryRow[]
      rows.sort((a, b) =>
        new Date(b.events.event_date).getTime() - new Date(a.events.event_date).getTime()
      )
      setHistory(rows)
    } catch {
      setFetchError("Couldn't load your profile. Try again.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function onFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPreviewUrl(URL.createObjectURL(file))
    void handleAvatarUpload(file)
  }

  async function handleAvatarUpload(file: File) {
    if (!uidRef.current || uploading) return
    setUploading(true)
    setUploadError('')

    const ext  = file.name.split('.').pop() ?? 'jpg'
    const path = `${uidRef.current}/${crypto.randomUUID()}.${ext}`

    const { error: uploadErr } = await supabase.storage
      .from('avatars')
      .upload(path, file)

    if (uploadErr) {
      setUploadError('Photo upload failed. Please try again.')
      setUploading(false)
      setPreviewUrl(null)
      return
    }

    const publicUrl = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl

    const { error: updateErr } = await supabase
      .from('users')
      .update({ photo_url: publicUrl })
      .eq('id', uidRef.current)

    if (updateErr) {
      setUploadError('Failed to save photo. Please try again.')
      setUploading(false)
      return
    }

    setPhotoUrl(publicUrl)
    setUploading(false)
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    })
  }

  const displayPhoto = previewUrl ?? photoUrl

  return (
    <>
      <style>{`
        @keyframes skPulse { 0%,100%{opacity:.4} 50%{opacity:.7} }
        @keyframes spin { to { transform: rotate(360deg); } }
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
        {/* Radial glow */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(ellipse 80% 40% at 50% 0%, rgba(217,161,91,0.18) 0%, transparent 70%)',
        }} />

        {/* Wordmark */}
        <h1 style={{
          fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 52,
          color: C.cream, textAlign: 'center', margin: '0 0 32px',
          position: 'relative', zIndex: 1,
        }}>Sofra</h1>

        <div style={{
          width: '100%', maxWidth: 400,
          position: 'relative', zIndex: 1,
          display: 'flex', flexDirection: 'column', gap: 32,
        }}>

          {/* Loading skeleton */}
          {loading && (
            <div>
              <div style={{
                width: 80, height: 80, borderRadius: '50%',
                background: 'rgba(255,255,255,0.08)',
                margin: '0 auto 24px',
                animation: 'skPulse 1.4s ease-in-out infinite',
              }} />
              {[0, 1, 2].map(i => (
                <div key={i} style={{
                  height: 72, borderRadius: 14,
                  background: 'rgba(255,255,255,0.08)',
                  marginBottom: 12,
                  animation: 'skPulse 1.4s ease-in-out infinite',
                }} />
              ))}
            </div>
          )}

          {/* Fetch error */}
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
              {/* Section 1: Profile photo */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <button
                  onClick={() => { if (!uploading) fileInputRef.current?.click() }}
                  style={{
                    width: 80, height: 80, borderRadius: '50%',
                    border: `2px solid ${uploading ? C.faint : C.dim}`,
                    background: 'rgba(0,0,0,0.24)',
                    padding: 0,
                    cursor: uploading ? 'default' : 'pointer',
                    overflow: 'hidden',
                    position: 'relative',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {displayPhoto ? (
                    <img
                      src={displayPhoto}
                      alt="profile"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <span style={{ fontSize: 28, color: C.dim }}>＋</span>
                  )}

                  {uploading && (
                    <div style={{
                      position: 'absolute', inset: 0,
                      background: 'rgba(20,14,16,0.6)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <div style={{
                        width: 20, height: 20, borderRadius: '50%',
                        border: `2px solid ${C.gold}`,
                        borderTopColor: 'transparent',
                        animation: 'spin 0.8s linear infinite',
                      }} />
                    </div>
                  )}
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={onFilePick}
                />

                <p style={{ color: C.dim, fontSize: 13, margin: 0 }}>
                  {uploading ? 'Uploading…' : 'Tap to change photo'}
                </p>

                {uploadError && (
                  <p style={{ color: C.rose, fontSize: 13, textAlign: 'center', margin: 0 }}>
                    {uploadError}
                  </p>
                )}
              </div>

              {/* Section 2: Event history */}
              <div>
                <p style={{ color: C.dim, fontSize: 13, margin: '0 0 12px' }}>Event history</p>

                {history.length === 0 ? (
                  <p style={{ color: C.faint, fontSize: 14, textAlign: 'center', paddingTop: 20 }}>
                    No events yet
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {history.map(({ status, events: ev }) => {
                      const thumbBg = ev.cover_url
                        ? undefined
                        : (THEME_GRADIENTS[ev.theme ?? 'ember'] ?? THEME_GRADIENTS.ember)

                      return (
                        <button
                          key={ev.id}
                          onClick={() => router.push('/events/' + ev.id)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 14,
                            width: '100%', padding: '12px 14px', borderRadius: 14,
                            background: 'rgba(0,0,0,0.24)',
                            border: '1px solid rgba(243,233,221,0.10)',
                            cursor: 'pointer', textAlign: 'left',
                          }}
                        >
                          {/* Thumbnail */}
                          <div style={{
                            width: 52, height: 52, borderRadius: 10,
                            flexShrink: 0, overflow: 'hidden',
                            background: thumbBg,
                          }}>
                            {ev.cover_url && (
                              <img
                                src={ev.cover_url}
                                alt=""
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              />
                            )}
                          </div>

                          {/* Title + date/venue */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{
                              color: C.cream, fontSize: 15, fontWeight: 500,
                              margin: '0 0 3px',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>{ev.title}</p>
                            <p style={{
                              color: C.dim, fontSize: 12, margin: 0,
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                              {formatDate(ev.event_date)}
                              {ev.venue ? ` · ${ev.venue}` : ''}
                            </p>
                          </div>

                          {/* RSVP status badge */}
                          <span style={{
                            flexShrink: 0, fontSize: 12, borderRadius: 999, padding: '3px 10px',
                            background: status === 'going'
                              ? 'rgba(217,161,91,0.12)'
                              : status === 'maybe'
                              ? 'rgba(183,164,147,0.12)'
                              : 'rgba(201,123,110,0.12)',
                            color: status === 'going'
                              ? C.gold
                              : status === 'maybe'
                              ? C.dim
                              : C.rose,
                            border: status === 'going'
                              ? '1px solid rgba(217,161,91,0.3)'
                              : status === 'maybe'
                              ? '1px solid rgba(183,164,147,0.3)'
                              : '1px solid rgba(201,123,110,0.3)',
                          }}>
                            {STATUS_LABELS[status] ?? status}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </>
          )}

        </div>
      </div>
    </>
  )
}
