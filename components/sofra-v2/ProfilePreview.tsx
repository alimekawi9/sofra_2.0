'use client'

import { sv2Display, sv2Sans } from './fonts'
import { PREVIEW_EVENTS } from './events-fixtures'
import { PreviewBottomNav } from './PreviewBottomNav'
import { ThemeToggle } from './ThemeToggle'

export function ProfilePreview() {
  return (
    <div className={`sv2-root sv2-device-page sv2-app-page ${sv2Display.variable} ${sv2Sans.variable}`}>
      <main className="sv2-device-shell sv2-app-shell sv2-profile-shell">
        <header className="sv2-profile-topline">
          <p>Sofra.</p>
          <span aria-hidden="true">⚙</span>
        </header>

        <section className="sv2-profile-identity" aria-labelledby="sv2-profile-name">
          <button type="button" className="sv2-profile-photo" aria-label="Add profile photo">
            <span aria-hidden="true">+</span>
            Add photo
          </button>
          <h1 id="sv2-profile-name">Ali</h1>
          <p>4 dinners · since 2025</p>
        </section>

        <section className="sv2-profile-appearance" aria-labelledby="sv2-profile-appearance-heading">
          <div>
            <h2 id="sv2-profile-appearance-heading">Appearance</h2>
            <p>Choose how this preview feels.</p>
          </div>
          <ThemeToggle />
        </section>

        <section className="sv2-profile-history" aria-labelledby="sv2-profile-history-heading">
          <h2 id="sv2-profile-history-heading">Your table history</h2>
          <div>
            {PREVIEW_EVENTS.map((event) => (
              <article key={event.id}>
                <span className="sv2-profile-history-icon" aria-hidden="true">◇</span>
                <div>
                  <h3>{event.title}</h3>
                  <p>{event.date} · {event.location}</p>
                </div>
                <p><strong>{event.status === 'going' ? 'Going' : event.status}</strong><br />{event.seats}</p>
              </article>
            ))}
          </div>
        </section>

        <PreviewBottomNav current="profile" />
      </main>
    </div>
  )
}
