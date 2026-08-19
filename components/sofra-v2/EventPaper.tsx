'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { sv2Display, sv2Sans } from './fonts'
import { AddPhotosControl } from './AddPhotosControl'
import { PhotoUploadProgress, type UploadProgressState } from './PhotoUploadProgress'
import { buildPreviewTiles } from '@/lib/shared-album'
import { ProfileIdentityLink } from './ProfileIdentityLink'
import { DEFAULT_EVENT_IMAGE_PATH } from '@/lib/event-images'
import type { EventChatMessage } from '@/lib/event-chat'

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
  onSendUpdate: () => void
  canInviteCohost?: boolean
  cohostSharing?: boolean
  cohostCopied?: boolean
  cohostShareError?: string
  onToggleCohostSharing?: () => void
  onCopyCohostLink?: () => void
  onShareCohostWhatsApp?: () => void
  onViewTable: () => void
  hostNeedsPreferences: boolean
  onAddHostPreferences: () => void
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
  currentUserId: string | null
  messages: EventChatMessage[]
  unreadMessages: number
  chatLoading: boolean
  chatError: string
  onRetryChat: () => void
  onOpenChat: () => void
}

const RSVP_LABELS: Record<string, string> = {
  going: 'Blessing us with your presence',
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
  onSendUpdate,
  canInviteCohost = false,
  cohostSharing = false,
  cohostCopied = false,
  cohostShareError = '',
  onToggleCohostSharing,
  onCopyCohostLink,
  onShareCohostWhatsApp,
  onViewTable,
  hostNeedsPreferences,
  onAddHostPreferences,
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
  currentUserId,
  messages,
  unreadMessages,
  chatLoading,
  chatError,
  onRetryChat,
  onOpenChat,
}: EventPaperProps) {
  const safeUnreadMessages = Number.isFinite(unreadMessages) ? Math.max(0, Math.floor(unreadMessages)) : 0
  const [confirmingGuestId, setConfirmingGuestId] = useState<string | null>(null)
  const [communityView, setCommunityView] = useState<'album' | 'chat'>('album')
  const { tiles: previewTiles, overflowCount } = buildPreviewTiles(photos)
  const overflowBackgroundUrl = overflowCount > 0 ? photos[previewTiles.length]?.url : undefined
  return (
    <div className={`sv2-root sv2-device-page sv2-app-page ${sv2Display.variable} ${sv2Sans.variable}`}>
      <main className="sv2-device-shell sv2-app-shell sv2-event-detail-shell">
        <div className="sv2-event-topbar">
          <Link className="sv2-back-link" href="/events">← Your Sofras</Link>
          {canInviteCohost && (
            <button className="sv2-cohost-trigger" type="button" onClick={onToggleCohostSharing} aria-expanded={cohostSharing}>
              CO-HOST
            </button>
          )}
        </div>
        {canInviteCohost && cohostSharing && (
          <div className="sv2-cohost-share">
            <div className="sv2-host-share-actions" aria-label="Co-host sharing options">
              <button type="button" onClick={onCopyCohostLink}>{cohostCopied ? 'COPIED!' : 'COPY CO-HOST LINK'}</button>
              <button type="button" onClick={onShareCohostWhatsApp}>SEND VIA WHATSAPP</button>
            </div>
            {cohostShareError && <p role="alert">{cohostShareError}</p>}
          </div>
        )}

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
              <Image className="sv2-event-artwork sv2-event-cover-image sv2-event-default-cover" src={DEFAULT_EVENT_IMAGE_PATH} alt="" width={1125} height={1401} />
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
                  <button type="button" onClick={onSendUpdate}>SEND AN UPDATE</button>
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
                {hostNeedsPreferences && (
                  <aside className="sv2-host-preferences-notice">
                    <div>
                      <strong>YOUR TASTE BELONGS AT THE TABLE</strong>
                      <p>Add your preferences so the menu accounts for you too.</p>
                    </div>
                    <button type="button" onClick={onAddHostPreferences}>ADD PREFERENCES</button>
                  </aside>
                )}
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
                  {unlocked && address && (
                    <span className="sv2-map-links" aria-label="Open location in maps">
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
                        target="_blank"
                        rel="noreferrer"
                      >Google Maps</a>
                      <a
                        href={`https://maps.apple.com/?q=${encodeURIComponent(address)}`}
                        target="_blank"
                        rel="noreferrer"
                      >Apple Maps</a>
                    </span>
                  )}
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
              <section className="sv2-event-community" aria-label="Event album and chat">
                <div className="sv2-community-tabs" role="tablist" aria-label="Event community">
                  <button type="button" role="tab" aria-selected={communityView === 'album'}
                    className={communityView === 'album' ? 'is-active' : ''} onClick={() => setCommunityView('album')}>
                    SHARED ALBUM
                  </button>
                  <button type="button" role="tab" aria-selected={communityView === 'chat'}
                    className={communityView === 'chat' ? 'is-active' : ''} onClick={() => setCommunityView('chat')}>
                    CHAT{safeUnreadMessages > 0 ? ` · ${safeUnreadMessages}` : ''}
                  </button>
                </div>

                {communityView === 'album' ? (
                <div className="sv2-shared-album" role="tabpanel" aria-labelledby="sv2-album-heading">
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

                <AddPhotosControl disabled={uploadingPhoto} currentCount={photos.length} onFilesConfirmed={onFilesConfirmed} />
                <PhotoUploadProgress state={uploadProgress} onDismiss={onDismissUploadProgress} />
                </div>
                ) : (
                  <div className="sv2-chat-preview" role="tabpanel" aria-labelledby="sv2-chat-preview-heading">
                    <div className="sv2-section-heading">
                      <h2 id="sv2-chat-preview-heading">Chat</h2>
                      <div className="sv2-album-heading-actions">
                        <span>{messages.length} {messages.length === 1 ? 'message' : 'messages'}</span>
                        <button type="button" className="sv2-view-album-link" onClick={onOpenChat}>OPEN CHAT</button>
                      </div>
                    </div>
                    {chatError && <p className="sv2-chat-error" role="alert">{chatError} <button type="button" onClick={onRetryChat}>Retry</button></p>}
                    {chatLoading && messages.length === 0 ? <p className="sv2-chat-empty">Loading messages...</p> : null}
                    {!chatLoading && messages.length === 0 ? <p className="sv2-chat-empty">No messages yet. Open chat to start the conversation.</p> : null}
                    {messages.length > 0 && (
                      <div className="sv2-chat-preview-list">
                        {messages.slice(-3).map((message) => (
                          <article key={message.id} className={`sv2-chat-message${message.userId === currentUserId ? ' sv2-chat-message-mine' : ''}`}>
                            <div className="sv2-chat-message-meta">
                              <ProfileIdentityLink userId={message.userId} name={message.senderName} photoUrl={message.senderPhotoUrl} />
                              <time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</time>
                            </div>
                            <p>{message.body}</p>
                          </article>
                        ))}
                      </div>
                    )}
                  </div>
                )}
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
