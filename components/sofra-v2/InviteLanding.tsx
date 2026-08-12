'use client'

import { useState } from 'react'
import Image from 'next/image'
import { sv2Display, sv2Sans } from './fonts'

const INVITE_DESIGNS = [
  { key: 'lace', image: '/sofra/invite-landings/lace.png' },
  { key: 'silver', image: '/sofra/invite-landings/silver.png' },
  { key: 'spots', image: '/sofra/invite-landings/spots.png' },
  { key: 'envelope', image: '/sofra/invite-landings/envelope.png' },
] as const

export function InviteLanding({ title, onClaimSeat }: { eventId: string; title: string; onClaimSeat: () => void }) {
  const [design] = useState(() => INVITE_DESIGNS[Math.floor(Math.random() * INVITE_DESIGNS.length)])
  return (
    <div className={`sv2-root sv2-invite-landing-page ${sv2Display.variable} ${sv2Sans.variable}`}>
      <main className={`sv2-invite-landing sv2-invite-landing-${design.key}`}>
        <p className="sv2-invite-landing-kicker">You are invited!</p>
        <div className="sv2-invite-landing-art">
          <Image src={design.image} alt="" fill priority sizes="(max-width: 560px) 92vw, 520px" />
          <h1>{title}</h1>
        </div>
        <button type="button" onClick={onClaimSeat}>Claim my seat</button>
      </main>
    </div>
  )
}
