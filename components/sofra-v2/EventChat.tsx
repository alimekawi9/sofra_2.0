'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import { ProfileIdentityLink } from './ProfileIdentityLink'
import { MAX_EVENT_MESSAGE_LENGTH, type EventChatMessage } from '@/lib/event-chat'

export function EventChat({ messages, currentUserId, loading, sending, error, onRetry, onSend }: {
  messages: EventChatMessage[]
  currentUserId: string | null
  loading: boolean
  sending: boolean
  error: string
  onRetry: () => void
  onSend: (body: string) => Promise<boolean>
}) {
  const [draft, setDraft] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }) }, [messages.length])

  async function submit(event: FormEvent) {
    event.preventDefault()
    const body = draft.trim()
    if (!body || sending) return
    if (await onSend(body)) setDraft('')
  }

  return (
    <section className="sv2-event-chat" aria-labelledby="sv2-chat-heading">
      <div className="sv2-section-heading">
        <h2 id="sv2-chat-heading">Chat</h2>
        <span>{messages.length} {messages.length === 1 ? 'message' : 'messages'}</span>
      </div>

      {error && <p className="sv2-chat-error" role="alert">{error} <button type="button" onClick={onRetry}>Retry</button></p>}
      <div className="sv2-chat-log" role="log" aria-live="polite" aria-busy={loading}>
        {loading && messages.length === 0 && <p className="sv2-chat-empty">Loading messages...</p>}
        {!loading && messages.length === 0 && <p className="sv2-chat-empty">No messages yet. Start the conversation.</p>}
        {messages.map((message) => {
          const mine = message.userId === currentUserId
          return (
            <article key={message.id} className={`sv2-chat-message${mine ? ' sv2-chat-message-mine' : ''}`}>
              <div className="sv2-chat-message-meta">
                <ProfileIdentityLink userId={message.userId} name={message.senderName} photoUrl={message.senderPhotoUrl} />
                <time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</time>
              </div>
              <p>{message.body}</p>
            </article>
          )
        })}
        <div ref={endRef} />
      </div>

      <form className="sv2-chat-compose" onSubmit={submit}>
        <label htmlFor="sv2-chat-message">Message this Sofra</label>
        <textarea id="sv2-chat-message" value={draft} maxLength={MAX_EVENT_MESSAGE_LENGTH} rows={3}
          placeholder="Write a message..." onChange={(event) => setDraft(event.target.value)} />
        <div><span>{draft.length}/{MAX_EVENT_MESSAGE_LENGTH}</span><button type="submit" disabled={!draft.trim() || sending}>{sending ? 'SENDING...' : 'SEND'}</button></div>
      </form>
    </section>
  )
}
