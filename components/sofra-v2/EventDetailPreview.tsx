'use client'

import Link from 'next/link'
import {useState} from 'react'
import {DEMO_EVENT} from './events-fixtures'
import {InvitationArtwork} from './InvitationArtwork'
import {PreviewBottomNav} from './PreviewBottomNav'
import {SharedAlbumPreview} from './SharedAlbumPreview'
import {sv2Display,sv2Sans} from './fonts'
import {readPreviewSession} from './preview-session'

export type EventPreviewRole='guest'|'host'
export type EventPreviewState='upcoming'|'past'

export function EventDetailPreview({role='guest',state='upcoming'}:{role?:EventPreviewRole;state?:EventPreviewState}){
  const[copied,setCopied]=useState(false)
  const[managing,setManaging]=useState(false)
  const host=role==='host'
  const inventoryComplete=readPreviewSession().inventoryUpdated
  async function copy(){await navigator.clipboard?.writeText('https://preview.sofra.example/design-preview/invite');setCopied(true)}
  function whatsapp(){window.open(`https://wa.me/?text=${encodeURIComponent("You're invited to Layla's Sofra — https://preview.sofra.example/design-preview/invite")}`,'_blank','noopener,noreferrer')}
  return <div className={`sv2-root sv2-device-page sv2-app-page ${sv2Display.variable} ${sv2Sans.variable}`}>
    <main className="sv2-device-shell sv2-app-shell sv2-event-detail-shell">
      <Link className="sv2-back-link" href="/design-preview/events">← Your Sofras</Link>
      <article className="sv2-event-paper">
        <InvitationArtwork className="sv2-event-artwork" editable={host}/>
        <p className="sv2-event-kicker">{host?'YOU ARE HOSTING':state==='past'?'A SOFRA TO REMEMBER':'YOU ARE GOING TO'}</p>
        <h1>{DEMO_EVENT.title}</h1>
        {host&&<><div className="sv2-host-share-actions"><button type="button" onClick={()=>void copy()}>{copied?'LINK COPIED':'COPY INVITE LINK'}</button><button type="button" onClick={whatsapp}>SHARE ON WHATSAPP</button></div><nav className="sv2-host-workflow" aria-label="Host event workflow"><Link href="/design-preview/events/demo/inventory">INVENTORY</Link>{inventoryComplete&&<Link href="/design-preview/events/demo/menu">CURATED MENU</Link>}<Link href="/design-preview/events/demo/preferences">PREFERENCE COLLECTION</Link></nav></>}
        <p className="sv2-event-note">{DEMO_EVENT.note}</p>
        <dl className="sv2-event-facts"><div><dt>Date</dt><dd>{DEMO_EVENT.date}</dd></div><div><dt>Time</dt><dd>{DEMO_EVENT.time}</dd></div><div><dt>Location</dt><dd>{DEMO_EVENT.location}</dd></div><div><dt>Host</dt><dd>{DEMO_EVENT.host}</dd></div><div><dt>Dress code</dt><dd>{DEMO_EVENT.dressCode}</dd></div>{!host&&<div><dt>Your RSVP</dt><dd>{state==='past'?'Attended':'Going'}</dd></div>}</dl>
        <section className="sv2-guest-overview"><div className="sv2-section-heading"><h2>Around this Sofra</h2><span>{host?'3 responded · 2 pending':`${DEMO_EVENT.guests.filter(guest=>guest.responded).length} revealed`}</span></div><div className="sv2-guest-grid">{DEMO_EVENT.guests.map(guest=>{const visible=host||guest.responded;return <article key={guest.initials} className={visible?'':'sv2-guest-locked'} aria-label={visible?guest.name:'Guest identity locked'}><span className="sv2-guest-initials">{visible?guest.initials:'🔒'}</span><h3>{visible?guest.name:'Guest locked'}</h3></article>})}</div></section>
        <SharedAlbumPreview host={host}/>
        {!host&&<Link className="sv2-album-profile-link" href="/design-preview/profile">VIEW MY PROFILE</Link>}
        {host&&<><button className="sv2-manage-guests" type="button" onClick={()=>setManaging(value=>!value)}>{managing?'DONE MANAGING':'MANAGE GUESTS'}</button>{managing&&<p className="sv2-local-confirmation" role="status">Guest management is active in this local preview.</p>}<Link className="sv2-edit-event-bottom" href="/design-preview/host?mode=edit">EDIT EVENT</Link></>}
        {!host&&state!=='past'&&<div className="sv2-detail-actions"><Link href="/design-preview/invite">EDIT RSVP</Link></div>}
      </article>
      <PreviewBottomNav current="events"/>
    </main>
  </div>
}
