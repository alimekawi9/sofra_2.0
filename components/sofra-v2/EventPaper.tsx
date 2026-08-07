'use client'

import Image from 'next/image'
import Link from 'next/link'
import { sv2Display, sv2Sans } from './fonts'

export interface EventPaperGuest {
  id: string
  name: string
}

export interface EventPaperProps {
  loading: boolean
  error: string
  onRetry: () => void
  isHost: boolean
  isPast: boolean
  title: string
  tagline: string | null
  dateLabel: string
  timeLabel: string
  venue: string
  address: string | null
  dressCode: string | null
  coverUrl: string | null
  unlocked: boolean
  guests: EventPaperGuest[]
  myRsvpStatus: string | null
  hasRsvpRow: boolean
  copied: boolean
  copyFallbackUrl: string
  onCopyInviteLink: () => void
  onShareWhatsApp: () => void
  onViewTable: () => void
  onEditRsvp: () => void
  onRsvp: () => void
  photos: string[]
  uploadingPhoto: boolean
  onPhotoUpload: (file: File) => void
}

const RSVP_LABELS: Record<string, string> = {
  going: 'Going ✦',
  maybe: 'Maybe ◈',
  cant: "Can't make it ✕",
}

export function EventPaper({
  loading,
  error,
  onRetry,
  isHost,
  isPast,
  title,
  tagline,
  dateLabel,
  timeLabel,
  venue,
  address,
  dressCode,
  coverUrl,
  unlocked,
  guests,
  myRsvpStatus,
  hasRsvpRow,
  copied,
  copyFallbackUrl,
  onCopyInviteLink,
  onShareWhatsApp,
  onViewTable,
  onEditRsvp,
  onRsvp,
  photos,
  uploadingPhoto,
  onPhotoUpload,
}: EventPaperProps) {
  return (
    <div className={`sv2-root sv2-device-page sv2-app-page ${sv2Display.variable} ${sv2Sans.variable}`}>
      <main className="sv2-device-shell sv2-app-shell sv2-event-detail-shell">
        <Link className="sv2-back-link" href="/events">← Your Sofras</Link>

        {loading ? (
          <p style={{ fontSize: 13 }}>Loading…</p>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <p style={{ fontSize: 13, marginBottom: 12 }}>{error}</p>
            <button type="button" onClick={onRetry}>Retry</button>
          </div>
        ) : (
          <article className="sv2-event-paper">
            {coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="sv2-event-artwork" src={coverUrl} alt="" />
            ) : (
              <div className="sv2-event-artwork sv2-invitation-motif" aria-hidden="true">
                <Image src="/design-preview/arabesque-ornament.png" alt="" width={1254} height={1254} />
              </div>
            )}

            <p className="sv2-event-kicker">
              {isHost ? 'YOU ARE HOSTING' : isPast ? 'A SOFRA TO REMEMBER' : "YOU'RE INVITED"}
            </p>
            <h1>{title}</h1>

            {isHost && (
              <>
                <div className="sv2-host-share-actions">
                  <button type="button" onClick={onCopyInviteLink}>
                    {copied ? 'COPIED!' : 'COPY INVITE LINK'}
                  </button>
                  <button type="button" onClick={onShareWhatsApp}>SHARE VIA WHATSAPP</button>
                </div>
                {copyFallbackUrl && (
                  <input
                    readOnly
                    value={copyFallbackUrl}
                    autoFocus
                    onFocus={(e) => e.target.select()}
                    style={{ display: 'block', width: '100%', marginBottom: 10, fontSize: 12 }}
                  />
                )}
                <button className="sv2-manage-guests" type="button" onClick={onViewTable}>
                  VIEW TABLE
                </button>
              </>
            )}

            {tagline && <p className="sv2-event-note">{tagline}</p>}

            <dl className="sv2-event-facts">
              <div><dt>Date</dt><dd>{dateLabel}</dd></div>
              <div><dt>Time</dt><dd>{timeLabel}</dd></div>
              <div>
                <dt>Location</dt>
                <dd>
                  {venue}
                  {unlocked && address ? ` — ${address}` : !unlocked ? ' (RSVP to see the address)' : ''}
                </dd>
              </div>
              {dressCode && <div><dt>Dress code</dt><dd>{dressCode}</dd></div>}
              {!isHost && (
                <div>
                  <dt>Your RSVP</dt>
                  <dd>{isPast ? 'Attended' : myRsvpStatus ? RSVP_LABELS[myRsvpStatus] : 'Not yet responded'}</dd>
                </div>
              )}
            </dl>

            <section className="sv2-guest-overview" aria-labelledby="sv2-guest-heading">
              <div className="sv2-section-heading">
                <h2 id="sv2-guest-heading">Around this Sofra</h2>
                <span>{unlocked ? `${guests.length} going` : 'RSVP to see who'}</span>
              </div>
              {unlocked ? (
                guests.length > 0 ? (
                  <div className="sv2-guest-grid">
                    {guests.map((guest) => (
                      <article key={guest.id}>
                        <span className="sv2-guest-initials">{guest.name.charAt(0).toUpperCase()}</span>
                        <h3>{guest.name}</h3>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: 12 }}>No one&rsquo;s replied yet.</p>
                )
              ) : (
                <p style={{ fontSize: 12 }}>🔒 The table&rsquo;s filling up. RSVP to meet them.</p>
              )}
            </section>

            {unlocked && (
              <section className="sv2-shared-album" aria-labelledby="sv2-album-heading">
                <div className="sv2-section-heading">
                  <h2 id="sv2-album-heading">Shared Album</h2>
                  <span>{photos.length} {photos.length === 1 ? 'memory' : 'memories'}</span>
                </div>
                <div className="sv2-album-grid">
                  {photos.map((src) => (
                    <figure key={src}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt="A memory shared from this Sofra" />
                    </figure>
                  ))}
                </div>
                <label className="sv2-album-add">
                  {uploadingPhoto ? 'UPLOADING…' : 'ADD A PHOTO'}
                  <input
                    type="file"
                    accept="image/*"
                    disabled={uploadingPhoto}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      e.target.value = ''
                      if (file) onPhotoUpload(file)
                    }}
                  />
                </label>
              </section>
            )}

            {!isHost && !isPast && (
              <div className="sv2-detail-actions">
                {hasRsvpRow ? (
                  <Link href="#" onClick={(e) => { e.preventDefault(); onEditRsvp() }}>EDIT RSVP</Link>
                ) : (
                  <Link href="#" onClick={(e) => { e.preventDefault(); onRsvp() }}>RSVP</Link>
                )}
              </div>
            )}
          </article>
        )}
      </main>
    </div>
  )
}
