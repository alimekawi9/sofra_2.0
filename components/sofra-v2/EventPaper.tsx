'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { sv2Display, sv2Sans } from './fonts'
import { AddPhotosControl } from './AddPhotosControl'
import { PhotoUploadProgress, type UploadProgressState } from './PhotoUploadProgress'
import { buildPreviewTiles } from '@/lib/shared-album'
import { ProfileIdentityLink } from './ProfileIdentityLink'

export interface EventPaperGuest {
  id: string
  name: string
  photoUrl: string | null
  isHost?: boolean
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
  onEditEvent: () => void
  onRemoveGuest?: (guestId: string) => void
  removingGuestId?: string | null
  removeGuestError?: string
  photos: Array<{ id: string; url: string }>
  photoError: string
  onRetryPhotos: () => void
  uploadingPhoto: boolean
  uploadProgress: UploadProgressState | null
  onDismissUploadProgress: () => void
  onFilesConfirmed: (files: File[], caption: string) => void
  onOpenAlbum: (photoId?: string) => void
}

const RSVP_LABELS: Record<string, string> = {
  going: 'Going ✦',
  maybe: 'Maybe ◈',
  cant: 'I have better things to do apparently',
}

// Decorative only — stand-ins for hidden guest avatars, not real guest colors.
const LOCKED_TABLE_TINTS = ['#7A2324', '#8A5A2B', '#4A5240', '#6E3B45', '#8A6A2B', '#3A4A5A']

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
  onEditEvent,
  onRemoveGuest,
  removingGuestId = null,
  removeGuestError = '',
  photos,
  photoError,
  onRetryPhotos,
  uploadingPhoto,
  uploadProgress,
  onDismissUploadProgress,
  onFilesConfirmed,
  onOpenAlbum,
}: EventPaperProps) {
  const [confirmingGuestId, setConfirmingGuestId] = useState<string | null>(null)
  const { tiles: previewTiles, overflowCount } = buildPreviewTiles(photos)
  const overflowBackgroundUrl = overflowCount > 0 ? photos[previewTiles.length]?.url : undefined
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
              <img className="sv2-event-artwork sv2-event-cover-image" src={coverUrl} alt="" />
            ) : (
              <div className="sv2-event-artwork sv2-invitation-motif" aria-hidden="true" style={{ position: 'relative' }}>
                <Image
                  src="/design-preview/arabesque-ornament.png"
                  alt=""
                  fill
                  style={{ objectFit: 'cover', objectPosition: 'center' }}
                />
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
                  SET THE SOFRA
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
                  {unlocked && address ? ` with ${address}` : !unlocked ? ' (RSVP to see the address)' : ''}
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

            {unlocked ? (
              <section className="sv2-guest-overview" aria-labelledby="sv2-guest-heading">
                <div className="sv2-section-heading">
                  <h2 id="sv2-guest-heading">Around this Sofra</h2>
                  <span>{guests.length} going</span>
                </div>
                {removeGuestError && (
                  <p role="alert" style={{ fontSize: 12, marginBottom: 8 }}>{removeGuestError}</p>
                )}
                {guests.length > 0 ? (
                  <div className="sv2-guest-grid">
                    {guests.map((guest) => (
                      <article key={guest.id} className={isHost ? 'sv2-guest-removable' : undefined}>
                        <ProfileIdentityLink
                          className="sv2-guest-profile-link"
                          userId={guest.id}
                          name={guest.name}
                          photoUrl={guest.photoUrl}
                        />
                        {guest.isHost && <span className="sv2-guest-host-badge">Host</span>}
                        {isHost && !guest.isHost && onRemoveGuest && (
                          confirmingGuestId === guest.id ? (
                            <div className="sv2-guest-remove-confirm">
                              <button
                                type="button"
                                disabled={removingGuestId === guest.id}
                                onClick={() => {
                                  onRemoveGuest(guest.id)
                                  setConfirmingGuestId(null)
                                }}
                              >
                                {removingGuestId === guest.id ? '…' : 'Remove'}
                              </button>
                              <button type="button" onClick={() => setConfirmingGuestId(null)}>
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="sv2-guest-remove-btn"
                              aria-label={`Remove ${guest.name} from this Sofra`}
                              onClick={() => setConfirmingGuestId(guest.id)}
                            >
                              Remove
                            </button>
                          )
                        )}
                      </article>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: 12 }}>No one&rsquo;s replied yet.</p>
                )}
              </section>
            ) : (
              <div className="sv2-table-preview">
                <div className="sv2-table-preview-header">
                  <span>The table</span>
                  <span className="sv2-table-preview-lock">🔒 RSVP to see who</span>
                </div>
                <div className="sv2-table-preview-dots" aria-hidden="true">
                  {LOCKED_TABLE_TINTS.map((tint, i) => (
                    <span key={i} style={{ background: tint }} />
                  ))}
                </div>
                <p className="sv2-table-preview-caption">The table&rsquo;s filling up. Reply to meet them.</p>
              </div>
            )}

            {unlocked && (
              <section className="sv2-shared-album" aria-labelledby="sv2-album-heading">
                <div className="sv2-section-heading">
                  <h2 id="sv2-album-heading">Shared Album</h2>
                  <div className="sv2-album-heading-actions">
                    <span>{photos.length} {photos.length === 1 ? 'memory' : 'memories'}</span>
                    {photos.length > 0 && (
                      <button type="button" className="sv2-view-album-link" onClick={() => onOpenAlbum()}>
                        VIEW ALBUM
                      </button>
                    )}
                  </div>
                </div>

                {photoError && (
                  <p role="alert" style={{ fontSize: 12, marginBottom: 8 }}>
                    {photoError}{' '}
                    <button type="button" onClick={onRetryPhotos}>Retry</button>
                  </p>
                )}

                {photos.length === 0 ? (
                  <p style={{ fontSize: 12 }}>No memories yet.</p>
                ) : (
                  <div className="sv2-album-preview-grid" data-count={Math.min(previewTiles.length, 6)}>
                    {previewTiles.map((photo) => (
                      <button
                        key={photo.id}
                        type="button"
                        className="sv2-album-preview-tile"
                        onClick={() => onOpenAlbum(photo.id)}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={photo.url} alt="A memory shared from this Sofra" />
                      </button>
                    ))}
                    {overflowCount > 0 && (
                      <button
                        type="button"
                        className="sv2-album-preview-tile sv2-album-preview-overflow"
                        style={overflowBackgroundUrl ? { backgroundImage: `url(${overflowBackgroundUrl})` } : undefined}
                        onClick={() => onOpenAlbum()}
                        aria-label={`View all ${photos.length} photos`}
                      >
                        <span>+{overflowCount}</span>
                      </button>
                    )}
                  </div>
                )}

                <AddPhotosControl disabled={uploadingPhoto} onFilesConfirmed={onFilesConfirmed} />
                <PhotoUploadProgress state={uploadProgress} onDismiss={onDismissUploadProgress} />
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

            {isHost && !isPast && (
              <Link className="sv2-edit-event-bottom" href="#" onClick={(e) => { e.preventDefault(); onEditEvent() }}>
                EDIT EVENT
              </Link>
            )}
          </article>
        )}
      </main>
    </div>
  )
}
