'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatProteinPreferenceLabel } from '@/lib/protein-preferences'
import { ProfileCard, type ProfileHistoryEntry } from '@/components/sofra-v2/ProfileCard'
import { fetchProfileHistory } from '@/lib/profiles'
import '@/components/sofra-v2/sofra-v2.css'
import { useAppearance } from '@/lib/sofra/appearance'
import {
  listPendingConnectionRequests,
  isConnectionSchemaUnavailable,
  respondToConnectionRequest,
  type PendingConnectionRequest,
} from '@/lib/connections'

type TasteProfileRow = {
  dietary: string[] | null
  avoid: string[] | null
  protein_preferences: string[] | null
  flavor_preference: string[] | null
  adventurousness: number | null
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
  const [appearance, setAppearance] = useAppearance()

  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [name, setName] = useState('You')
  const [phone, setPhone] = useState<string | null>(null)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [caption, setCaption] = useState('')
  const [savingCaption, setSavingCaption] = useState(false)
  const [captionEditing, setCaptionEditing] = useState(true)
  const [hostPreferenceHref, setHostPreferenceHref] = useState<string | null>(null)
  const [showPreferenceWarning, setShowPreferenceWarning] = useState(false)
  const [preferencesSummary, setPreferencesSummary] = useState<string | null>(null)
  const [history, setHistory] = useState<ProfileHistoryEntry[]>([])
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [connectionRequests, setConnectionRequests] = useState<PendingConnectionRequest[]>([])
  const [respondingConnectionId, setRespondingConnectionId] = useState<string | null>(null)
  const [connectionError, setConnectionError] = useState('')

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      const stored = localStorage.getItem('sofra_user_id')
      if (!stored) { router.push('/login'); return }
      setUserId(stored)
      setHostPreferenceHref('/profile/preferences')

      const [{ data: user }, { data: tasteProfile }, historyEntries, pendingConnections] = await Promise.all([
        supabase.from('users').select('name, phone, photo_url, caption').eq('id', stored).maybeSingle(),
        supabase
          .from('taste_profiles')
          .select('dietary, avoid, protein_preferences, flavor_preference, adventurousness')
          .eq('user_id', stored)
          .maybeSingle(),
        fetchProfileHistory(supabase, stored),
        listPendingConnectionRequests(supabase, stored).catch((connectionLoadError) => {
          if (!isConnectionSchemaUnavailable(connectionLoadError)) throw connectionLoadError
          setConnectionError('Connection requests are temporarily unavailable.')
          return []
        }),
      ])

      if (user) {
        setName(user.name || 'You')
        setPhone(user.phone || null)
        setPhotoUrl(user.photo_url || null)
        setCaption(user.caption || '')
        setCaptionEditing(!user.caption)
      }

      setPreferencesSummary(buildPreferencesSummary(tasteProfile as TasteProfileRow | null))
      setShowPreferenceWarning(
        !tasteProfile && localStorage.getItem(`sofra_dismiss_host_preferences:${stored}`) !== '1'
      )

      setHistory(historyEntries)
      setConnectionRequests(pendingConnections)
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

  async function saveCaption() {
    if (!userId || savingCaption) return
    setSavingCaption(true)
    const { error: captionError } = await supabase
      .from('users')
      .update({ caption: caption.trim() || null })
      .eq('id', userId)
    setSavingCaption(false)
    if (captionError) {
      setError('Could not save your caption. Try again.')
      return
    }
    setCaptionEditing(false)
  }

  async function respondToConnection(id: string, accept: boolean) {
    if (!userId || respondingConnectionId) return
    setRespondingConnectionId(id)
    setConnectionError('')
    try {
      const ok = await respondToConnectionRequest(supabase, id, userId, accept)
      if (!ok) throw new Error('Request is no longer pending')
      setConnectionRequests((requests) => requests.filter((request) => request.id !== id))
    } catch {
      setConnectionError("Couldn't update this connection request. Try again.")
    } finally {
      setRespondingConnectionId(null)
    }
  }

  return (
    <ProfileCard
      name={name}
      phone={phone}
      photoUrl={photoUrl}
      caption={caption}
      onCaptionChange={setCaption}
      onCaptionSave={saveCaption}
      savingCaption={savingCaption}
      captionEditing={captionEditing}
      onCaptionEdit={() => setCaptionEditing(true)}
      hostPreferenceHref={hostPreferenceHref}
      showPreferenceWarning={showPreferenceWarning}
      onDismissPreferenceWarning={() => {
        if (userId) localStorage.setItem(`sofra_dismiss_host_preferences:${userId}`, '1')
        setShowPreferenceWarning(false)
      }}
      onPhotoSelect={onPhotoSelect}
      uploading={uploading}
      uploadError={uploadError}
      dinnerCount={history.length}
      preferencesSummary={preferencesSummary}
      connectionRequests={connectionRequests}
      respondingConnectionId={respondingConnectionId}
      connectionError={connectionError}
      onRespondToConnection={(id, accept) => void respondToConnection(id, accept)}
      history={history}
      loading={loading}
      error={error}
      onHistorySelect={(id) => router.push('/events/' + id)}
      onLogout={handleLogout}
      appearance={appearance}
      onAppearanceChange={setAppearance}
    />
  )
}
