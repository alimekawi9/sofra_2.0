'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { sv2Display, sv2Sans } from './fonts'
import { AddPhotosControl } from './AddPhotosControl'
import { PhotoUploadProgress, uploadTransitionLabel, type UploadProgressState } from './PhotoUploadProgress'
import { buildPreviewTiles } from '@/lib/shared-album'
import { ProfileIdentityLink } from './ProfileIdentityLink'
import { DEFAULT_EVENT_IMAGE_PATH } from '@/lib/event-images'
import type { EventChatMessage } from '@/lib/event-chat'
import type { PlaylistSuggestion } from '@/lib/event-playlist'
import { EventPlaylist } from './EventPlaylist'
import type { CustomDetailSection } from '@/lib/event-custom-details'
import SofraTransition from '../SofraTransition'
import type { PendingEventAccessRequest } from '@/lib/event-access-requests'
import type { PendingEventUpdateNotice } from '@/lib/event-update-notices'
import type { EventPrepItem, EventPrepKey } from '@/lib/event-prep'
import { EventPrepChecklist } from './EventPrepChecklist'
import { SofraFeedbackPrompt } from './SofraFeedbackPrompt'
import { googleCalendarUrl, icsDataUrl } from '@/lib/calendar'
import { MAX_DRESS_CODE_PHOTOS } from '@/lib/event-dress-code-photos'
import { isEventDateUndecided } from '@/lib/event-date'

export interface EventPaperGuest {
  id: string
  name: string
  photoUrl: string | null
  isHost?: boolean
}

export interface EventPaperProps {
  eventId: string
  loading: boolean
  error: string
  onRetry: () => void
  isHost: boolean
  canExportSpotify?: boolean
  isPast: boolean
  title: string
  tagline: string | null
  dateLabel: string
  timeLabel: string
  /** Raw stored `event_date` (a floating wall-clock value; see lib/event-date.ts), for calendar export. Null while still loading. */
  eventDateIso: string | null
  venue: string
  address: string | null
  dressCode: string | null
  dressCodePhotos?: Array<{ id: string; url: string }>
  dressCodePhotoError?: string
  uploadingDressCodePhoto?: boolean
  onUploadDressCodePhotos?: (files: File[]) => void
  onDeleteDressCodePhoto?: (photoId: string) => void
  customDetails: CustomDetailSection[]
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
  pendingUpdateNotice?: PendingEventUpdateNotice | null
  updateNoticeError?: string
  onSendPendingUpdate?: () => void
  onDismissUpdateNotice?: () => void
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
  hostNeedsKitchen: boolean
  onAddHostKitchen: () => void
  onEditRsvp: () => void
  onRsvp: () => void
  onEditEvent: (section?: 'concept' | 'prep-estimates' | 'location') => void
  onRemoveGuest?: (guestId: string) => void
  removingGuestId?: string | null
  removeGuestError?: string
  accessRequests?: PendingEventAccessRequest[]
  respondingToAccessRequest?: string | null
  accessRequestError?: string
  onRespondToAccessRequest?: (requestId: string, accept: boolean) => void
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
  playlistSuggestions: PlaylistSuggestion[]
  playlistLoading: boolean
  playlistAdding: boolean
  playlistError: string
  onRetryPlaylist: () => void
  onAddPlaylistSong: (song: string, spotifyTrackId?: string | null) => Promise<boolean>
  playlistDeletingId: string | null
  onDeletePlaylistSong: (suggestionId: string) => Promise<boolean>
  prepItems?: EventPrepItem[]
  prepSavingKey?: EventPrepKey | null
  prepError?: string
  onSavePrepItem?: (key: EventPrepKey, completed: boolean, note?: string) => Promise<boolean>
  onOpenMenu?: () => void
  onOpenSeating?: () => void
  onOpenTimeline?: () => void
  onSendPhotoReminder?: () => void
  feedbackSubmitted?: boolean
  onSubmitFeedback?: (rating: number, ease: number, comment: string) => Promise<boolean>
}

