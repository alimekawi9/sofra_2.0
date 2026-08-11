'use client'

import { sv2Display, sv2Sans } from './fonts'

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
  captionSaved: boolean
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
}

export function ProfileCard({
  name,
  phone,
  photoUrl,
  caption,
  onCaptionChange,
  onCaptionSave,
  savingCaption,
  captionSaved,
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
}: ProfileCardProps) {
  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className={`sv2-root ${sv2Display.variable} ${sv2Sans.variable}`}>
      <div className="sv2-device-shell sv2-app-shell sv2-profile-shell">
        <section className="sv2-profile-identity" aria-labelledby="sv2-profile-name">
          <label className="sv2-profile-photo" tabIndex={0}>
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt="Your profile photo" />
            ) : (
              <>
                <span>{initials}</span>
                <small aria-hidden="true">📷</small>
              </>
            )}
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
          <textarea
            id="profile-caption"
            maxLength={240}
            value={caption}
            onChange={(event) => onCaptionChange(event.target.value)}
            placeholder="A little about you around the table"
          />
          <button type="button" disabled={savingCaption} onClick={onCaptionSave}>
            {savingCaption ? 'SAVING...' : captionSaved ? 'SAVED' : 'SAVE CAPTION'}
          </button>
        </section>

        <section className="sv2-profile-preferences">
          <h2>My preferences</h2>
          <p>{preferencesSummary ?? 'No preferences set yet.'}</p>
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
              {history.map((event) => (
                <article key={event.id}>
                  <span className="sv2-profile-history-icon">◇</span>
                  <div>
                    <h3>{event.title}</h3>
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
