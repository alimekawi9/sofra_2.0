'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { AlbumAvatar } from '@/components/sofra-v2/AlbumAvatar'
import { SofraHistoryArtwork } from '@/components/sofra-v2/SofraHistoryArtwork'
import { fetchProfileHistory, type ProfileHistoryEntry } from '@/lib/profiles'
import {
  getConnectionContext,
  isConnectionSchemaUnavailable,
  requestConnection,
  respondToConnectionRequest,
  type ConnectionContext,
} from '@/lib/connections'
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
  const [viewerId, setViewerId] = useState('')
  const [connection, setConnection] = useState<ConnectionContext | null>(null)
  const [connectionBusy, setConnectionBusy] = useState(false)
  const [connectionError, setConnectionError] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function loadProfile() {
    setLoading(true)
    setError('')
    try {
      const storedViewerId = localStorage.getItem('sofra_user_id')
      if (!storedViewerId) {
        router.push('/name?next=' + encodeURIComponent(`/profile/${params.userId}`))
        return
      }
      setViewerId(storedViewerId)

      const { data, error: profileError } = await supabase
        .from('users')
        .select('id,name,photo_url,caption')
        .eq('id', params.userId)
        .maybeSingle()
      if (profileError || !data) throw profileError ?? new Error('Profile not found')
      setProfile(data as PublicProfile)

      // The authorization gate intentionally runs before the history query.
      // Shared attendance establishes eligibility only. History is fetched
      // after an explicit connection has been accepted.
      let context: ConnectionContext | null = null
      if (storedViewerId !== params.userId) {
        try {
          context = await getConnectionContext(supabase, storedViewerId, params.userId)
        } catch (connectionLoadError) {
          if (!isConnectionSchemaUnavailable(connectionLoadError)) throw connectionLoadError
          setConnectionError('Connections are temporarily unavailable. You can still view this profile.')
        }
      }
      setConnection(context)
      const allowed = storedViewerId === params.userId || context?.status === 'accepted'
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

  async function sendConnectionRequest() {
    if (!viewerId || connectionBusy) return
    setConnectionBusy(true)
    setConnectionError('')
    try {
      await requestConnection(supabase, viewerId, params.userId, connection?.originatingEventId)
      setConnection(await getConnectionContext(supabase, viewerId, params.userId))
    } catch {
      setConnectionError("Couldn't send this connection request. Try again.")
    } finally {
      setConnectionBusy(false)
    }
  }

  async function respondToRequest(accept: boolean) {
    if (!viewerId || !connection?.requestId || connectionBusy) return
    setConnectionBusy(true)
    setConnectionError('')
    try {
      const ok = await respondToConnectionRequest(supabase, connection.requestId, viewerId, accept)
      if (!ok) throw new Error('Request is no longer pending')
      if (accept) setHistory(await fetchProfileHistory(supabase, params.userId))
      setCanSeeHistory(accept)
      setConnection(await getConnectionContext(supabase, viewerId, params.userId))
    } catch {
      setConnectionError("Couldn't update this connection request. Try again.")
    } finally {
      setConnectionBusy(false)
    }
  }

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
              {viewerId !== profile.id && connection && (
                <div className="sv2-public-profile-connection">
                  {connection.originatingEventTitle && connection.status !== 'accepted' && (
                    <p>You shared {connection.originatingEventTitle}.</p>
                  )}
                  {connection.status === 'eligible' && (
                    <button type="button" disabled={connectionBusy} onClick={() => void sendConnectionRequest()}>
                      {connectionBusy ? 'SENDING...' : 'REQUEST CONNECTION'}
                    </button>
                  )}
                  {connection.status === 'pending' && connection.direction === 'outgoing' && <strong>CONNECTION REQUEST PENDING</strong>}
                  {connection.status === 'pending' && connection.direction === 'incoming' && (
                    <div>
                      <button type="button" disabled={connectionBusy} onClick={() => void respondToRequest(true)}>ACCEPT</button>
                      <button type="button" disabled={connectionBusy} onClick={() => void respondToRequest(false)}>DECLINE</button>
                    </div>
                  )}
                  {connection.status === 'accepted' && <strong>CONNECTED</strong>}
                  {connection.status === 'cooldown' && <strong>REQUEST DECLINED · TRY AGAIN IN A DAY OR TWO</strong>}
                  {connectionError && <p role="alert">{connectionError}</p>}
                </div>
              )}
              {viewerId !== profile.id && !connection && connectionError && (
                <p className="sv2-public-profile-connection-unavailable" role="status">{connectionError}</p>
              )}
            </section>
            <section className="sv2-profile-history">
              <h2>Sofras attended</h2>
              {!canSeeHistory ? (
                <p>Connect to see their table history.</p>
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