const RSVP_LABELS: Record<string, string> = {
  going: 'Blessing us with your presence',
  maybe: 'Maybe ◈',
  cant: 'I have better things to do apparently',
}

// Decorative only — stand-ins for hidden guest avatars, not real guest colors.
const LOCKED_TABLE_TINTS = ['#7A2324', '#8A5A2B', '#4A5240', '#6E3B45', '#8A6A2B', '#3A4A5A']

function GoogleCalendarGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="sv2-calendar-glyph sv2-calendar-glyph-outline">
      <path d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />
      <circle cx="8" cy="14" r="1.2" fill="#4285F4" stroke="none" />
      <circle cx="12" cy="14" r="1.2" fill="#EA4335" stroke="none" />
      <circle cx="16" cy="14" r="1.2" fill="#FBBC05" stroke="none" />
      <circle cx="10" cy="17" r="1.2" fill="#34A853" stroke="none" />
    </svg>
  )
}

function AppleGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="sv2-calendar-glyph sv2-calendar-glyph-solid">
      <path d="M15.5 8.1c-1.2 0-2.5.7-3.3.7-.8 0-1.9-.7-3.1-.68-1.6.02-3.1.94-3.9 2.38-1.68 2.9-.43 7.2 1.2 9.56.8 1.15 1.75 2.45 3 2.4 1.2-.05 1.66-.78 3.1-.78 1.44 0 1.86.78 3.13.75 1.3-.02 2.11-1.17 2.9-2.33.9-1.32 1.28-2.6 1.3-2.67-.03-.01-2.5-.96-2.52-3.8-.02-2.38 1.94-3.52 2.03-3.58-1.1-1.63-2.83-1.81-3.43-1.85-1.55-.13-2.87.9-3.37.9Z" />
      <path d="M14.9 6.2c.67-.8 1.12-1.93 1-3.05-.96.04-2.12.65-2.81 1.45-.62.71-1.16 1.86-1.01 2.95 1.07.08 2.16-.55 2.82-1.35Z" />
    </svg>
  )
}

