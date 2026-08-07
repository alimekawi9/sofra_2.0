'use client'

import type { ChangeEvent, DragEvent } from 'react'
import { HostLocationAutocomplete, type PreviewPlace } from './HostLocationAutocomplete'
import { sv2Display, sv2Sans } from './fonts'
import { THEMES } from '@/lib/theme'

export interface HostCreateFormProps {
  title: string
  onTitleChange: (value: string) => void
  tagline: string
  onTaglineChange: (value: string) => void
  dateTime: string
  onDateTimeChange: (value: string) => void
  location: string
  onLocationChange: (value: string) => void
  onPlaceSelect: (place: PreviewPlace | null) => void
  dressCode: string
  onDressCodeChange: (value: string) => void
  theme: string
  onThemeChange: (value: string) => void
  imageDataUrl: string | undefined
  onImageChange: (file: File) => void
  onImageRemove: () => void
  submitting: boolean
  error: string
  onSubmit: () => void
}

export function HostCreateForm({
  title,
  onTitleChange,
  tagline,
  onTaglineChange,
  dateTime,
  onDateTimeChange,
  location,
  onLocationChange,
  onPlaceSelect,
  dressCode,
  onDressCodeChange,
  theme,
  onThemeChange,
  imageDataUrl,
  onImageChange,
  onImageRemove,
  submitting,
  error,
  onSubmit,
}: HostCreateFormProps) {
  function chooseImage(file?: File) {
    if (file) onImageChange(file)
  }

  return (
    <div className={`sv2-root sv2-device-page sv2-app-page ${sv2Display.variable} ${sv2Sans.variable}`}>
      <main className="sv2-device-shell sv2-app-shell sv2-host-shell">
        <p className="sv2-event-kicker">HOST A GATHERING</p>
        <h1>Create a Sofra</h1>
        <form noValidate onSubmit={(event) => { event.preventDefault(); onSubmit() }}>
          <label>
            Event name
            <input
              name="eventName"
              required
              value={title}
              onChange={(event) => onTitleChange(event.target.value)}
              placeholder="Friday at Layla's"
            />
          </label>

          <label>
            Tagline
            <input
              name="tagline"
              value={tagline}
              onChange={(event) => onTaglineChange(event.target.value)}
              placeholder="A dinner for the ones who show up hungry."
            />
          </label>

          <label>
            Date and time
            <input
              name="dateTime"
              required
              value={dateTime}
              onChange={(event) => onDateTimeChange(event.target.value)}
              type="datetime-local"
              data-testid="date-input"
            />
          </label>

          <label>
            Location
            <HostLocationAutocomplete value={location} onChange={onLocationChange} onPlaceSelect={onPlaceSelect} />
          </label>

          <label>
            Dress code
            <input
              name="dressCode"
              value={dressCode}
              onChange={(event) => onDressCodeChange(event.target.value)}
              placeholder="A touch of red"
            />
          </label>

          <fieldset className="sv2-invitation-image-field">
            <legend>COVER IMAGE <span>OPTIONAL</span></legend>
            {imageDataUrl ? (
              <div className="sv2-upload-preview">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageDataUrl} alt="Selected cover preview" />
                <div>
                  <label className="sv2-upload-replace">
                    REPLACE
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event: ChangeEvent<HTMLInputElement>) => chooseImage(event.target.files?.[0])}
                    />
                  </label>
                  <button type="button" onClick={onImageRemove}>REMOVE</button>
                </div>
              </div>
            ) : (
              <label
                className="sv2-upload-drop"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event: DragEvent<HTMLLabelElement>) => { event.preventDefault(); chooseImage(event.dataTransfer.files?.[0]) }}
              >
                <span>＋</span>
                <strong>Choose a cover image</strong>
                <small>or drop one here · image files up to 5 MB</small>
                <input
                  aria-label="Choose cover image"
                  type="file"
                  accept="image/*"
                  onChange={(event: ChangeEvent<HTMLInputElement>) => chooseImage(event.target.files?.[0])}
                />
              </label>
            )}
          </fieldset>

          <fieldset className="sv2-theme-picker">
            <legend>THEME <span>USED IF NO COVER IMAGE</span></legend>
            <div>
              {THEMES.map((option) => (
                <label key={option.id} className="sv2-theme-card">
                  <input
                    type="radio"
                    name="theme"
                    value={option.id}
                    checked={theme === option.id}
                    onChange={() => onThemeChange(option.id)}
                  />
                  <span
                    aria-hidden="true"
                    style={{
                      background: option.bg,
                      boxShadow: theme === option.id ? `0 0 0 2px ${option.accent}` : undefined,
                    }}
                  />
                  <strong>{option.name}</strong>
                </label>
              ))}
            </div>
          </fieldset>

          {error && <p className="sv2-host-form-error" role="alert">{error}</p>}
          <button type="submit" disabled={submitting}>{submitting ? 'PUBLISHING…' : 'PUBLISH INVITE'}</button>
        </form>
      </main>
    </div>
  )
}
