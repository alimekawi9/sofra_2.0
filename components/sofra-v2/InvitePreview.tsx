'use client'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { sv2Display, sv2Sans } from './fonts'
import { DEMO_EVENT } from './events-fixtures'

export type PreviewRsvpStatus = 'going' | 'tentative' | 'declined'
export const PREVIEW_RSVP_KEY = 'sofra-preview-rsvp'

export function InvitePreview() {
  const router=useRouter()
  function respond(status:PreviewRsvpStatus) {
    sessionStorage.setItem(PREVIEW_RSVP_KEY,status)
    router.push(status==='declined'?'/design-preview/invite/missing-out':'/design-preview/preferences')
  }
  return <div className={`sv2-root sv2-device-page sv2-invite-page ${sv2Display.variable} ${sv2Sans.variable}`}><main className="sv2-device-shell sv2-invite-shell">
    <Link className="sv2-back-link" href="/design-preview/events">← Your Sofras</Link>
    <header><p>YOU ARE INVITED!</p><h1>Alia, take your seat.</h1></header>
    <article className="sv2-invite-card" data-asset-fidelity="placeholder"><div className="sv2-invite-ornament" aria-hidden="true"><Image src="/design-preview/arabesque-ornament.png" alt="" width={1254} height={1254}/></div><p>YOU&apos;RE INVITED TO</p><h2>{DEMO_EVENT.title}</h2><p className="sv2-invite-message">{DEMO_EVENT.note}</p>
      <dl><div><dt>Hosted by</dt><dd>{DEMO_EVENT.host}</dd></div><div><dt>When</dt><dd>{DEMO_EVENT.date}<br/>{DEMO_EVENT.time}</dd></div><div><dt>Where</dt><dd>{DEMO_EVENT.location}</dd></div><div><dt>Dress code</dt><dd>{DEMO_EVENT.dressCode}</dd></div></dl>
      <section className="sv2-invite-guests" aria-label={`${DEMO_EVENT.guests.length} invited guests`}><p>{DEMO_EVENT.guests.length} seats around the Sofra</p><div>{DEMO_EVENT.guests.map(g=><span key={g.initials} aria-label={g.responded?`${g.name} responded`:'Guest response pending'}>{g.initials}{!g.responded&&<small aria-hidden="true">●</small>}</span>)}</div></section>
    </article>
    <div className="sv2-invite-choices"><button type="button" onClick={()=>respond('going')}>SAVE ME A SEAT</button><button type="button" onClick={()=>respond('tentative')}>I&apos;LL THINK ABOUT IT</button><button type="button" onClick={()=>respond('declined')}>MAYBE NEXT TIME</button></div>
  </main></div>
}