export function EventPaper({
  eventId,
  loading,
  error,
  onRetry,
  isHost,
  canExportSpotify = false,
  isPast,
  title,
  tagline,
  dateLabel,
  timeLabel,
  eventDateIso,
  venue,
  address,
  dressCode,
  dressCodePhotos = [],
  dressCodePhotoError = '',
  uploadingDressCodePhoto = false,
  onUploadDressCodePhotos,
  onDeleteDressCodePhoto,
  customDetails,
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
  pendingUpdateNotice = null,
  updateNoticeError = '',
  onSendPendingUpdate,
  onDismissUpdateNotice,
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
  hostNeedsKitchen,
  onAddHostKitchen,
  onEditRsvp,
  onRsvp,
  onEditEvent,
  onRemoveGuest,
  removingGuestId = null,
  removeGuestError = '',
  accessRequests = [],
  respondingToAccessRequest = null,
  accessRequestError = '',
  onRespondToAccessRequest,
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
  playlistSuggestions,
  playlistLoading,
  playlistAdding,
  playlistError,
  onRetryPlaylist,
  onAddPlaylistSong,
  playlistDeletingId,
  onDeletePlaylistSong,
  prepItems = [],
  prepSavingKey = null,
  prepError = '',
  onSavePrepItem,
  onOpenMenu,
  onOpenSeating,
  onOpenTimeline,
  onSendPhotoReminder,
  feedbackSubmitted = false,
  onSubmitFeedback,
}: EventPaperProps) {
  const safeUnreadMessages = Number.isFinite(unreadMessages) ? Math.max(0, Math.floor(unreadMessages)) : 0
  const albumFeedbackLocked = !isHost && isPast && !feedbackSubmitted
  const [confirmingGuestId, setConfirmingGuestId] = useState<string | null>(null)
  const [communityView, setCommunityView] = useState<'album' | 'chat' | 'vibe'>('album')
  const [inviteMenuOpen, setInviteMenuOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [guestsOpen, setGuestsOpen] = useState(false)
  const { tiles: previewTiles, overflowCount } = buildPreviewTiles(photos)
  const overflowBackgroundUrl = overflowCount > 0 ? photos[previewTiles.length]?.url : undefined
  const attendingGuests = guests.filter((guest) => !guest.isHost)
  const guestPreview = attendingGuests
    .map((guest, index) => ({ guest, index }))
    .sort((first, second) => Number(Boolean(second.guest.photoUrl)) - Number(Boolean(first.guest.photoUrl)) || first.index - second.index)
    .slice(0, 3)
    .map(({ guest }) => guest)
  const guestOverflow = Math.max(0, attendingGuests.length - guestPreview.length)
  const updateNoticeLines = (['date', 'time', 'location', 'photos'] as const)
    .filter((kind) => pendingUpdateNotice?.kinds.includes(kind))
    .map((kind) => {
      if (kind === 'date') return { kind, text: `Date changed to ${dateLabel}.` }
      if (kind === 'time') return { kind, text: `Time changed to ${timeLabel}.` }
      if (kind === 'location') return { kind, text: `Location changed to ${[venue, address].filter(Boolean).join(' — ')}.` }
      return { kind, text: 'New photos were uploaded to the Shared Album.' }
    })

  // Split in two so calendar export can sit right after Date/Time/Location --
  // the section it's actually about -- rather than at the bottom of the
  // whole facts list, after unrelated things like Dress code.
  const eventFactsDateTime = (
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
              <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`} target="_blank" rel="noreferrer">Google Maps</a>
              <a href={`https://maps.apple.com/?q=${encodeURIComponent(address)}`} target="_blank" rel="noreferrer">Apple Maps</a>
            </span>
          )}
        </dd>
      </div>
    </dl>
  )

  // The host always sees the Dress code row, even with no text/photos yet,
  // since it's the only place to add reference photos; a guest only sees it
  // once there's actually something to show.
  const showDressCodeRow = isHost || Boolean(dressCode) || dressCodePhotos.length > 0
  const dressCodePhotoUpload = isHost && onUploadDressCodePhotos && (
    <label className={`sv2-dress-code-photo-add${uploadingDressCodePhoto ? ' is-disabled' : ''}`}>
      {uploadingDressCodePhoto ? 'Uploading…' : dressCodePhotos.length > 0 ? '+ Add more photos' : '+ Add example photos'}
      <input
        type="file"
        accept="image/*"
        multiple
        disabled={uploadingDressCodePhoto || dressCodePhotos.length >= MAX_DRESS_CODE_PHOTOS}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? [])
          event.target.value = ''
          if (files.length) onUploadDressCodePhotos(files)
        }}
      />
    </label>
  )
  const eventFactsExtra = (showDressCodeRow || customDetails.length > 0 || !isHost) && (
    <dl className="sv2-event-facts">
      {showDressCodeRow && (
        <div>
          <dt>Dress code</dt>
          <dd>
            {dressCode}
            {dressCodePhotos.length > 0 && (
              <div className="sv2-dress-code-photos" aria-label="Dress code reference photos">
                {dressCodePhotos.map((photo) => (
                  <div key={photo.id} className="sv2-dress-code-photo-tile">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.url} alt="" />
                    {isHost && onDeleteDressCodePhoto && (
                      <button
                        type="button"
                        className="sv2-dress-code-photo-remove"
                        aria-label="Remove this reference photo"
                        onClick={() => onDeleteDressCodePhoto(photo.id)}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {dressCodePhotoUpload}
            {dressCodePhotoError && <p role="alert" className="sv2-dress-code-photo-error">{dressCodePhotoError}</p>}
          </dd>
        </div>
      )}
      {customDetails.map((section) => (
        <div key={section.id}><dt>{section.label}</dt><dd>{section.body}</dd></div>
      ))}
      {!isHost && (
        <div>
          <dt>Your RSVP</dt>
          <dd>{isPast ? 'Attended' : myRsvpStatus ? RSVP_LABELS[myRsvpStatus] : 'Not yet responded'}</dd>
        </div>
      )}
    </dl>
  )

  // No calendar event can be built until there's a real date -- an
  // undecided date has no wall-clock time to export.
  const calendarLocation = [venue, unlocked && address ? address : null].filter(Boolean).join(', ')
  const calendarDetails = eventDateIso && !isEventDateUndecided(eventDateIso)
    ? { title, description: tagline ?? undefined, location: calendarLocation || undefined, startIso: eventDateIso }
    : null
  const calendarButtons = calendarDetails && (
    <div className="sv2-calendar-actions" aria-label="Add to calendar">
      <a
        className="sv2-calendar-action sv2-calendar-google"
        href={googleCalendarUrl(calendarDetails)}
        target="_blank"
        rel="noreferrer"
      >
        <GoogleCalendarGlyph /> Google Calendar
      </a>
      <a
        className="sv2-calendar-action sv2-calendar-apple"
        href={icsDataUrl(calendarDetails)}
        download={`${title || 'sofra-event'}.ics`}
      >
        <AppleGlyph /> Apple Calendar
      </a>
    </div>
  )

  const guestRoster = (
    <section className="sv2-guest-overview" aria-labelledby="sv2-guest-heading">
      <div className="sv2-section-heading">
        <h2 id="sv2-guest-heading">Around this Sofra</h2>
        <span>{guests.length} going</span>
      </div>
      {removeGuestError && <p role="alert" style={{ fontSize: 12, marginBottom: 8 }}>{removeGuestError}</p>}
      {guests.length > 0 ? (
        <div className="sv2-guest-grid">
          {guests.map((guest) => (
            <article key={guest.id} className={isHost ? 'sv2-guest-removable' : undefined}>
              <ProfileIdentityLink className="sv2-guest-profile-link" userId={guest.id} name={guest.name} photoUrl={guest.photoUrl} />
              {guest.isHost && <span className="sv2-guest-host-badge">Host</span>}
              {isHost && !guest.isHost && onRemoveGuest && (
                confirmingGuestId === guest.id ? (
                  <div className="sv2-guest-remove-confirm">
                    <button type="button" disabled={removingGuestId === guest.id} onClick={() => { onRemoveGuest(guest.id); setConfirmingGuestId(null) }}>
                      {removingGuestId === guest.id ? '…' : 'Remove'}
                    </button>
                    <button type="button" onClick={() => setConfirmingGuestId(null)}>Cancel</button>
                  </div>
                ) : (
                  <button type="button" className="sv2-guest-remove-btn" aria-label={`Remove ${guest.name} from this Sofra`} onClick={() => setConfirmingGuestId(guest.id)}>
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
  )

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
          <div className="sv2-cohost-share sv2-cohost-popover">
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
          <article className={`sv2-event-paper${isHost ? ' sv2-host-event-paper' : ''}`}>
            {coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="sv2-event-artwork sv2-event-cover-image" src={coverUrl} alt="" />
            ) : (
              <Image className="sv2-event-artwork sv2-event-cover-image sv2-event-default-cover" src={DEFAULT_EVENT_IMAGE_PATH} alt="" width={1125} height={1401} />
            )}

            {isHost && (
              <div className="sv2-host-event-content">
                <div className="sv2-host-event-title-row">
                  <div>
                    <p className="sv2-event-kicker">YOU ARE HOSTING</p>
                    <h1>{title}</h1>
                  </div>
                  <div className="sv2-host-invite-wrap">
                    <button className="sv2-host-invite-trigger" type="button" aria-expanded={inviteMenuOpen} onClick={() => setInviteMenuOpen((open) => !open)}>
                      <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="18" cy="5" r="2" /><circle cx="6" cy="12" r="2" /><circle cx="18" cy="19" r="2" /><path d="m8 11 8-5M8 13l8 5" /></svg>
                      Send
                    </button>
                    {inviteMenuOpen && (
                      <div className="sv2-host-invite-popover" aria-label="Send options">
                        <button type="button" onClick={onCopyInviteLink}>{copied ? 'COPIED!' : 'COPY INVITE LINK'}</button>
                        <button type="button" onClick={onShareWhatsApp}>SHARE VIA WHATSAPP</button>
                        <button type="button" onClick={onSendUpdate}>SEND AN UPDATE</button>
                      </div>
                    )}
                  </div>
                </div>

                {copyFallbackUrl && (
                  <input className="sv2-host-copy-fallback" readOnly value={copyFallbackUrl} autoFocus onFocus={(event) => event.target.select()} />
                )}

                <div className="sv2-host-primary-actions">
                  {!isPast && <button className="sv2-host-primary-action" type="button" onClick={onViewTable}>Set the Sofra</button>}
                  <button type="button" onClick={() => onEditEvent()}>Edit Event</button>
                </div>

                {(pendingUpdateNotice || updateNoticeError) && (
                  <aside className="sv2-event-update-notice" aria-label="Event update reminder">
                    <div>
                      <strong>THERE&rsquo;S SOMETHING NEW TO SHARE</strong>
                      {pendingUpdateNotice && updateNoticeLines.map((line) => <p key={line.kind}>{line.text}</p>)}
                      {updateNoticeError && <p role="alert">{updateNoticeError}</p>}
                    </div>
                    {pendingUpdateNotice && <div>
                      <button type="button" onClick={onSendPendingUpdate}>SEND UPDATE</button>
                      <button type="button" onClick={onDismissUpdateNotice}>DISMISS</button>
                    </div>}
                  </aside>
                )}

                {(accessRequests.length > 0 || accessRequestError) && (
                  <aside className="sv2-access-notifications" aria-label="Pending access requests">
                    <div className="sv2-section-heading"><h2>Access requests</h2><span>{accessRequests.length} pending</span></div>
                    {accessRequestError && <p role="alert">{accessRequestError}</p>}
                    {accessRequests.map((request) => (
                      <article key={request.id}>
                        <ProfileIdentityLink userId={request.userId} name={request.name} photoUrl={request.photoUrl} />
                        <div>
                          <button type="button" disabled={respondingToAccessRequest === request.id} onClick={() => onRespondToAccessRequest?.(request.id, true)}>ACCEPT</button>
                          <button type="button" disabled={respondingToAccessRequest === request.id} onClick={() => onRespondToAccessRequest?.(request.id, false)}>REJECT</button>
                        </div>
                      </article>
                    ))}
                  </aside>
                )}
                {hostNeedsPreferences && (
                  <aside className="sv2-host-preferences-notice">
                    <div><strong>YOUR TASTE BELONGS AT THE TABLE</strong><p>Add your preferences so the menu accounts for you too.</p></div>
                    <button type="button" onClick={onAddHostPreferences}>ADD PREFERENCES</button>
                  </aside>
                )}
                {hostNeedsKitchen && !isPast && (
                  <aside className="sv2-host-preferences-notice">
                    <div><strong>YOUR KITCHEN IS STILL WAITING</strong><p>Pick up where you left off before the invite goes out.</p></div>
                    <button type="button" onClick={onAddHostKitchen}>FILL KITCHEN NOW</button>
                  </aside>
                )}

                <section className="sv2-host-details-disclosure">
                  <button type="button" aria-expanded={detailsOpen} onClick={() => setDetailsOpen((open) => !open)}>
                    <span className="sv2-host-details-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24"><path d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" /></svg>
                    </span>
                    <span className="sv2-host-details-copy">
                      <strong>{dateLabel} · {timeLabel}</strong>
                      <span>{[venue, tagline].filter(Boolean).join(' · ')}</span>
                    </span>
                    <span className="sv2-disclosure-line" aria-hidden="true" />
                  </button>
                  {detailsOpen && <div className="sv2-host-details-expanded">{tagline && <p className="sv2-event-note">{tagline}</p>}{eventFactsDateTime}{!isPast && calendarButtons}{eventFactsExtra}</div>}
                </section>

                {prepItems.length > 0 && onSavePrepItem && onSubmitFeedback && (
                  <EventPrepChecklist
                    items={prepItems}
                    isPast={isPast}
                    savingKey={prepSavingKey}
                    error={prepError}
                    onSaveItem={onSavePrepItem}
                    onSubmitFeedback={onSubmitFeedback}
                    onAction={(action) => {
                      if (action === 'edit-concept') return onEditEvent('concept')
                      if (action === 'edit-estimates') return onEditEvent('prep-estimates')
                      if (action === 'edit-location') return onEditEvent('location')
                      if (action === 'invite') { setInviteMenuOpen(true); return }
                      if (action === 'menu') return onOpenMenu?.()
                      if (action === 'vibe') { setCommunityView('vibe'); window.setTimeout(() => document.getElementById('sv2-event-community')?.scrollIntoView({ behavior: 'smooth' }), 0); return }
                      if (action === 'table') return onViewTable()
                      if (action === 'timeline') return onOpenTimeline?.()
                      if (action === 'seating') return onOpenSeating?.()
                      if (action === 'album') return onOpenAlbum()
                      if (action === 'photo-reminder') return onSendPhotoReminder?.()
                    }}
                  />
                )}

                <section className="sv2-host-guests-disclosure" aria-label="Guest list">
                  <div className="sv2-host-guest-heading">
                    <span>GUEST LIST</span>
                  </div>
                  <button className="sv2-host-guest-summary" type="button" aria-expanded={guestsOpen} onClick={() => setGuestsOpen((open) => !open)}>
                    <span className="sv2-host-guest-avatars" aria-hidden="true">
                      {guestPreview.map((guest) => guest.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={guest.id} src={guest.photoUrl} alt="" />
                      ) : <span key={guest.id}>{guest.name.trim().slice(0, 1).toUpperCase()}</span>)}
                      {guestOverflow > 0 && <span>+{guestOverflow}</span>}
                    </span>
                    <strong>{attendingGuests.length} {attendingGuests.length === 1 ? 'guest' : 'guests'} attending</strong>
                    <span className="sv2-disclosure-line" aria-hidden="true" />
                  </button>
                  {guestsOpen && <div className="sv2-host-guest-expanded">{guestRoster}</div>}
                </section>
              </div>
            )}

            {!isHost && <>
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
                {(accessRequests.length > 0 || accessRequestError) && (
                  <aside className="sv2-access-notifications" aria-label="Pending access requests">
                    <div className="sv2-section-heading">
                      <h2>Access requests</h2>
                      <span>{accessRequests.length} pending</span>
                    </div>
                    {accessRequestError && <p role="alert">{accessRequestError}</p>}
                    {accessRequests.map((request) => (
                      <article key={request.id}>
                        <ProfileIdentityLink userId={request.userId} name={request.name} photoUrl={request.photoUrl} />
                        <div>
                          <button type="button" disabled={respondingToAccessRequest === request.id}
                            onClick={() => onRespondToAccessRequest?.(request.id, true)}>
                            ACCEPT
                          </button>
                          <button type="button" disabled={respondingToAccessRequest === request.id}
                            onClick={() => onRespondToAccessRequest?.(request.id, false)}>
                            REJECT
                          </button>
                        </div>
                      </article>
                    ))}
                  </aside>
                )}
                {hostNeedsPreferences && (
                  <aside className="sv2-host-preferences-notice">
                    <div>
                      <strong>YOUR TASTE BELONGS AT THE TABLE</strong>
                      <p>Add your preferences so the menu accounts for you too.</p>
                    </div>
                    <button type="button" onClick={onAddHostPreferences}>ADD PREFERENCES</button>
                  </aside>
                )}
                {hostNeedsKitchen && (
                  <aside className="sv2-host-preferences-notice">
                    <div>
                      <strong>YOUR KITCHEN IS STILL WAITING</strong>
                      <p>Pick up where you left off before the invite goes out.</p>
                    </div>
                    <button type="button" onClick={onAddHostKitchen}>FILL KITCHEN NOW</button>
                  </aside>
                )}
              </>
            )}

            {tagline && <p className="sv2-event-note">{tagline}</p>}

            {eventFactsDateTime}
            {!isPast && calendarButtons}
            {eventFactsExtra}

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

            </>}

            {unlocked && (
              <section id="sv2-event-community" className="sv2-event-community" aria-label="Event album, chat, and playlist">
                <div className="sv2-community-tabs" role="tablist" aria-label="Event community">
                  <button type="button" role="tab" aria-selected={communityView === 'album'}
                    className={communityView === 'album' ? 'is-active' : ''} onClick={() => setCommunityView('album')}>
                    SHARED ALBUM
                  </button>
                  <button type="button" role="tab" aria-selected={communityView === 'chat'}
                    className={communityView === 'chat' ? 'is-active' : ''} onClick={() => setCommunityView('chat')}>
                    <span>CHAT</span>
                    {safeUnreadMessages > 0 && (
                      <span className="sv2-chat-unread-badge" aria-label={`${safeUnreadMessages} unread messages`}>
                        {safeUnreadMessages}
                      </span>
                    )}
                  </button>
                  <button type="button" role="tab" aria-selected={communityView === 'vibe'}
                    className={communityView === 'vibe' ? 'is-active' : ''} onClick={() => setCommunityView('vibe')}>
                    THE VIBE
                  </button>
                </div>

                {communityView === 'album' ? (
                <div className="sv2-shared-album" role="tabpanel" aria-labelledby="sv2-album-heading">
                <div className="sv2-section-heading">
                  <h2 id="sv2-album-heading">Shared Album</h2>
                  <div className="sv2-album-heading-actions">
                    <span>{photos.length} {photos.length === 1 ? 'memory' : 'memories'}</span>
                    {photos.length > 0 && !albumFeedbackLocked && (
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
                  <div className={`sv2-album-preview-grid${albumFeedbackLocked ? ' is-feedback-locked' : ''}`} data-count={Math.min(previewTiles.length, 6)} aria-hidden={albumFeedbackLocked || undefined}>
                    {previewTiles.map((photo) => (
                      <button
                        key={photo.id}
                        type="button"
                        disabled={albumFeedbackLocked}
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
                        disabled={albumFeedbackLocked}
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

                {albumFeedbackLocked && onSubmitFeedback ? (
                  <SofraFeedbackPrompt submitted={false} onSubmit={onSubmitFeedback} />
                ) : <>
                  <AddPhotosControl disabled={uploadingPhoto} currentCount={photos.length} onFilesConfirmed={onFilesConfirmed} />
                  <PhotoUploadProgress state={uploadProgress} onDismiss={onDismissUploadProgress} />
                  <SofraTransition active={uploadingPhoto} label={uploadTransitionLabel(uploadProgress)} />
                </>}
                </div>
                ) : communityView === 'chat' ? (
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
                ) : (
                  <EventPlaylist eventId={eventId} eventTitle={title} isHost={isHost} canExportSpotify={canExportSpotify}
                    suggestions={playlistSuggestions} currentUserId={currentUserId}
                    loading={playlistLoading} adding={playlistAdding} error={playlistError}
                    deletingId={playlistDeletingId} onRetry={onRetryPlaylist}
                    onAdd={onAddPlaylistSong} onDelete={onDeletePlaylistSong} />
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

          </article>
        )}
      </main>
    </div>
  )
}
