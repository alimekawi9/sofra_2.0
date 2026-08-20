'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { C } from '@/lib/theme'
import { createClient } from '@/lib/supabase/client'
import { isEventManager } from '@/lib/event-access'

interface ChefTabsProps {
  eventId: string
  active: 'kitchen' | 'table' | 'menu' | 'recipes'
  title?: string
  subtitle?: string
  restrictedChef?: boolean
}

export default function ChefTabs({ eventId, active, title, subtitle, restrictedChef = false }: ChefTabsProps) {
  const router = useRouter()
  const supabase = createClient()
  const [canDelegateKitchen, setCanDelegateKitchen] = useState(false)
  const [kitchenSharing, setKitchenSharing] = useState(false)
  const [kitchenToken, setKitchenToken] = useState('')
  const [kitchenCopied, setKitchenCopied] = useState(false)
  const [kitchenShareError, setKitchenShareError] = useState('')

  async function fillKitchenMyself() {
    setKitchenShareError('')
    const { error } = await supabase
      .from('events')
      .update({ chef_id: null, kitchen_status: 'pending' })
      .eq('id', eventId)
    if (error) {
      setKitchenShareError('Could not open the kitchen. Try again.')
      return
    }
    router.push(`/kitchen?from=${eventId}&from_page=${active}`)
  }

  useEffect(() => {
    if (restrictedChef) return
    async function checkHost() {
      const userId = localStorage.getItem('sofra_user_id')
      if (!userId) return
      const { data } = await supabase.from('events').select('host_id').eq('id', eventId).maybeSingle()
      const allowed = Boolean(data) && await isEventManager(supabase, eventId, userId, data.host_id)
      setCanDelegateKitchen(allowed)
      if (allowed && new URLSearchParams(window.location.search).get('kitchenShare') === '1') setKitchenSharing(true)
    }
    void checkHost()
  }, [eventId, restrictedChef]) // eslint-disable-line react-hooks/exhaustive-deps

  async function ensureKitchenLink(): Promise<string | null> {
    if (kitchenToken) return new URL(`/events/${eventId}/chef?token=${kitchenToken}`, window.location.origin).toString()
    setKitchenShareError('')
    const { data, error } = await supabase.from('event_kitchen_invites').insert({ event_id: eventId }).select('token').single()
    if (error || !data?.token) {
      setKitchenShareError('Could not create a chef link. Try again.')
      return null
    }
    setKitchenToken(data.token)
    return new URL(`/events/${eventId}/chef?token=${data.token}`, window.location.origin).toString()
  }

  async function copyKitchenLink() {
    const url = await ensureKitchenLink()
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setKitchenCopied(true)
      setTimeout(() => setKitchenCopied(false), 2000)
    } catch { setKitchenShareError('Could not copy the link. Try WhatsApp instead.') }
  }

  async function shareKitchenWhatsApp() {
    const url = await ensureKitchenLink()
    if (!url) return
    window.open('https://wa.me/?text=' + encodeURIComponent(`Can you prepare the kitchen for ${title ?? 'this Sofra'}? ${url}`), '_blank')
  }

  return (
    <div className="sv2-chef-tabs" style={{ marginBottom: 14 }}>
      <div className="sv2-chef-tabs-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="sv2-chef-tabs-identity">
          <div className="sv2-chef-tabs-brand" style={{ color: C.cream, fontSize: 24, fontStyle: 'italic' }}>
            Sofra{' '}
            <span
              style={{
                color: C.gold,
                fontSize: 14,
                fontStyle: 'normal',
                fontFamily: 'system-ui, sans-serif',
                letterSpacing: 1,
              }}
            >
              · Kitchen
            </span>
          </div>
          {(title || subtitle) && (
            <div className="sv2-chef-tabs-subtitle"
              style={{
                color: C.dim,
                fontSize: 13,
                marginTop: 4,
                fontFamily: 'system-ui, sans-serif',
              }}
            >
              {title}
              {title && subtitle ? ' · ' : ''}
              {subtitle}
            </div>
          )}
        </div>
        {canDelegateKitchen && <div className="sv2-chef-kitchen-actions">
          <button
            onClick={() => void fillKitchenMyself()}
            className="regen"
            aria-label="Fill kitchen myself"
            style={{ background: 'transparent', border: '1px solid rgba(217,161,91,0.35)' }}
          >
            Fill Kitchen Myself
          </button>
          <button
            onClick={() => setKitchenSharing((open) => !open)}
            className="regen"
            aria-expanded={kitchenSharing}
            style={{ background: 'transparent', border: '1px solid rgba(217,161,91,0.35)' }}
          >
            Send To A Chef
          </button>
        </div>}
      </div>

      {canDelegateKitchen && kitchenSharing && (
        <div className="sv2-kitchen-share-panel">
          <p>This link gives one person access to this event&rsquo;s Kitchen, Drafted Menu, and Recipes.</p>
          <div className="sv2-host-share-actions">
            <button type="button" onClick={() => void copyKitchenLink()}>{kitchenCopied ? 'COPIED!' : 'COPY CHEF LINK'}</button>
            <button type="button" onClick={() => void shareKitchenWhatsApp()}>SEND VIA WHATSAPP</button>
          </div>
        </div>
      )}
      {kitchenShareError && <p role="alert" className="sv2-kitchen-action-error">{kitchenShareError}</p>}

      <div className="sv2-chef-tabs-nav"
        style={{
          display: 'flex',
          gap: 6,
          paddingTop: 14,
          borderBottom: `1px solid ${C.line}`,
          marginTop: 14,
        }}
      >
        {!restrictedChef && <button
          className={active === 'table' ? 'tab on' : 'tab'}
          onClick={() => router.push(`/events/${eventId}/table`)}
        >
          The Table
        </button>}
        {restrictedChef && <button className={active === 'kitchen' ? 'tab on' : 'tab'} onClick={() => router.push(`/kitchen?from=${eventId}&delegate=1`)}>Kitchen</button>}
        <button
          className={active === 'menu' ? 'tab on' : 'tab'}
          onClick={() => router.push(`/events/${eventId}/menu`)}
        >
          Drafted Menu
        </button>
        <button
          className={active === 'recipes' ? 'tab on' : 'tab'}
          onClick={() => router.push(`/events/${eventId}/recipes`)}
        >
          Recipes
        </button>
      </div>
    </div>
  )
}
