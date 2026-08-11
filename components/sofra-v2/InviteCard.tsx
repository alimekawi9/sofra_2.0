'use client'

import Image from 'next/image'
import Link from 'next/link'
import { sv2Display, sv2Sans } from './fonts'
import { ProfileIdentityLink } from './ProfileIdentityLink'

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
}: InviteCardProps) {
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
              <p>YOU ARE INVITED!</p>
              <h1>Take your seat.</h1>
            </header>

            <article className="sv2-invite-card">
              <div className="sv2-invite-ornament" aria-hidden="true">
                <Image src="/design-preview/arabesque-ornament.png" alt="" width={1254} height={1254} />
              </div>
              <p>YOU&apos;RE INVITED TO</p>
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
                      <ProfileIdentityLink key={guest.id} userId={guest.id} name={guest.name} photoUrl={guest.photoUrl} />
                    ))}
                  </div>
                ) : (
                  <p>RSVP TO MEET THE REST OF THE TABLE.</p>
                )}
              </section>
            </article>

            <div className="sv2-invite-choices">
              <button type="button" disabled={submitting} onClick={() => onRespond('going')}>SAVE ME A SEAT</button>
              <button type="button" disabled={submitting} onClick={() => onRespond('maybe')}>I&apos;LL THINK ABOUT IT</button>
              <button type="button" disabled={submitting} onClick={() => onRespond('cant')}>MAYBE NEXT TIME</button>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
