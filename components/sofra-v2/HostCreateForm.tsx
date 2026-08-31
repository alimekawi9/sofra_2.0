'use client'

import { useState, type ChangeEvent, type DragEvent } from 'react'
import { HostLocationAutocomplete, type PreviewPlace } from './HostLocationAutocomplete'
import { sv2Display, sv2Sans } from './fonts'
import { ImageCropDialog } from './ImageCropDialog'
import type { CustomDetailSection } from '@/lib/event-custom-details'
import type { TbdSuggestion } from '@/lib/event-tbd-suggestions'
import { DEFAULT_QUESTIONNAIRE, isCanonical, resolveCanonicalTitle, sortedQuestions } from '@/lib/questionnaire'

export type NewEventQuestionChoice = 'default' | 'custom' | 'none'

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
  customDetails: CustomDetailSection[]
  onAddCustomDetail: () => void
  onCustomDetailChange: (id: string, patch: Partial<Pick<CustomDetailSection, 'label' | 'body'>>) => void
  onRemoveCustomDetail: (id: string) => void
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
  kitchenPlan?: 'now' | 'later' | 'chef' | null
  onKitchenPlanChange?: (value: 'now' | 'later' | 'chef') => void
  questionChoice?: NewEventQuestionChoice
  onQuestionChoiceChange?: (value: NewEventQuestionChoice) => void
  dateSuggestion?: TbdSuggestion
  onUseDateSuggestion?: () => void
  locationSuggestion?: TbdSuggestion
  onUseLocationSuggestion?: () => void
  estimatedGuestCount?: string
  onEstimatedGuestCountChange?: (value: string) => void
  budgetAmount?: string
  onBudgetAmountChange?: (value: string) => void
  budgetCurrency?: string
  onBudgetCurrencyChange?: (value: string) => void
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
  customDetails,
  onAddCustomDetail,
  onCustomDetailChange,
  onRemoveCustomDetail,
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
  kitchenPlan = null,
  onKitchenPlanChange,
  questionChoice = 'default',
  onQuestionChoiceChange,
  dateSuggestion,
  onUseDateSuggestion,
  locationSuggestion,
  onUseLocationSuggestion,
  estimatedGuestCount = '',
  onEstimatedGuestCountChange,
  budgetAmount = '',
  onBudgetAmountChange,
  budgetCurrency = 'USD',
  onBudgetCurrencyChange,
}: HostCreateFormProps) {
  const [pendingCover, setPendingCover] = useState<File | null>(null)
  const [createStep, setCreateStep] = useState(0)

  function chooseImage(file?: File) {
    if (file) setPendingCover(file)
  }

  const isEdit = mode === 'edit'
  const createSteps = ['Details', 'Look', 'Guest questions', 'Kitchen']

  function advanceCreateStep() {
    if (createStep === 0 && (!title.trim() || !dateTime || !location.trim())) {
      onSubmit()
      return
    }
    setCreateStep((current) => Math.min(current + 1, createSteps.length - 1))
  }

  function retreatCreateStep() {
    setCreateStep((current) => Math.max(current - 1, 0))
  }

  return (
    <div className={`sv2-root sv2-device-page sv2-app-page ${sv2Display.variable} ${sv2Sans.variable}`}>
      <main className="sv2-device-shell sv2-app-shell sv2-host-shell">
        <p className="sv2-event-kicker">{isEdit ? 'EDIT YOUR GATHERING' : 'HOST A GATHERING'}</p>
        <h1>{isEdit ? 'Edit your Sofra' : 'Create a Sofra'}</h1>
        {!isEdit && (
          <nav className="sv2-create-progress" aria-label="Sofra creation progress">
            <div className="sv2-create-progress-copy">
              <span>STEP {createStep + 1} OF {createSteps.length}</span>
              <strong>{createSteps[createStep]}</strong>
            </div>
            <div className="sv2-create-progress-track" aria-hidden="true">
              {createSteps.map((step, index) => <span key={step} className={index <= createStep ? 'is-complete' : ''} />)}
            </div>
          </nav>
        )}
        <form noValidate onSubmit={(event) => {
          event.preventDefault()
          // An Enter keypress in any step's input fires this the same as a
          // click would. Only the final step (or edit mode) should actually
          // submit — otherwise this must advance one step, exactly like
          // CONTINUE, so a stray Enter can never skip the Kitchen step.
          if (isEdit || createStep === createSteps.length - 1) { onSubmit(); return }
          advanceCreateStep()
        }}>

          {(isEdit || createStep === 0) && <section className="sv2-create-step">
          {!isEdit && <><h2>Start with the essentials</h2><p className="sv2-create-step-intro">Tell guests when and where to meet you. You can refine everything later.</p></>}
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

          <label id="concept">
            Tagline
            <input
              name="tagline"
              value={tagline}
              onChange={(event) => onTaglineChange(event.target.value)}
              placeholder="A dinner for the ones who show up hungry."
            />
          </label>

          <label id="date-time">
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
            {dateSuggestion && (
              <p className="sv2-tbd-suggestion">
                Guests picked <strong>{dateSuggestion.value}</strong> in &quot;{dateSuggestion.sourceQuestionTitle}&quot; ({dateSuggestion.responseCount} responses).
                {onUseDateSuggestion && (
                  <button type="button" onClick={onUseDateSuggestion}>Set the date to enter it</button>
                )}
              </p>
            )}
          </label>

          <label id="location">
            Location
            <HostLocationAutocomplete value={location === 'undecided' ? '' : location} onChange={onLocationChange} onPlaceSelect={onPlaceSelect} disabled={location === 'undecided'} />
            {!isEdit && <span className="sv2-date-undecided-option">
              <input aria-label="Location undecided" type="checkbox" checked={location === 'undecided'} onChange={(event) => { onPlaceSelect(null); onLocationChange(event.target.checked ? 'undecided' : '') }} />
              Location undecided
            </span>}
            {locationSuggestion && (
              <p className="sv2-tbd-suggestion">
                Suggested: {locationSuggestion.value} · from {locationSuggestion.responseCount} responses to &quot;{locationSuggestion.sourceQuestionTitle}&quot;
                {onUseLocationSuggestion && (
                  <button type="button" onClick={onUseLocationSuggestion}>Use this</button>
                )}
              </p>
            )}
          </label>

          {isEdit && onEstimatedGuestCountChange && onBudgetAmountChange && onBudgetCurrencyChange && (
            <fieldset id="prep-estimates" className="sv2-prep-estimates-field">
              <legend>PREP ESTIMATES</legend>
              <p>Private planning numbers for the host and co-hosts.</p>
              <div>
                <label>Estimated guests<input type="number" min="1" inputMode="numeric" value={estimatedGuestCount} onChange={(event) => onEstimatedGuestCountChange(event.target.value)} placeholder="12" /></label>
                <label>Budget<div><select aria-label="Budget currency" value={budgetCurrency} onChange={(event) => onBudgetCurrencyChange(event.target.value)}><option>USD</option><option>EGP</option><option>GBP</option><option>EUR</option><option>AED</option><option>SAR</option></select><input aria-label="Budget amount" type="number" min="1" step="0.01" inputMode="decimal" value={budgetAmount} onChange={(event) => onBudgetAmountChange(event.target.value)} placeholder="500" /></div></label>
              </div>
            </fieldset>
          )}

          <label>
            Dress code
            <input
              name="dressCode"
              value={dressCode}
              onChange={(event) => onDressCodeChange(event.target.value)}
              placeholder="A touch of red, or paste a Pinterest link"
            />
          </label>

          <fieldset className="sv2-custom-details-field">
            <legend>ADDITIONAL DETAILS <span>OPTIONAL</span></legend>
            {customDetails.map((section) => (
              <div key={section.id} className="sv2-question-card">
                <div className="sv2-question-card-headrow">
                  <span className="sv2-question-kind">Detail section</span>
                  <button
                    type="button"
                    aria-label={`Remove ${section.label || 'detail section'}`}
                    className="sv2-remove-question"
                    onClick={() => onRemoveCustomDetail(section.id)}
                  >
                    REMOVE
                  </button>
                </div>
                <label>
                  Section label
                  <input
                    value={section.label}
                    onChange={(event) => onCustomDetailChange(section.id, { label: event.target.value })}
                    placeholder="e.g. Parking"
                  />
                </label>
                <label>
                  Details
                  <textarea
                    value={section.body}
                    onChange={(event) => onCustomDetailChange(section.id, { body: event.target.value })}
                    placeholder="e.g. Free lot behind the theater"
                  />
                </label>
              </div>
            ))}
            <button type="button" className="sv2-add-detail-section" onClick={onAddCustomDetail}>
              + ADD DETAIL SECTION
            </button>
          </fieldset>
          </section>}

          {isEdit && onCustomizeQuestions && (
            <>
              <button
                type="button"
                className="sv2-customize-questions"
                onClick={onCustomizeQuestions}
                disabled={submitting || deleting || customizingQuestions}
              >
                {customizingQuestions ? 'OPENING…' : 'CUSTOMIZE GUEST QUESTIONS'}
              </button>
            </>
          )}

          {(isEdit || createStep === 1) && <section className="sv2-create-step">
          {!isEdit && <><h2>Set the look</h2><p className="sv2-create-step-intro">Choose the image guests will see on the invitation. This is optional.</p></>}
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
                      onChange={(event: ChangeEvent<HTMLInputElement>) => {
                        chooseImage(event.target.files?.[0])
                        event.target.value = ''
                      }}
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
                  onChange={(event: ChangeEvent<HTMLInputElement>) => {
                    chooseImage(event.target.files?.[0])
                    event.target.value = ''
                  }}
                />
              </label>
            )}
          </fieldset>
          </section>}

          {!isEdit && createStep === 2 && (
            <section className="sv2-create-step sv2-question-choice-step">
              <h2>What should guests answer?</h2>
              <p className="sv2-create-step-intro">Sofra has a curated set ready to use, but the questionnaire is entirely yours.</p>
              <div className="sv2-question-choice-grid">
                <button type="button" className="sv2-question-choice-card" aria-pressed={questionChoice === 'default'} onClick={() => onQuestionChoiceChange?.('default')}>
                  <span className="sv2-choice-eyebrow">RECOMMENDED</span>
                  <strong>Use Sofra&apos;s questions</strong>
                  <small>Five questions curated to help plan a table everyone can enjoy.</small>
                  <span className="sv2-question-preview">
                    {sortedQuestions(DEFAULT_QUESTIONNAIRE).slice(0, 3).map((question) => <span key={question.id}>{isCanonical(question) ? resolveCanonicalTitle(question) : question.title}</span>)}
                    <em>+ 2 more</em>
                  </span>
                </button>
                <button type="button" className="sv2-question-choice-card" aria-pressed={questionChoice === 'custom'} onClick={() => onQuestionChoiceChange?.('custom')}>
                  <span className="sv2-choice-eyebrow">MAKE IT YOURS</span>
                  <strong>Customize the questions</strong>
                  <small>Edit wording and answers, remove questions, or add your own in the full editor.</small>
                </button>
                <button type="button" className="sv2-question-choice-card" aria-pressed={questionChoice === 'none'} onClick={() => onQuestionChoiceChange?.('none')}>
                  <span className="sv2-choice-eyebrow">SKIP THE SURVEY</span>
                  <strong>Don&apos;t include questions</strong>
                  <small>Guests will RSVP without completing food or event questions.</small>
                </button>
              </div>
            </section>
          )}

          {!isEdit && createStep === 3 && onKitchenPlanChange && (
            <section className="sv2-create-step">
            <h2>Plan the kitchen</h2>
            <p className="sv2-create-step-intro">Choose what happens after your Sofra is created.</p>
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
            </section>
          )}

          {isEdit && <button type="submit" disabled={submitting || deleting}>
            {submitting ? (isEdit ? 'SAVING…' : 'CONTINUING…') : isEdit ? 'UPDATE INVITE' : 'CONTINUE'}
          </button>}
          {!isEdit && (
            <div className="sv2-create-step-actions">
              {createStep > 0 && <button type="button" className="sv2-create-back" onClick={retreatCreateStep}>BACK</button>}
              {createStep < createSteps.length - 1
                ? <button type="button" onClick={advanceCreateStep}>CONTINUE</button>
                : <button type="submit" disabled={submitting || !kitchenPlan}>{submitting ? 'CREATING…' : 'CREATE MY SOFRA'}</button>}
            </div>
          )}
          {error && <p className="sv2-host-form-error" role="alert">{error}</p>}
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
      {pendingCover && (
        <ImageCropDialog
          file={pendingCover}
          title="Crop your Sofra cover"
          aspectRatio={16 / 9}
          outputWidth={1600}
          outputHeight={900}
          onCancel={() => setPendingCover(null)}
          onConfirm={(croppedFile) => {
            setPendingCover(null)
            onImageChange(croppedFile)
          }}
        />
      )}
    </div>
  )
}
