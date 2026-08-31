'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { isEventManager } from '@/lib/event-access'
import '@/components/sofra-v2/sofra-v2.css'

type KitchenKind = 'independent' | 'restaurant'

export default function KitchenSetupChoicePage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const search = useSearchParams()
  const supabase = useMemo(() => createClient(), [])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<KitchenKind | null>(null)
  const [error, setError] = useState('')
  const [title, setTitle] = useState('')
  const [manager, setManager] = useState(false)
  const [delegatedChef, setDelegatedChef] = useState(false)
  const fromPage = search.get('from_page') === 'table' ? 'table' : 'menu'

  useEffect(() => {
    async function load() {
      const stored = localStorage.getItem('sofra_user_id')
      if (!stored) { router.replace(`/login?next=${encodeURIComponent(`/events/${params.id}/kitchen-setup${search.toString() ? `?${search.toString()}` : ''}`)}`); return }
      const { data: event, error: eventError } = await supabase.from('events').select('host_id,chef_id,title').eq('id', params.id).maybeSingle()
      if (eventError || !event) { setError("Couldn't load this kitchen."); setLoading(false); return }
      const isManager = await isEventManager(supabase, params.id, stored, event.host_id)
      const isChef = event.chef_id === stored && !isManager
      if (!isManager && !isChef) { router.replace(`/events/${params.id}`); return }
      setManager(isManager)
      setDelegatedChef(isChef)
      setTitle(event.title)
      setLoading(false)
    }
    void load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function choose(kind: KitchenKind) {
    setBusy(kind)
    setError('')
    if (manager) {
      const { error: updateError } = await supabase.from('events').update({ chef_id: null, kitchen_status: 'pending' }).eq('id', params.id)
      if (updateError) { setError('Could not open this kitchen. Try again.'); setBusy(null); return }
    }
    const delegate = delegatedChef ? '&delegate=1' : ''
    if (kind === 'restaurant') router.push(`/events/${params.id}/out?from_page=${fromPage}${delegate}`)
    else router.push(`/kitchen?from=${params.id}&from_page=${fromPage}${delegate}`)
  }

  return <div className="sv2-root sv2-device-page sv2-app-page sv2-kitchen-choice-page">
    <main className="sv2-device-shell sv2-app-shell sv2-kitchen-choice-shell">
      {!delegatedChef && <button type="button" className="sv2-back-link" onClick={() => router.push(`/events/${params.id}/${fromPage}`)}>← Back</button>}
      <header><p>SOFRA · KITCHEN</p><h1>Is this at a restaurant or at home / elsewhere?</h1><span>{title}</span></header>
      {loading ? <p className="sv2-kitchen-choice-state">Opening the kitchen…</p> : <div className="sv2-kitchen-choice-grid">
        <button type="button" disabled={Boolean(busy)} onClick={() => void choose('independent')}>
          <span aria-hidden="true">01</span><strong>Home / other</strong><small>Use signatures and pantry inventory to compose the menu.</small>
        </button>
        <button type="button" disabled={Boolean(busy)} onClick={() => void choose('restaurant')}>
          <span aria-hidden="true">02</span><strong>Restaurant</strong><small>Upload or paste the restaurant menu, review its dishes, and compare table fit.</small>
        </button>
      </div>}
      {busy && <p className="sv2-kitchen-choice-state">Opening {busy === 'restaurant' ? 'restaurant menus' : 'your kitchen'}…</p>}
      {error && <p className="sv2-kitchen-choice-error" role="alert">{error}</p>}
    </main>
  </div>
}
