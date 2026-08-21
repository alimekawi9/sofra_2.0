'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { sv2Display, sv2Sans } from '@/components/sofra-v2/fonts'
import { createClient } from '@/lib/supabase/client'
import { isEventManager } from '@/lib/event-access'
import { buildUpdateMessage, type UpdateEventInput, type UpdateTemplateId } from '@/lib/event-updates'
import '@/components/sofra-v2/sofra-v2.css'

type EventRow = UpdateEventInput & { id: string; host_id: string }

const TEMPLATES: Array<{ id: UpdateTemplateId; label: string }> = [
  { id: 'photos', label: 'PHOTOS ARE UP' },
  { id: 'details', label: 'UPDATE TO DATE/TIME/LOCATION' },
  { id: 'custom', label: 'CUSTOM' },
]

function canonicalUrl(path: string): string {
  return new URL(path, window.location.origin).toString()
}

export default function EventUpdatePage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const supabase = createClient()
  const uidRef = useRef<string | null>(null)

  const [event, setEvent] = useState<EventRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [canManage, setCanManage] = useState(false)
  const [message, setMessage] = useState('')
  const [copied, setCopied] = useState(false)
  const [copyFallback, setCopyFallback] = useState('')

  function messageUrls() {
    return {
      inviteUrl: canonicalUrl('/events/' + params.id + '?entry=update'),
      albumUrl: canonicalUrl('/events/' + params.id + '/album?entry=update'),
    }
  }

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      const stored = localStorage.getItem('sofra_user_id')
      if (!stored) {
        router.replace('/login?next=' + encodeURIComponent('/events/' + params.id + '/update'))
        return
      }
      uidRef.current = stored

      const { data: ev, error: eventError } = await supabase
        .from('events')
        .select('id,host_id,title,event_date,venue,address')
        .eq('id', params.id)
        .single()
      if (eventError || !ev) throw new Error('event not found')
      const loadedEvent = ev as EventRow
      setEvent(loadedEvent)

      const allowed = await isEventManager(supabase, params.id, stored, loadedEvent.host_id)
      setCanManage(allowed)
      if (!allowed) {
        setError('Only the host or a co-host can send an update for this Sofra.')
        return
      }

      const { inviteUrl, albumUrl } = messageUrls()
      setMessage(buildUpdateMessage('custom', loadedEvent, inviteUrl, albumUrl))
    } catch {
      setError("Couldn't load this event. Try again.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadData() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function applyTemplate(templateId: UpdateTemplateId) {
    if (!event) return
    const { inviteUrl, albumUrl } = messageUrls()
    setMessage(buildUpdateMessage(templateId, event, inviteUrl, albumUrl))
  }

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(message)
      setCopyFallback('')
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopyFallback(message)
    }
  }

  function shareWhatsApp() {
    window.open('https://wa.me/?text=' + encodeURIComponent(message), '_blank')
  }

  return (
    <div className={`sv2-root sv2-device-page sv2-app-page ${sv2Display.variable} ${sv2Sans.variable}`}>
      <main className="sv2-device-shell sv2-app-shell sv2-update-page-shell">
        <Link className="sv2-back-link" href={'/events/' + params.id}>← Event details</Link>
        <header className="sv2-update-page-header">
          <p>{event?.title ?? 'Your Sofra'}</p>
          <h1>Send an update</h1>
        </header>

        {loading ? (
          <p style={{ fontSize: 13 }}>Loading…</p>
        ) : !canManage ? (
          <div className="sv2-chat-access-error"><p role="alert">{error}</p><Link href={'/events/' + params.id}>BACK TO EVENT</Link></div>
        ) : (
          <>
            <div className="sv2-update-templates">
              {TEMPLATES.map((template) => (
                <button key={template.id} type="button" onClick={() => applyTemplate(template.id)}>
                  {template.label}
                </button>
              ))}
            </div>

            <textarea
              className="sv2-update-textarea"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={8}
            />

            {copyFallback && (
              <input
                readOnly
                value={copyFallback}
                autoFocus
                onFocus={(e) => e.target.select()}
                style={{ display: 'block', width: '100%', margin: '10px 0', fontSize: 12 }}
              />
            )}

            <div className="sv2-update-actions">
              <button type="button" onClick={copyMessage}>{copied ? 'COPIED!' : 'COPY MESSAGE'}</button>
              <button type="button" onClick={shareWhatsApp}>SHARE VIA WHATSAPP</button>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
