'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { AlbumAvatar } from '@/components/sofra-v2/AlbumAvatar'
import { SofraHistoryArtwork } from '@/components/sofra-v2/SofraHistoryArtwork'
import { areMutuals, fetchProfileHistory, type ProfileHistoryEntry } from '@/lib/profiles'
import '@/components/sofra-v2/sofra-v2.css'

type PublicProfile = {
  id: string
  name: string
  photo_url: string | null
  caption: string | null
}

export default function PublicProfilePage({ params }: { params: { userId: string } }) {
  const router = useRouter()
  const supabase = createClient()
  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [history, setHistory] = useState<ProfileHistoryEntry[]>([])
  const [canSeeHistory, setCanSeeHistory] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function loadProfile() {
    setLoading(true)
    setError('')
    try {
      const viewerId = localStorage.getItem('sofra_user_id')
      if (!viewerId) {
        router.push('/name?next=' + encodeURIComponent(`/profile/${params.userId}`))
        return
      }

      const { data, error: profileError } = await supabase
        .from('users')
        .select('id,name,photo_url,caption')
        .eq('id', params.userId)
        .maybeSingle()
      if (profileError || !data) throw profileError ?? new Error('Profile not found')
      setProfile(data as PublicProfile)

      // The authorization gate intentionally runs before the history query.
      // Non-mutual viewers never fetch another user's RSVP history.
      const allowed = viewerId === params.userId || await areMutuals(supabase, viewerId, params.userId)
      setCanSeeHistory(allowed)
      if (allowed) setHistory(await fetchProfileHistory(supabase, params.userId))
      else setHistory([])
    } catch {
      setError("Couldn't load this profile. Try again.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadProfile() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="sv2-root sv2-device-page sv2-app-page">
      <main className="sv2-device-shell sv2-app-shell sv2-public-profile-shell">
        <Link className="sv2-back-link" href="/events">← Your Sofras</Link>
        {loading ? <p>Loading...</p> : error ? <p role="alert">{error}</p> : profile && (
          <>
            <section className="sv2-public-profile-identity">
              <AlbumAvatar name={profile.name} photoUrl={profile.photo_url} />
              <h1>{profile.name}</h1>
              {profile.caption && <p>{profile.caption}</p>}
            </section>
            <section className="sv2-profile-history">
              <h2>Sofras attended</h2>
              {!canSeeHistory ? (
                <p>RSVP to a shared Sofra to see their table history.</p>
              ) : history.length === 0 ? (
                <p>No Sofras to show yet.</p>
              ) : (
                <div>
                  {history.map((event, index) => (
                    <article key={event.id}>
                      <SofraHistoryArtwork index={index} />
                      <div><h3>{event.title}</h3><p>{event.date}</p></div>
                      <strong>{event.went}</strong>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  )
}
