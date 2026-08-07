import Link from 'next/link'
import { sv2Display, sv2Sans } from './fonts'
import { DEMO_EVENT } from './events-fixtures'
import { PreviewBottomNav } from './PreviewBottomNav'

export function EventDetailPreview() {
  return <div className={`sv2-root sv2-device-page sv2-app-page ${sv2Display.variable} ${sv2Sans.variable}`}><main className="sv2-device-shell sv2-app-shell sv2-event-detail-shell">
    <Link className="sv2-back-link" href="/design-preview/events">← Your Sofras</Link>
    <article className="sv2-event-paper"><p className="sv2-event-kicker">YOU ARE INVITED TO</p><h1>{DEMO_EVENT.title}</h1><p className="sv2-event-note">{DEMO_EVENT.note}</p>
      <dl className="sv2-event-facts"><div><dt>Date</dt><dd>{DEMO_EVENT.date}</dd></div><div><dt>Time</dt><dd>{DEMO_EVENT.time}</dd></div><div><dt>Location</dt><dd>{DEMO_EVENT.location}</dd></div><div><dt>Host</dt><dd>{DEMO_EVENT.host}</dd></div><div><dt>Dress code</dt><dd>{DEMO_EVENT.dressCode}</dd></div><div><dt>Your RSVP</dt><dd>Going</dd></div></dl>
      <section className="sv2-guest-overview" aria-labelledby="guest-overview-heading"><div className="sv2-section-heading"><h2 id="guest-overview-heading">Around this Sofra</h2><span>{DEMO_EVENT.guests.length} guests</span></div><div className="sv2-guest-grid">{DEMO_EVENT.guests.map(guest=><article key={guest.initials} className={guest.responded?'':'sv2-guest-locked'}><span className="sv2-guest-initials">{guest.initials}{!guest.responded&&<span className="sv2-lock" aria-label="Response pending">●</span>}</span><h3>{guest.responded?guest.name:'Guest pending'}</h3><p>{guest.responded?guest.summary:'Details unlock after RSVP'}</p></article>)}</div></section>
      <section className="sv2-preference-summary" aria-labelledby="preference-summary-heading"><div className="sv2-section-heading"><h2 id="preference-summary-heading">Preference collection</h2><span>{DEMO_EVENT.preferenceSummary.completed}</span></div><dl>{Object.entries(DEMO_EVENT.preferenceSummary).filter(([key])=>key!=='completed').map(([key,value])=><div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl></section>
      <div className="sv2-detail-actions"><Link href="/design-preview/invite">EDIT RSVP</Link><button type="button">EDIT EVENT</button><button type="button">MANAGE GUESTS</button><button type="button">RESEND INVITATION</button></div>
    </article><PreviewBottomNav current="events" />
  </main></div>
}
