'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { sv2Display, sv2Sans } from './fonts'

const invite = {
  host: 'Layla Hassan',
  guest: 'Alia',
  title: "Layla's Sofra",
  date: 'Friday, August 15',
  time: '6:30 PM',
  location: 'Krasi · Boston, MA',
  message: 'A seat is waiting for you. Come hungry and stay for the stories.',
} as const

export function InvitePreview() {
  const [accepted, setAccepted] = useState(false)

  return (
    <div className={`sv2-root sv2-device-page sv2-invite-page ${sv2Display.variable} ${sv2Sans.variable}`}>
      <main className="sv2-device-shell sv2-invite-shell">
        <Link className="sv2-back-link" href="/design-preview/events">← Your tables</Link>
        <header>
          <p>YOU ARE INVITED!</p>
          <h1>{invite.guest}, take your seat.</h1>
        </header>

        <article className="sv2-invite-card" data-asset-fidelity="placeholder">
          <div className="sv2-invite-ornament" aria-hidden="true">
            <Image src="/design-preview/arabesque-ornament.png" alt="" width={1254} height={1254} />
          </div>
          <p>YOU&apos;RE INVITED TO</p>
          <h2>{invite.title}</h2>
          <p className="sv2-invite-message">{invite.message}</p>
          <dl>
            <div><dt>Hosted by</dt><dd>{invite.host}</dd></div>
            <div><dt>When</dt><dd>{invite.date}<br />{invite.time}</dd></div>
            <div><dt>Where</dt><dd>{invite.location}</dd></div>
          </dl>
        </article>

        <button type="button" className="sv2-invite-action" aria-pressed={accepted} onClick={() => setAccepted(true)}>
          {accepted ? 'SEAT CLAIMED' : 'CLAIM MY SEAT'}
        </button>
        {accepted && <p className="sv2-invite-confirmation">You&apos;re on Layla&apos;s guest list. See you at the table.</p>}
      </main>
    </div>
  )
}
