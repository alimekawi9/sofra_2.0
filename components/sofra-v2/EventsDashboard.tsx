'use client'

import Link from 'next/link'
import { useState } from 'react'
import { sv2Display, sv2Sans } from './fonts'
import { PREVIEW_EVENTS, type PreviewEventStatus } from './events-fixtures'
import { PreviewBottomNav } from './PreviewBottomNav'

const filters: readonly PreviewEventStatus[] = ['going', 'went', 'hosted']

export function EventsDashboard() {
  const [filter, setFilter] = useState<PreviewEventStatus>('going')
  const visibleEvents = PREVIEW_EVENTS.filter((event) => event.status === filter)

  return (
    <div className={`sv2-root sv2-device-page sv2-app-page ${sv2Display.variable} ${sv2Sans.variable}`}>
      <main className="sv2-device-shell sv2-app-shell">
        <header className="sv2-app-header">
          <div>
            <p>YOUR TABLE</p>
            <h1>Alia</h1>
          </div>
          <span className="sv2-avatar" aria-label="Alia profile initials">A</span>
        </header>

        <section className="sv2-event-history" aria-labelledby="sv2-event-history-heading">
          <h2 id="sv2-event-history-heading">Your table history</h2>
          <div className="sv2-filter-row" aria-label="Event filters">
            {filters.map((value) => (
              <button key={value} type="button" className={filter === value ? 'sv2-filter-active' : ''} onClick={() => setFilter(value)}>
                {value}
              </button>
            ))}
          </div>

          <div className="sv2-event-stack">
            {visibleEvents.map((event) => (
              <article className="sv2-event-card" key={event.id}>
                <p className="sv2-event-status">{event.status === 'going' ? 'TONIGHT' : event.status}</p>
                <h3>{event.title}</h3>
                <p>{event.location}</p>
                <p>{event.seats} · {event.date} · {event.time}</p>
                <Link href="/design-preview/events/demo">View details <span aria-hidden="true">→</span></Link>
              </article>
            ))}
          </div>
        </section>

        <PreviewBottomNav current="events" />
      </main>
    </div>
  )
}
