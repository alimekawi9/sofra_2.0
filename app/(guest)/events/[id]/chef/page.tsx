'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { InviteLanding } from '@/components/sofra-v2/InviteLanding'
import { createClient } from '@/lib/supabase/client'
import '@/components/sofra-v2/sofra-v2.css'
import { loginDestination } from '@/lib/event-entry'

export default function KitchenInvitePage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const search = useSearchParams()
  const supabase = createClient()
  const token = search.get('token') ?? ''
  const claimed = search.get('claim') === '1'
  const [title, setTitle] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      const userId = localStorage.getItem('sofra_user_id')
      const claimPath = `/events/${params.id}/chef?token=${encodeURIComponent(token)}&claim=1`
      if (!userId) {
        router.replace(loginDestination(claimPath))
        return
      }
      const [{ data: event }, { data: cohost }] = await Promise.all([
        supabase.from('events').select('title,host_id,chef_id').eq('id', params.id).maybeSingle(),
        supabase.from('event_cohosts').select('user_id').eq('event_id', params.id).eq('user_id', userId).maybeSingle(),
      ])
      if (!event) { setError("Couldn't load this invitation."); setLoading(false); return }
      if (event.chef_id === userId) { router.replace(`/kitchen?from=${params.id}&delegate=1`); return }
      if (event.host_id === userId || cohost) { router.replace(`/events/${params.id}`); return }

      const { data: invite } = await supabase.from('event_kitchen_invites')
        .select('event_id,status').eq('token', token).eq('event_id', params.id).maybeSingle()
      if (!invite || invite.status !== 'pending') {
        setError('This chef invitation is no longer available.')
        setLoading(false)
        return
      }
      setTitle(event.title)
      setLoading(false)
    }
    void load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!claimed || loading || error) return
    async function accept() {
      const userId = localStorage.getItem('sofra_user_id')
      if (!userId) return
      const { data, error: acceptError } = await supabase.rpc('accept_kitchen_invite', { p_token: token, p_user_id: userId })
      if (acceptError || data !== params.id) {
        setError('This chef invitation could not be accepted. It may already have been used.')
        return
      }
      router.replace(`/kitchen?from=${params.id}&delegate=1`)
    }
    void accept()
  }, [claimed, loading, error]) // eslint-disable-line react-hooks/exhaustive-deps

  function claim() {
    const next = `/events/${params.id}/chef?token=${encodeURIComponent(token)}&claim=1`
    if (localStorage.getItem('sofra_user_id')) router.push(next)
    else router.replace(loginDestination(next))
  }

  if (loading || (claimed && !error)) return null
  if (error) return <main className="sv2-root sv2-device-page sv2-app-page"><div className="sv2-device-shell sv2-app-shell"><p role="alert">{error}</p></div></main>
  return <InviteLanding eventId={params.id} title={title} onClaimSeat={claim} kicker="You are invited to prepare the kitchen" buttonLabel="OPEN THE KITCHEN" />
}
