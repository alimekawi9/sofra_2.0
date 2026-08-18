'use client'

import type { ChangeEvent, DragEvent } from 'react'
import { HostLocationAutocomplete, type PreviewPlace } from './HostLocationAutocomplete'
import { sv2Display, sv2Sans } from './fonts'

export interface HostCreateFormProps {
  mode?: 'create' | 'edit'
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
  imageDataUrl: string | undefined
  onImageChange: (file: File) => void
  onImageRemove: () => void
  submitting: boolean
  error: string
  onSubmit: () => void
  onDelete?: () => void
  deleting?: boolean
  onCustomizeQuestions?: () => void
  customizingQuestions?: boolean
  kitchenPlan?: 'now' | 'later' | 'chef'
  onKitchenPlanChange?: (value: 'now' | 'later' | 'chef') => void
}

export function HostCreateForm({
  mode = 'create',
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
  imageDataUrl,
  onImageChange,
  onImageRemove,
  submitting,
  error,
  onSubmit,
  onDelete,
  deleting = false,
  onCustomizeQuestions,
  customizingQuestions = false,
  kitchenPlan = 'now',
  onKitchenPlanChange,
}: HostCreateFormProps) {
  function chooseImage(file?: File) {
    if (file) onImageChange(file)
  }

  const isEdit = mode === 'edit'

  return (
    <div className={`sv2-root sv2-device-page sv2-app-page ${sv2Display.variable} ${sv2Sans.variable}`}>
      <main className="sv2-device-shell sv2-app-shell sv2-host-shell">
        <p className="sv2-event-kicker">{isEdit ? 'EDIT YOUR GATHERING' : 'HOST A GATHERING'}</p>
        <h1>{isEdit ? 'Edit your Sofra' : 'Create a Sofra'}</h1>
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
              required={dateTime !== 'undecided'}
              value={dateTime}
              onChange={(event) => onDateTimeChange(event.target.value)}
              type="datetime-local"
              disabled={dateTime === 'undecided'}
              data-testid="date-input"
            />
            <span className="sv2-date-undecided-option">
              <input aria-label="Date undecided" type="checkbox" checked={dateTime === 'undecided'} onChange={(event) => onDateTimeChange(event.target.checked ? 'undecided' : '')} />
              Date undecided
            </span>
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
              placeholder="A touch of red, or paste a Pinterest link"
            />
          </label>

          {onCustomizeQuestions && (
            <>
              <button
                type="button"
                className="sv2-customize-questions"
                onClick={onCustomizeQuestions}
                disabled={submitting || deleting || customizingQuestions}
              >
                {customizingQuestions ? 'OPENING…' : 'CUSTOMIZE GUEST QUESTIONS'}
              </button>
              {error && <p className="sv2-host-form-error" role="alert">{error}</p>}
            </>
          )}

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

          {!isEdit && onKitchenPlanChange && (
            <fieldset className="sv2-kitchen-plan-field">
              <legend>KITCHEN SETUP</legend>
              <p>The kitchen can be completed now, later, or by someone cooking with you.</p>
              <div>
                {([
                  ['later', 'FILL IN LATER'],
                  ['now', 'FILL KITCHEN NOW'],
                  ['chef', 'SEND TO A CHEF'],
                ] as const).map(([value, label]) => (
                  <button key={value} type="button" aria-pressed={kitchenPlan === value} onClick={() => onKitchenPlanChange(value)}>
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          {!onCustomizeQuestions && error && <p className="sv2-host-form-error" role="alert">{error}</p>}
          <button type="submit" disabled={submitting || deleting}>
            {submitting ? (isEdit ? 'SAVING…' : 'CONTINUING…') : isEdit ? 'UPDATE INVITE' : 'CONTINUE'}
          </button>
        </form>

        {isEdit && onDelete && (
          <button
            type="button"
            className="sv2-delete-event"
            onClick={onDelete}
            disabled={submitting || deleting}
          >
            {deleting ? 'DELETING…' : 'DELETE EVENT'}
          </button>
        )}
      </main>
    </div>
  )
}
