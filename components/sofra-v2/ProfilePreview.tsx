'use client'
import { sv2Display, sv2Sans } from './fonts'
import { PREVIEW_EVENTS } from './events-fixtures'
import { PreviewBottomNav } from './PreviewBottomNav'
import { ThemeToggle } from './ThemeToggle'

export function ProfilePreview(){return <div className={`sv2-root sv2-device-page sv2-app-page ${sv2Display.variable} ${sv2Sans.variable}`}><main className="sv2-device-shell sv2-app-shell sv2-profile-shell">
  <header className="sv2-profile-topline"><p>Sofra.</p></header>
  <section className="sv2-profile-identity" aria-labelledby="sv2-profile-name"><span className="sv2-profile-photo" aria-label="Alia profile initials">AK</span><h1 id="sv2-profile-name">Alia</h1><p>+20 10 1234 5678 · 4 Sofras since 2025</p></section>
  <section className="sv2-profile-appearance" aria-label="Preview appearance control"><ThemeToggle/></section>
  <section className="sv2-profile-preferences" aria-labelledby="sv2-profile-preferences-heading"><h2 id="sv2-profile-preferences-heading">My preferences</h2><p>Vegetarian friendly · avoids nuts · bright and herbal · bravery 72</p></section>
  <section className="sv2-profile-history" aria-labelledby="sv2-profile-history-heading"><h2 id="sv2-profile-history-heading">Your Sofras</h2><div>{PREVIEW_EVENTS.map(event=><article key={event.id}><span className="sv2-profile-history-icon" aria-hidden="true">◇</span><div><h3>{event.title}</h3><p>{event.date} · {event.location}</p></div><p><strong>{event.rsvpStatus}</strong><br/>{event.seats}</p></article>)}</div></section>
  <button className="sv2-profile-logout" type="button">LOG OUT</button><PreviewBottomNav current="profile"/>
  </main></div>}
