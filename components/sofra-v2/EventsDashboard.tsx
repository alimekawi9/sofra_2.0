'use client'
import Link from 'next/link'
import { useState } from 'react'
import { sv2Display, sv2Sans } from './fonts'
import { PREVIEW_EVENTS, type PreviewEventStatus } from './events-fixtures'
import { PreviewBottomNav } from './PreviewBottomNav'
import {updatePreviewSession} from './preview-session'

const filters: readonly PreviewEventStatus[] = ['going','went','hosted']
const filterLabels:Record<PreviewEventStatus,string>={going:'INVITED',went:'WENT',hosted:'HOSTING'}
export function EventsDashboard({initialFilter='going'}:{initialFilter?:PreviewEventStatus}) {
  const [filter,setFilter]=useState<PreviewEventStatus>(initialFilter)
  const visible=PREVIEW_EVENTS.filter(event=>event.status===filter)
  return <div className={`sv2-root sv2-device-page sv2-app-page ${sv2Display.variable} ${sv2Sans.variable}`}><main className="sv2-device-shell sv2-app-shell">
    <header className="sv2-app-header"><div><p>YOUR SOFRAS</p><h1>Alia</h1></div></header>
    <section className="sv2-event-history" aria-labelledby="sv2-event-history-heading">
      <h2 id="sv2-event-history-heading">SOFRAS OF THE PAST</h2>
      <div className="sv2-filter-row" aria-label="Event filters">{filters.map(value=><button key={value} type="button" className={filter===value?'sv2-filter-active':''} onClick={()=>setFilter(value)}>{filterLabels[value]}</button>)}</div>
      <div className="sv2-event-stack">{visible.map(event=><article className="sv2-event-card" key={event.id}>
        <div className="sv2-event-artwork" role="img" aria-label={`${event.artwork} event artwork`}><span>{event.artwork}</span></div>
        <p className="sv2-event-status">{event.status==='going'?'UPCOMING':event.status}</p><h3>{event.title}</h3>
        <p>Hosted by {event.host}</p><p>{event.location}</p><p>{event.seats} · {event.date} · {event.time}</p><p>{event.rsvpStatus}</p>
        <Link onClick={()=>updatePreviewSession({role:event.status==='hosted'?'host':'guest',activeSofra:event.id})} href={event.status==='going'?'/design-preview/invite':`/design-preview/events/demo?role=${event.status==='hosted'?'host':'guest'}${event.status==='went'?'&state=past':''}`}>View event <span aria-hidden="true">→</span></Link>
      </article>)}</div>
    </section><PreviewBottomNav current="events" />
  </main></div>
}
