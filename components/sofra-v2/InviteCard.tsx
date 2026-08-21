'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { sv2Display, sv2Sans } from './fonts'
import { ProfileIdentityLink } from './ProfileIdentityLink'
import { DEFAULT_EVENT_IMAGE_PATH } from '@/lib/event-images'

export interface InviteCardGuest {
  id: string
  name: string
  photoUrl: string | null
}

export type InviteResponse = 'going' | 'maybe' | 'cant'

export interface InviteCardProps {
  loading: boolean
  error: string
  onRetry: () => void
  title: string
  note: string | null
  hostName: string | null
  hostId: string | null
  hostPhotoUrl: string | null
  dateLabel: string
  timeLabel: string
  venue: string
  dressCode: string | null
  unlocked: boolean
  guests: InviteCardGuest[]
  submitting: boolean
  onRespond: (response: InviteResponse) => void
  mode?: 'guest' | 'cohost'
}

export function InviteCard({
  loading,
  error,
  onRetry,
  title,
  note,
  hostName,
  hostId,
  hostPhotoUrl,
  dateLabel,
  timeLabel,
  venue,
  dressCode,
  unlocked,
  guests,
  submitting,
  onRespond,
  mode = 'guest',
}: InviteCardProps) {
  const [declineStep, setDeclineStep] = useState(0)

  function handleDecline() {
    if (declineStep < 2) {
      setDeclineStep((step) => step + 1)
      return
    }
    setDeclineStep(3)
    window.setTimeout(() => onRespond('cant'), 800)
  }

  const declineLabel = declineStep === 0
    ? mode === 'cohost' ? 'NO, THANK YOU' : 'MAYBE NEXT TIME'
    : declineStep === 1
      ? 'ARE YOU SURE?'
      : declineStep === 2
        ? 'REALLY SURE?'
        : 'FINE'

  return (
    <div className={`sv2-root sv2-device-page sv2-invite-page ${sv2Display.variable} ${sv2Sans.variable}`}>
      <main className="sv2-device-shell sv2-invite-shell">
        <Link className="sv2-back-link" href="/events">← Your Sofras</Link>

        {loading ? (
          <p style={{ fontSize: 13 }}>Loading…</p>
        ) : error ? (
          <div style={{ padding: '24px 0' }}>
            <p style={{ fontSize: 13, marginBottom: 12 }}>{error}</p>
            <button type="button" onClick={onRetry}>Retry</button>
          </div>
        ) : (
          <>
            <header>
              <p>{mode === 'cohost' ? 'YOU ARE INVITED TO CO-HOST!' : 'YOU ARE INVITED!'}</p>
              <h1>{mode === 'cohost' ? 'Take your place beside the host.' : 'Take your seat.'}</h1>
            </header>

            <article className="sv2-invite-card">
              <div className="sv2-invite-ornament" aria-hidden="true">
                <Image src={DEFAULT_EVENT_IMAGE_PATH} alt="" width={1125} height={1401} />
              </div>
              <p>{mode === 'cohost' ? "YOU'RE INVITED TO CO-HOST" : "YOU'RE INVITED TO"}</p>
              <h2>{title}</h2>
              {note && <p className="sv2-invite-message">{note}</p>}
              <dl>
                {hostName && <div><dt>Hosted by</dt><dd>{hostId ? <ProfileIdentityLink userId={hostId} name={hostName} photoUrl={hostPhotoUrl} /> : hostName}</dd></div>}
                <div><dt>When</dt><dd>{dateLabel}<br />{timeLabel}</dd></div>
                <div><dt>Where</dt><dd>{venue}</dd></div>
                {dressCode && <div><dt>Dress code</dt><dd>{dressCode}</dd></div>}
              </dl>

              <section className="sv2-invite-guests" aria-label={`${guests.length} invited guests`}>
                <p>WHO&apos;S AROUND THE SOFRA</p>
                {unlocked && guests.length > 0 ? (
                  <div>
                    {guests.map((guest) => (
                      <ProfileIdentityLink
                        key={guest.id}
                        userId={guest.id}
                        name={guest.name}
                        photoUrl={guest.photoUrl}
                        hideFallbackAvatar
                      />
                    ))}
                  </div>
                ) : (
                  <p>{mode === 'cohost' ? 'ACCEPT TO MEET THE REST OF THE TABLE.' : 'RSVP TO MEET THE REST OF THE TABLE.'}</p>
                )}
              </section>
            </article>

            <div className="sv2-invite-choices">
              <button type="button" disabled={submitting} onClick={() => onRespond('going')}>{mode === 'cohost' ? 'YES, I’LL CO-HOST' : 'SAVE ME A SEAT'}</button>
              {mode === 'guest' && <button type="button" disabled={submitting} onClick={() => onRespond('maybe')}>I&apos;LL THINK ABOUT IT</button>}
              <button
                type="button"
                className={`sv2-decline-choice sv2-decline-choice-${declineStep}`}
                disabled={submitting || declineStep === 3}
                onClick={handleDecline}
              >
                {declineLabel}
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
