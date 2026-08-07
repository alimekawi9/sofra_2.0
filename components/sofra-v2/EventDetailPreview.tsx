'use client'

import Link from 'next/link'
import { useState } from 'react'
import { sv2Display, sv2Sans } from './fonts'
import { DEMO_EVENT } from './events-fixtures'
import { PreviewBottomNav } from './PreviewBottomNav'

type RsvpChoice = 'save me a seat' | 'maybe next time' | "I'll think about it"

export function EventDetailPreview() {
  const [expanded, setExpanded] = useState<'menu' | 'guests' | 'details' | null>('details')
  const [rsvp, setRsvp] = useState<RsvpChoice | null>(null)

  return (
    <div className={`sv2-root sv2-device-page sv2-app-page ${sv2Display.variable} ${sv2Sans.variable}`}>
      <main className="sv2-device-shell sv2-app-shell sv2-event-detail-shell">
        <Link className="sv2-back-link" href="/design-preview/events">← Your tables</Link>
        <article className="sv2-event-paper">
          <p className="sv2-event-kicker">YOU ARE INVITED TO</p>
          <h1>{DEMO_EVENT.title}</h1>
          <p className="sv2-event-note">{DEMO_EVENT.note}</p>

          <dl className="sv2-event-facts">
            <div><dt>Date</dt><dd>{DEMO_EVENT.date}</dd></div>
            <div><dt>Time</dt><dd>{DEMO_EVENT.time}</dd></div>
            <div><dt>Location</dt><dd>{DEMO_EVENT.location}</dd></div>
            <div><dt>Host</dt><dd>{DEMO_EVENT.host}</dd></div>
            <div><dt>Table mood</dt><dd>{DEMO_EVENT.mood}</dd></div>
          </dl>

          {(['menu', 'guests', 'details'] as const).map((section) => (
            <section className="sv2-event-disclosure" key={section}>
              <button type="button" onClick={() => setExpanded(expanded === section ? null : section)} aria-expanded={expanded === section}>
                {section}<span aria-hidden="true">{expanded === section ? '−' : '+'}</span>
              </button>
              {expanded === section && (
                <div>
                  {section === 'menu' && <ul>{DEMO_EVENT.menu.map((dish) => <li key={dish}>{dish}</li>)}</ul>}
                  {section === 'guests' && <p>{DEMO_EVENT.guests.join(' · ')}</p>}
                  {section === 'details' && <p>{DEMO_EVENT.seats}. Dress for a relaxed evening around the table.</p>}
                </div>
              )}
            </section>
          ))}
        </article>

        <section className="sv2-rsvp-panel" aria-labelledby="sv2-rsvp-heading">
          <h2 id="sv2-rsvp-heading">Will you be joining Layla&apos;s Sofra?</h2>
          <div className="sv2-rsvp-options">
            {(['save me a seat', 'maybe next time', "I'll think about it"] as const).map((choice) => (
              <button type="button" key={choice} aria-pressed={rsvp === choice} onClick={() => setRsvp(choice)}>{choice}</button>
            ))}
          </div>
          {rsvp && <p className="sv2-rsvp-confirmation">Your preview response: {rsvp}.</p>}
        </section>

        <PreviewBottomNav current="events" />
      </main>
    </div>
  )
}
