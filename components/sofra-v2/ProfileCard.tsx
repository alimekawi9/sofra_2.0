'use client'

import { sv2Display, sv2Sans } from './fonts'
import { SofraHistoryArtwork } from './SofraHistoryArtwork'
import type { Appearance } from '@/lib/sofra/appearance'

export interface ProfileHistoryEntry {
  id: string
  title: string
  date: string
  went: 'Going' | 'Went'
}

export interface ProfileCardProps {
  name: string
  phone: string | null
  photoUrl: string | null
  caption: string
  onCaptionChange: (value: string) => void
  onCaptionSave: () => void
  savingCaption: boolean
  captionEditing: boolean
  onCaptionEdit: () => void
  hostPreferenceHref: string | null
  showPreferenceWarning: boolean
  onDismissPreferenceWarning: () => void
  onPhotoSelect: (file: File) => void
  uploading: boolean
  uploadError: string
  dinnerCount: number
  preferencesSummary: string | null
  history: ProfileHistoryEntry[]
  loading: boolean
  error: string
  onHistorySelect: (id: string) => void
  onLogout: () => void
  appearance: Appearance
  onAppearanceChange: (appearance: Appearance) => void
}

export function ProfileCard({
  name,
  phone,
  photoUrl,
  caption,
  onCaptionChange,
  onCaptionSave,
  savingCaption,
  captionEditing,
  onCaptionEdit,
  hostPreferenceHref,
  showPreferenceWarning,
  onDismissPreferenceWarning,
  onPhotoSelect,
  uploading,
  uploadError,
  dinnerCount,
  preferencesSummary,
  history,
  loading,
  error,
  onHistorySelect,
  onLogout,
  appearance,
  onAppearanceChange,
}: ProfileCardProps) {
  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className={`sv2-root sv2-profile-page sv2-profile-page--${appearance} ${sv2Display.variable} ${sv2Sans.variable}`}>
      <div className="sv2-device-shell sv2-app-shell sv2-profile-shell">
        <section className="sv2-profile-appearance" aria-labelledby="profile-appearance-heading">
          <div>
            <h2 id="profile-appearance-heading">Appearance</h2>
            <p>Light is the default. Choose what feels best.</p>
          </div>
          <button
            type="button"
            className="sv2-profile-theme-switch"
            role="switch"
            aria-checked={appearance === 'dark'}
            aria-label={appearance === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={() => onAppearanceChange(appearance === 'dark' ? 'light' : 'dark')}
          >
            <span aria-hidden="true" />
            {appearance === 'dark' ? 'DARK' : 'LIGHT'}
          </button>
        </section>
        <section className="sv2-profile-identity" aria-labelledby="sv2-profile-name">
          <label className="sv2-profile-photo" tabIndex={0}>
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt="Your profile photo" />
            ) : (
              <span className="sv2-profile-photo-initials">{initials}</span>
            )}
            <small className="sv2-profile-photo-camera" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <path d="M8.5 5 10 3h4l1.5 2H19a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3h3.5ZM12 8a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 2.2a2.8 2.8 0 1 1 0 5.6 2.8 2.8 0 0 1 0-5.6Z" />
              </svg>
            </small>
            <span className="sv2-sr-only">Choose a profile photo</span>
            <input
              aria-label="Choose a profile photo"
              type="file"
              accept="image/*"
              disabled={uploading}
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (file) onPhotoSelect(file)
              }}
            />
          </label>
          <p className="sv2-profile-photo-helper">
            {uploading ? 'Uploading…' : photoUrl ? 'Change photo' : 'Add profile photo'}
          </p>
          {uploadError && (
            <p style={{ color: '#C0524A', fontSize: 12, marginTop: 6 }}>{uploadError}</p>
          )}
          <h1 id="sv2-profile-name">{name}</h1>
          <p>
            {dinnerCount} {dinnerCount === 1 ? 'dinner' : 'dinners'}
            {phone ? ` · ${phone}` : ''}
          </p>
        </section>

        <section className="sv2-profile-caption-editor">
          <label htmlFor="profile-caption">About me</label>
          {captionEditing ? (
            <textarea
              className="sv2-caption-editing"
              id="profile-caption"
              maxLength={240}
              value={caption}
              onChange={(event) => onCaptionChange(event.target.value)}
              placeholder="A little about you around the table"
            />
          ) : (
            <p className="sv2-caption-locked">{caption}</p>
          )}
          <button type="button" className={captionEditing ? 'sv2-caption-save' : 'sv2-caption-edit'} disabled={savingCaption} onClick={captionEditing ? onCaptionSave : onCaptionEdit}>
            {savingCaption ? 'SAVING...' : captionEditing ? 'SAVE CAPTION' : 'EDIT CAPTION'}
          </button>
        </section>

        <section className="sv2-profile-preferences">
          <h2>My preferences</h2>
          <p>{preferencesSummary ?? 'No preferences set yet.'}</p>
          {showPreferenceWarning && hostPreferenceHref && (
            <div className="sv2-profile-preference-warning" role="status">
              <p>Add your table preferences so Sofra can count your tastes when planning menus and portions.</p>
              <div>
                <a href={hostPreferenceHref}>ADD MY PREFERENCES</a>
                <button type="button" onClick={onDismissPreferenceWarning}>DISMISS</button>
              </div>
            </div>
          )}
          {hostPreferenceHref && !showPreferenceWarning && (
            <a className="sv2-profile-preference-link" href={hostPreferenceHref}>MY TABLE PREFERENCES</a>
          )}
        </section>

        <section className="sv2-profile-history">
          <h2>Your Sofras</h2>
          {loading ? (
            <p style={{ fontSize: 12 }}>Loading…</p>
          ) : error ? (
            <p style={{ color: '#C0524A', fontSize: 12 }}>{error}</p>
          ) : history.length === 0 ? (
            <p style={{ fontSize: 12 }}>No dinners yet. Your invites will show up here.</p>
          ) : (
            <div>
              {history.map((event, index) => (
                <article key={event.id}>
                  <SofraHistoryArtwork index={index} />
                  <div>
                    <h3><button type="button" className="sv2-profile-history-title" onClick={() => onHistorySelect(event.id)}>{event.title}</button></h3>
                    <p>{event.date}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onHistorySelect(event.id)}
                    style={{ background: 'none', border: 0, cursor: 'pointer', font: 'inherit', color: 'inherit', padding: 0 }}
                  >
                    <strong>{event.went}</strong>
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>

        <button className="sv2-profile-logout" type="button" onClick={onLogout}>
          LOG OUT
        </button>
      </div>
    </div>
  )
}
