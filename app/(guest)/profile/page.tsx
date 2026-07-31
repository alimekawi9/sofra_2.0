'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { C, THEMES, getTheme } from '@/lib/theme'

type LogRow = {
  id: string
  status: string
  events: {
    id: string
    title: string
    event_date: string
    venue: string | null
    theme: string
    cover_url: string | null
  } | null
}

type LogEntry = {
  id: string
  title: string
  date: string
  venue: string
  theme: string
  cover: string | null
  went: 'Going' | 'Went'
}

function formatShort(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function ProfilePage() {
  const router = useRouter()
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [name, setName] = useState('You')
  const [phone, setPhone] = useState('')
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [log, setLog] = useState<LogEntry[]>([])
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      const stored = localStorage.getItem('sofra_user_id')
      if (!stored) { router.push('/login'); return }
      setUserId(stored)

      const [{ data: user }, { data: rsvps }] = await Promise.all([
        supabase.from('users').select('name, phone, photo_url').eq('id', stored).maybeSingle(),
        supabase
          .from('rsvps')
          .select('id, status, events(id, title, event_date, venue, theme, cover_url)')
          .eq('user_id', stored),
      ])

      if (user) {
        setName(user.name || 'You')
        setPhone(user.phone || '')
        setPhotoUrl(user.photo_url || null)
      }

      const now = Date.now()
      const entries: LogEntry[] = ((rsvps ?? []) as unknown as LogRow[])
        .filter((r) => r.events !== null && (r.status === 'going' || r.status === 'maybe'))
        .map((r): LogEntry => {
          const ev = r.events!
          const past = new Date(ev.event_date).getTime() < now
          return {
            id: ev.id,
            title: ev.title,
            date: `${formatShort(ev.event_date)}${ev.venue ? ` · ${ev.venue}` : ''}`,
            venue: ev.venue ?? '',
            theme: ev.theme || 'ember',
            cover: ev.cover_url,
            went: past ? 'Went' : 'Going',
          }
        })
        .sort((a, b) => (a.went === 'Going' && b.went !== 'Going' ? -1 : 1))

      setLog(entries)
    } catch {
      setError("Couldn't load your profile. Try again.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleLogout() {
    localStorage.removeItem('sofra_user_id')
    router.push('/login')
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f || !userId) return

    setUploading(true)
    setUploadError('')

    const ext = f.name.includes('.') ? f.name.split('.').pop() : 'jpg'
    const path = `${userId}/${Date.now()}.${ext}`

    const { error: upErr } = await supabase.storage
      .from('avatars')
      .upload(path, f, { contentType: f.type || undefined, upsert: false })

    if (upErr) {
      setUploadError(upErr.message)
      setUploading(false)
      return
    }

    const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
    const url = pub.publicUrl

    const { error: dbErr } = await supabase
      .from('users')
      .update({ photo_url: url })
      .eq('id', userId)

    if (dbErr) {
      setUploadError(dbErr.message)
      setUploading(false)
      return
    }

    setPhotoUrl(url)
    setUploading(false)
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
        style={{ maxWidth: 392, margin: '0 auto', padding: '22px 22px 32px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button className="ghosticon" aria-label="Back" onClick={() => router.push('/events')}>
            ←
          </button>
          <div
            style={{
              flex: 1,
              textAlign: 'center',
              color: C.cream,
              fontSize: 17,
              fontStyle: 'italic',
            }}
          >
            Your profile
          </div>
          <div style={{ width: 34 }} />
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '10px 0 22px',
          }}
        >
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            style={{
              width: 104,
              height: 104,
              borderRadius: '50%',
              border: '2px dashed rgba(243,233,221,0.25)',
              background: 'rgba(255,255,255,0.03)',
              cursor: uploading ? 'wait' : 'pointer',
              overflow: 'hidden',
              padding: 0,
              opacity: uploading ? 0.6 : 1,
            }}
            aria-label="Upload profile photo"
          >
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoUrl}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <span
                style={{
                  color: C.dim,
                  fontSize: 26,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                }}
              >
                ＋
                <span
                  style={{
                    fontSize: 11,
                    marginTop: 2,
                    fontFamily: 'system-ui, sans-serif',
                  }}
                >
                  Add photo
                </span>
              </span>
            )}
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />

          {uploadError && (
            <div
              style={{
                color: C.rose,
                fontSize: 12,
                marginTop: 10,
                fontFamily: 'system-ui, sans-serif',
                textAlign: 'center',
                maxWidth: 260,
              }}
            >
              {uploadError}
            </div>
          )}

          <div style={{ color: C.cream, fontSize: 26, marginTop: 14 }}>{name}</div>
          <div
            style={{
              color: C.faint,
              fontSize: 13,
              marginTop: 3,
              fontFamily: 'system-ui, sans-serif',
            }}
          >
            {log.length} {log.length === 1 ? 'dinner' : 'dinners'}
            {phone ? ` · ${phone}` : ''}
          </div>
        </div>

        <div
          style={{
            color: C.faint,
            fontSize: 12,
            letterSpacing: 1.5,
            fontWeight: 600,
            fontFamily: 'system-ui, sans-serif',
            textTransform: 'uppercase',
            margin: '6px 0 14px',
          }}
        >
          Your table history
        </div>

        {loading ? (
          <div style={{ color: C.dim, fontSize: 13, fontFamily: 'system-ui, sans-serif' }}>
            Loading…
          </div>
        ) : error ? (
          <div style={{ color: C.rose, fontSize: 13, fontFamily: 'system-ui, sans-serif' }}>
            {error}
          </div>
        ) : log.length === 0 ? (
          <div
            style={{
              color: C.dim,
              fontSize: 13,
              fontFamily: 'system-ui, sans-serif',
              textAlign: 'center',
              padding: '24px 0',
            }}
          >
            No dinners yet. Your invites will show up here.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {log.map((d) => {
              const t = getTheme(d.theme) || THEMES[0]
              return (
                <button
                  key={d.id}
                  className="logrow"
                  onClick={() => router.push('/events/' + d.id)}
                >
                  <div
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 14,
                      overflow: 'hidden',
                      background: d.cover ? '#000' : t.bg,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {d.cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={d.cover}
                        alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <span style={{ fontSize: 22 }}>🍷</span>
                    )}
                  </div>
                  <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                    <div style={{ color: C.cream, fontSize: 16 }}>{d.title}</div>
                    <div
                      style={{
                        color: C.dim,
                        fontSize: 12,
                        marginTop: 3,
                        fontFamily: 'system-ui, sans-serif',
                      }}
                    >
                      {d.date}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontFamily: 'system-ui, sans-serif',
                        color: d.went === 'Going' ? t.accent : C.faint,
                      }}
                    >
                      {d.went}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}

        <button
          onClick={handleLogout}
          style={{
            background: 'none',
            border: 'none',
            color: C.faint,
            fontSize: 13,
            cursor: 'pointer',
            padding: '18px 0',
            marginTop: 32,
            textDecoration: 'underline',
            textUnderlineOffset: 3,
            display: 'block',
            width: '100%',
            textAlign: 'center',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          Log out
        </button>
      </div>
    </div>
  )
}
