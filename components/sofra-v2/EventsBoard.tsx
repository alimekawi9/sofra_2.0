'use client'

import Link from 'next/link'
import { useState } from 'react'
import { sv2Display, sv2Sans } from './fonts'
import { ProfileIdentityLink } from './ProfileIdentityLink'
import { DEFAULT_EVENT_IMAGE_PATH } from '@/lib/event-images'

export type EventsBoardStatus = 'invited' | 'hosting' | 'going' | 'hosted' | 'went'

export interface EventsBoardEvent {
  id: string
  status: EventsBoardStatus
  title: string
  host: string | null
  hostId?: string | null
  hostPhotoUrl?: string | null
  venue: string
  dateLabel: string
  timeLabel: string
  rsvpStatus: string
  theme: string
  coverUrl?: string | null
  isDraft?: boolean
  accessRequestCount?: number
}

export interface EventsBoardProps {
  name: string
  events: EventsBoardEvent[]
  loading: boolean
  error: string
  onRetry: () => void
  onHostEvent: () => void
}

const FILTERS: readonly EventsBoardStatus[] = ['invited', 'hosting', 'going', 'hosted', 'went']
const LABELS: Record<EventsBoardStatus, string> = {
  invited: 'INVITED',
  hosting: 'HOSTING',
  going: 'GOING',
  hosted: 'HOSTED',
  went: 'WENT',
}

export function EventsBoard({ name, events, loading, error, onRetry, onHostEvent }: EventsBoardProps) {
  const available = FILTERS.filter((status) => events.some((event) => event.status === status))
  const [filter, setFilter] = useState<EventsBoardStatus | null>(null)
  const activeFilter = filter && available.includes(filter) ? filter : available[0] ?? null
  const visible = activeFilter ? events.filter((event) => event.status === activeFilter) : []
  const accessNotifications = events.filter((event) => (event.accessRequestCount ?? 0) > 0)

  return (
    <div className={`sv2-root sv2-device-page sv2-app-page ${sv2Display.variable} ${sv2Sans.variable}`}>
      <main className="sv2-device-shell sv2-app-shell">
        <header className="sv2-app-header">
          <div>
            <p>YOUR SOFRAS</p>
            <h1>{name}</h1>
          </div>
        </header>

        {!loading && accessNotifications.length > 0 && (
          <aside className="sv2-board-notifications" aria-label="Access request notifications">
            <strong>ACCESS REQUESTS</strong>
            {accessNotifications.map((event) => (
              <Link key={event.id} href={`/events/${event.id}`}>
                <span>{event.title}</span>
                <b>{event.accessRequestCount} pending</b>
              </Link>
            ))}
          </aside>
        )}

        <section className="sv2-event-history" aria-labelledby="sv2-event-history-heading">
          <h2 id="sv2-event-history-heading">YOUR TABLES</h2>

          {loading ? (
            <p style={{ fontSize: 13 }}>Loading…</p>
          ) : error ? (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <p style={{ fontSize: 13, marginBottom: 12 }}>{error}</p>
              <button type="button" onClick={onRetry}>Retry</button>
            </div>
          ) : available.length === 0 ? (
            <div className="sv2-events-empty" style={{ textAlign: 'center', padding: '24px 0' }}>
              <p style={{ fontSize: 13, marginBottom: 12 }}>No events yet. Host one, or wait for an invite.</p>
              <button type="button" onClick={onHostEvent}>Host an event</button>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="sv2-events-empty-illustration" src="/design-preview/empty-table.png" alt="" />
            </div>
          ) : (
            <>
              <div className="sv2-filter-row" aria-label="Event filters">
                {available.map((status) => (
                  <button
                    key={status}
                    type="button"
                    className={activeFilter === status ? 'sv2-filter-active' : ''}
                    onClick={() => setFilter(status)}
                  >
                    {LABELS[status]}
                  </button>
                ))}
              </div>
              <div className="sv2-event-stack">
                {visible.map((event) => (
                  <article className="sv2-event-card" key={event.id}>
                    <div
                      className={`sv2-event-card-artwork sv2-event-card-artwork-photo${event.coverUrl ? '' : ' sv2-event-default-cover'}`}
                      role="img"
                      aria-label={`${event.title} invitation image`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img className="sv2-event-cover-image" src={event.coverUrl ?? DEFAULT_EVENT_IMAGE_PATH} alt="" />
                    </div>
                    <div className={event.isDraft ? 'sv2-event-status-row' : undefined}>
                      <p className="sv2-event-status">
                        {LABELS[event.status]}
                        {event.isDraft && <span className="sv2-draft-badge">Draft</span>}
                        {(event.accessRequestCount ?? 0) > 0 && <span className="sv2-access-badge">{event.accessRequestCount} access request{event.accessRequestCount === 1 ? '' : 's'}</span>}
                      </p>
                      {event.isDraft && (
                        <p className="sv2-draft-explanation">Finish setting up your Kitchen to publish this Sofra.</p>
                      )}
                    </div>
                    <h3>{event.title}</h3>
                    {event.host && (event.hostId ? (
                      <ProfileIdentityLink userId={event.hostId} name={event.host} photoUrl={event.hostPhotoUrl ?? null} prefix="Hosted by " />
                    ) : <p>Hosted by {event.host}</p>)}
                    <p>{event.venue}</p>
                    <p>{event.dateLabel} · {event.timeLabel}</p>
                    <p>{event.rsvpStatus}</p>
                    <Link href={`/events/${event.id}`}>
                      View event <span aria-hidden="true">→</span>
                    </Link>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  )
}
