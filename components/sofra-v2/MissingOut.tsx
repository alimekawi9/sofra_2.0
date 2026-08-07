'use client'

import Link from 'next/link'
import { sv2Display, sv2Sans } from './fonts'

export interface MissingOutProps {
  onReturnToInvite: () => void
}

export function MissingOut({ onReturnToInvite }: MissingOutProps) {
  return (
    <div className={`sv2-root sv2-device-page sv2-invite-page ${sv2Display.variable} ${sv2Sans.variable}`}>
      <main className="sv2-device-shell sv2-missing-out">
        <p className="sv2-event-kicker">MAYBE NEXT TIME</p>
        <h1>You&apos;ll be missed.</h1>
        <p>The plates will try not to take it personally.</p>
        <div>
          <button
            type="button"
            onClick={onReturnToInvite}
            style={{
              minHeight: 46,
              padding: 14,
              border: '1px solid var(--sv2-ink)',
              background: 'transparent',
              color: 'inherit',
              fontSize: 11,
              fontFamily: 'inherit',
              cursor: 'pointer',
            }}
          >
            RETURN TO INVITATION
          </button>
          <Link href="/events">SEE MY SOFRAS</Link>
        </div>
      </main>
    </div>
  )
}
