'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatProteinPreferenceLabel } from '@/lib/protein-preferences'
import { ProfileCard, type ProfileHistoryEntry } from '@/components/sofra-v2/ProfileCard'
import '@/components/sofra-v2/sofra-v2.css'

type LogRow = {
  id: string
  status: string
  events: {
    id: string
    title: string
    event_date: string
    venue: string | null
  } | null
}

type TasteProfileRow = {
  dietary: string[] | null
  avoid: string[] | null
  protein_preferences: string[] | null
  flavor_preference: string[] | null
  adventurousness: number | null
}

function formatShort(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function buildPreferencesSummary(profile: TasteProfileRow | null): string | null {
  if (!profile) return null

  const parts: string[] = []
  if (profile.dietary?.length) parts.push(profile.dietary.join(', '))
  if (profile.avoid?.length) parts.push(`avoids ${profile.avoid.join(', ').toLowerCase()}`)
  if (profile.protein_preferences?.length) {
    parts.push(profile.protein_preferences.map(formatProteinPreferenceLabel).join(', ').toLowerCase())
  }
  if (profile.flavor_preference?.length) parts.push(profile.flavor_preference.join(', ').toLowerCase())
  if (typeof profile.adventurousness === 'number') parts.push(`adventurousness ${profile.adventurousness}`)

  return parts.length ? parts.join(' · ') : null
}

export default function ProfilePage() {
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [name, setName] = useState('You')
  const [phone, setPhone] = useState<string | null>(null)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [preferencesSummary, setPreferencesSummary] = useState<string | null>(null)
  const [history, setHistory] = useState<ProfileHistoryEntry[]>([])
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

      const [{ data: user }, { data: rsvps }, { data: tasteProfile }] = await Promise.all([
        supabase.from('users').select('name, phone, photo_url').eq('id', stored).maybeSingle(),
        supabase
          .from('rsvps')
          .select('id, status, events(id, title, event_date, venue)')
          .eq('user_id', stored),
        supabase
          .from('taste_profiles')
          .select('dietary, avoid, protein_preferences, flavor_preference, adventurousness')
          .eq('user_id', stored)
          .maybeSingle(),
      ])

      if (user) {
        setName(user.name || 'You')
        setPhone(user.phone || null)
        setPhotoUrl(user.photo_url || null)
      }

      setPreferencesSummary(buildPreferencesSummary(tasteProfile as TasteProfileRow | null))

      const now = Date.now()
      const entries: ProfileHistoryEntry[] = ((rsvps ?? []) as unknown as LogRow[])
        .filter((r) => r.events !== null && (r.status === 'going' || r.status === 'maybe'))
        .map((r): ProfileHistoryEntry => {
          const ev = r.events!
          const past = new Date(ev.event_date).getTime() < now
          return {
            id: ev.id,
            title: ev.title,
            date: `${formatShort(ev.event_date)}${ev.venue ? ` · ${ev.venue}` : ''}`,
            went: past ? 'Went' : 'Going',
          }
        })
        .sort((a, b) => (a.went === 'Going' && b.went !== 'Going' ? -1 : 1))

      setHistory(entries)
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

  async function onPhotoSelect(file: File) {
    if (!userId) return

    setUploading(true)
    setUploadError('')

    const ext = file.name.includes('.') ? file.name.split('.').pop() : 'jpg'
    const path = `${userId}/${Date.now()}.${ext}`

    const { error: upErr } = await supabase.storage
      .from('avatars')
      .upload(path, file, { contentType: file.type || undefined, upsert: false })

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
    <ProfileCard
      name={name}
      phone={phone}
      photoUrl={photoUrl}
      onPhotoSelect={onPhotoSelect}
      uploading={uploading}
      uploadError={uploadError}
      dinnerCount={history.length}
      preferencesSummary={preferencesSummary}
      history={history}
      loading={loading}
      error={error}
      onHistorySelect={(id) => router.push('/events/' + id)}
      onLogout={handleLogout}
    />
  )
}
