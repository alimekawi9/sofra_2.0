'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { EventChat } from '@/components/sofra-v2/EventChat'
import { sv2Display, sv2Sans } from '@/components/sofra-v2/fonts'
import { createClient } from '@/lib/supabase/client'
import { fetchEventMessages, markEventChatRead, sendEventMessage, type EventChatMessage } from '@/lib/event-chat'
import '@/components/sofra-v2/sofra-v2.css'
import { loginDestination } from '@/lib/event-entry'

type EventRow = { id: string; host_id: string; title: string }

export default function EventChatPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const supabase = createClient()
  const uidRef = useRef<string | null>(null)
  const [event, setEvent] = useState<EventRow | null>(null)
  const [messages, setMessages] = useState<EventChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [canChat, setCanChat] = useState(false)

  async function loadMessages() {
    const result = await fetchEventMessages(supabase, params.id)
    if (result.error) {
      setError('Could not load the chat. Try again.')
      return false
    }
    setMessages(result.messages)
    if (uidRef.current) markEventChatRead(localStorage, params.id, uidRef.current)
    setError('')
    return true
  }

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      const stored = localStorage.getItem('sofra_user_id')
      if (!stored) {
        router.replace(loginDestination('/events/' + params.id + '/chat'))
        return
      }
      uidRef.current = stored
      const { data: ev, error: eventError } = await supabase.from('events').select('id,host_id,title').eq('id', params.id).single()
      if (eventError || !ev) throw new Error('event not found')
      setEvent(ev as EventRow)

      const [{ data: rsvp }, { data: cohost }] = await Promise.all([
        supabase.from('rsvps').select('user_id').eq('event_id', params.id).eq('user_id', stored).maybeSingle(),
        supabase.from('event_cohosts').select('user_id').eq('event_id', params.id).eq('user_id', stored).maybeSingle(),
      ])
      const allowed = ev.host_id === stored || Boolean(rsvp) || Boolean(cohost)
      setCanChat(allowed)
      if (!allowed) {
        router.replace(`/events/${params.id}`)
        return
      }
      await loadMessages()
    } catch {
      setError("Couldn't load this chat. Try again.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadData() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!canChat || typeof supabase.channel !== 'function') return
    const channel = supabase.channel(`event-chat-page:${params.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'event_messages', filter: `event_id=eq.${params.id}` }, () => { void loadMessages() })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [canChat]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSend(body: string) {
    if (!uidRef.current || !canChat) return false
    setSending(true)
    setError('')
    const result = await sendEventMessage(supabase, { eventId: params.id, userId: uidRef.current, body })
    setSending(false)
    if (result.error || !result.message) {
      setError('Could not send that message. Try again.')
      return false
    }
    setMessages((current) => current.some((message) => message.id === result.message!.id) ? current : [...current, result.message!])
    markEventChatRead(localStorage, params.id, uidRef.current)
    return true
  }

  return (
    <div className={`sv2-root sv2-device-page sv2-app-page ${sv2Display.variable} ${sv2Sans.variable}`}>
      <main className="sv2-device-shell sv2-app-shell sv2-chat-page-shell">
        <Link className="sv2-back-link" href={'/events/' + params.id}>← Event details</Link>
        <header className="sv2-chat-page-header">
          <p>{event?.title ?? 'Your Sofra'}</p>
        </header>
        {canChat || loading ? (
          <EventChat messages={messages} currentUserId={uidRef.current} loading={loading} sending={sending}
            error={error} onRetry={loadData} onSend={handleSend} />
        ) : (
          <div className="sv2-chat-access-error"><p role="alert">{error}</p><Link href={'/events/' + params.id}>BACK TO EVENT</Link></div>
        )}
      </main>
    </div>
  )
}
