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
        </div>
      </div>
    </>
  )
}
