'use client'

import { useState } from 'react'
import Link from 'next/link'
import { sv2Display, sv2Sans } from './fonts'
import { PreferencesReceipt } from './PreferencesReceipt'
import { CustomQuestionField, type CustomResponseValue } from './CustomQuestionField'
import type { ProteinPreference } from '@/lib/protein-preferences'
import {
  sortedQuestions,
  isCanonical,
  isCustom,
  canonicalOptionsFor,
  resolveCanonicalTitle,
  resolveCanonicalHelperText,
  resolveCanonicalOptionLabel,
  resolveCanonicalSliderMinLabel,
  resolveCanonicalSliderMaxLabel,
  generateOptionValue,
  generateQuestionId,
  DEFAULT_SLIDER_STEPS,
  MIN_SLIDER_STEPS,
  MAX_SLIDER_STEPS,
  type QuestionnaireConfig,
  type QuestionConfig,
  type CanonicalQuestionConfig,
  type CustomQuestionConfig,
  type CustomQuestionType,
} from '@/lib/questionnaire'

export interface QuestionnaireEditorProps {
  loading: boolean
  loadError: string
  backHref: string
  eventTitle: string
  config: QuestionnaireConfig
  onChange: (config: QuestionnaireConfig) => void
  onSave: () => void
  saving: boolean
  saveError: string
  validationErrors: string[]
  onReset: () => void
  resetting: boolean
}

type Mode = 'preview' | 'edit'

export function QuestionnaireEditor({
  loading,
  loadError,
  backHref,
  eventTitle,
  config,
  onChange,
  onSave,
  saving,
  saveError,
  validationErrors,
  onReset,
  resetting,
}: QuestionnaireEditorProps) {
  const [mode, setMode] = useState<Mode>('edit')

  function moveQuestion(id: string, direction: -1 | 1) {
    const sorted = sortedQuestions(config)
    const index = sorted.findIndex((q) => q.id === id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= sorted.length) return
    const reordered = [...sorted]
    ;[reordered[index], reordered[target]] = [reordered[target], reordered[index]]
    onChange({ questions: reordered.map((q, i) => ({ ...q, order: i })) })
  }

  function updateQuestion(id: string, patch: Partial<QuestionConfig>) {
    onChange({
      questions: config.questions.map((q) => (q.id === id ? ({ ...q, ...patch } as QuestionConfig) : q)),
    })
  }

  function removeQuestion(id: string) {
    onChange({ questions: config.questions.filter((q) => q.id !== id) })
  }

  function addCustomQuestion(type: CustomQuestionType) {
    const order = config.questions.length
    const base: CustomQuestionConfig = {
      id: generateQuestionId(),
      kind: 'custom',
      type,
      title: '',
      order,
      ...(type === 'single' || type === 'multiple' ? { options: [{ value: 'option_1', label: '' }] } : {}),
      ...(type === 'slider' ? { sliderMinLabel: '', sliderMaxLabel: '', sliderSteps: DEFAULT_SLIDER_STEPS } : {}),
    }
    onChange({ questions: [...config.questions, base] })
  }

  if (loading) return <p style={{ fontSize: 13, padding: 20 }}>Loading…</p>
  if (loadError) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px' }}>
        <p>{loadError}</p>
      </div>
    )
  }

  return (
    <div className={`sv2-root sv2-device-page sv2-app-page ${sv2Display.variable} ${sv2Sans.variable}`}>
      <main className="sv2-device-shell sv2-app-shell sv2-questionnaire-shell">
        <Link className="sv2-back-link" href={backHref}>← Back</Link>

        <header className="sv2-questionnaire-header">
          <h1>Questionnaire</h1>
          <p className="sv2-album-page-subtitle">{eventTitle}</p>
          <div className="sv2-questionnaire-mode-toggle" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'preview'}
              className={mode === 'preview' ? 'sv2-mode-active' : ''}
              onClick={() => setMode('preview')}
            >
              PREVIEW
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'edit'}
              className={mode === 'edit' ? 'sv2-mode-active' : ''}
              onClick={() => setMode('edit')}
            >
              EDIT
            </button>
          </div>
        </header>

        {mode === 'preview' ? (
          <QuestionnairePreview config={config} />
        ) : (
          <div className="sv2-questionnaire-editor">
            <button type="button" className="sv2-reset-questionnaire" onClick={onReset} disabled={resetting}>
              {resetting ? 'RESETTING…' : 'RESET TO SOFRA DEFAULTS'}
            </button>

            {sortedQuestions(config).map((q, i, arr) => (
              <div key={q.id} className="sv2-question-card">
                <div className="sv2-question-card-head">
                  <span className="sv2-question-number">Question {i + 1}</span>
                  <div className="sv2-question-move">
                    <button type="button" aria-label={`Move "${questionLabel(q)}" up`} disabled={i === 0} onClick={() => moveQuestion(q.id, -1)}>↑</button>
                    <button type="button" aria-label={`Move "${questionLabel(q)}" down`} disabled={i === arr.length - 1} onClick={() => moveQuestion(q.id, 1)}>↓</button>
                  </div>
                </div>

                {isCanonical(q) ? (
                  <CanonicalQuestionCard question={q} onUpdate={(patch) => updateQuestion(q.id, patch)} />
                ) : (
                  <CustomQuestionCard
                    question={q}
                    onUpdate={(patch) => updateQuestion(q.id, patch)}
                    onRemove={() => removeQuestion(q.id)}
                  />
                )}
              </div>
            ))}

            <div className="sv2-add-question">
              <span>+ ADD QUESTION</span>
              <div className="sv2-add-question-types">
                <button type="button" onClick={() => addCustomQuestion('single')}>Single choice</button>
                <button type="button" onClick={() => addCustomQuestion('multiple')}>Multiple choice</button>
                <button type="button" onClick={() => addCustomQuestion('text')}>Short text</button>
                <button type="button" onClick={() => addCustomQuestion('slider')}>Slider</button>
              </div>
            </div>

            {validationErrors.length > 0 && (
              <ul className="sv2-questionnaire-errors" role="alert">
                {validationErrors.map((msg) => (
                  <li key={msg}>{msg}</li>
                ))}
              </ul>
            )}
            {saveError && <p className="sv2-hint" role="alert">{saveError}</p>}

            <button type="button" className="sv2-save-btn" onClick={onSave} disabled={saving}>
              {saving ? 'SAVING…' : 'SAVE QUESTIONNAIRE'}
            </button>
          </div>
        )}
      </main>
    </div>
  )
}

function questionLabel(q: QuestionConfig): string {
  return isCanonical(q) ? resolveCanonicalTitle(q) : q.title || 'Untitled question'
}

function CanonicalQuestionCard({
  question,
  onUpdate,
}: {
  question: CanonicalQuestionConfig
  onUpdate: (patch: Partial<CanonicalQuestionConfig>) => void
}) {
  const options = canonicalOptionsFor(question.canonicalKey)
  return (
    <div>
      <span className="sv2-question-kind">Sofra question</span>
      <label className="sv2-question-field">
        Question title
        <input
          value={question.title ?? ''}
          placeholder={resolveCanonicalTitle(question)}
          onChange={(e) => onUpdate({ title: e.target.value })}
        />
      </label>
      {question.canonicalKey !== 'dietary' && question.canonicalKey !== 'avoid' && (
        <label className="sv2-question-field">
          Helper text
          <input
            value={question.helperText ?? ''}
            placeholder={resolveCanonicalHelperText(question) ?? ''}
            onChange={(e) => onUpdate({ helperText: e.target.value })}
          />
        </label>
      )}
      {options.length > 0 && (
        <div className="sv2-question-options">
          <span className="sv2-question-options-label">Answers</span>
          {options.map((opt) => (
            <div key={opt.value} className="sv2-canonical-option">
              <input
                aria-label={`Display label for ${opt.label}`}
                value={question.optionLabels?.[opt.value] ?? ''}
                placeholder={opt.label}
                onChange={(e) =>
                  onUpdate({
                    optionLabels: { ...question.optionLabels, [opt.value]: e.target.value },
                  })
                }
              />
            </div>
          ))}
        </div>
      )}
      {question.canonicalKey === 'adventurousness' && (
        <div className="sv2-question-options">
          <span className="sv2-question-options-label">Slider labels</span>
          <div className="sv2-slider-label-fields">
            <label className="sv2-question-field">
              Low end
              <input
                value={question.sliderMinLabel ?? ''}
                placeholder={resolveCanonicalSliderMinLabel(question)}
                onChange={(e) => onUpdate({ sliderMinLabel: e.target.value })}
              />
            </label>
            <label className="sv2-question-field">
              High end
              <input
                value={question.sliderMaxLabel ?? ''}
                placeholder={resolveCanonicalSliderMaxLabel(question)}
                onChange={(e) => onUpdate({ sliderMaxLabel: e.target.value })}
              />
            </label>
          </div>
          <div className="sv2-slider-mini-preview">
            <input type="range" min={0} max={100} defaultValue={50} aria-label="Slider preview" disabled className="sv2-slider" />
            <div className="sv2-slider-labels">
              <span>{question.sliderMinLabel?.trim() || resolveCanonicalSliderMinLabel(question)}</span>
              <span>{question.sliderMaxLabel?.trim() || resolveCanonicalSliderMaxLabel(question)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function CustomQuestionCard({
  question,
  onUpdate,
  onRemove,
}: {
  question: CustomQuestionConfig
  onUpdate: (patch: Partial<CustomQuestionConfig>) => void
  onRemove: () => void
}) {
  const options = question.options ?? []

  function updateOption(index: number, label: string) {
    const next = options.map((o, i) => (i === index ? { ...o, label } : o))
    onUpdate({ options: next })
  }

  function addOption() {
    const value = generateOptionValue(`option ${options.length + 1}`, options)
    onUpdate({ options: [...options, { value, label: '' }] })
  }

  function removeOption(index: number) {
    onUpdate({ options: options.filter((_, i) => i !== index) })
  }

  function moveOption(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= options.length) return
    const next = [...options]
    ;[next[index], next[target]] = [next[target], next[index]]
    onUpdate({ options: next })
  }

  return (
    <div>
      <div className="sv2-question-card-headrow">
        <span className="sv2-question-kind">
          Custom ·{' '}
          {question.type === 'single'
            ? 'Single choice'
            : question.type === 'multiple'
              ? 'Multiple choice'
              : question.type === 'slider'
                ? 'Slider'
                : 'Short text'}
        </span>
        <button type="button" className="sv2-remove-question" onClick={onRemove}>REMOVE</button>
      </div>
      <label className="sv2-question-field">
        Question title
        <input
          value={question.title}
          placeholder="Ask your guests something…"
          onChange={(e) => onUpdate({ title: e.target.value })}
        />
      </label>
      <label className="sv2-question-field">
        Helper text (optional)
        <input
          value={question.helperText ?? ''}
          onChange={(e) => onUpdate({ helperText: e.target.value })}
        />
      </label>

      {(question.type === 'single' || question.type === 'multiple') && (
        <div className="sv2-question-options">
          <span className="sv2-question-options-label">Answers</span>
          {options.map((opt, i) => (
            <div key={opt.value} className="sv2-custom-option-row">
              <input
                aria-label={`Option ${i + 1}`}
                value={opt.label}
                placeholder={`Option ${i + 1}`}
                onChange={(e) => updateOption(i, e.target.value)}
              />
              <button type="button" aria-label="Move option up" disabled={i === 0} onClick={() => moveOption(i, -1)}>↑</button>
              <button type="button" aria-label="Move option down" disabled={i === options.length - 1} onClick={() => moveOption(i, 1)}>↓</button>
              <button type="button" aria-label={`Remove option ${i + 1}`} onClick={() => removeOption(i)}>✕</button>
            </div>
          ))}
          <button type="button" className="sv2-add-option" onClick={addOption}>+ ADD OPTION</button>
        </div>
      )}

      {question.type === 'slider' && (
        <div className="sv2-question-options">
          <span className="sv2-question-options-label">Slider</span>
          <div className="sv2-slider-label-fields">
            <label className="sv2-question-field">
              Low end label
              <input
                value={question.sliderMinLabel ?? ''}
                placeholder="e.g. Keep it familiar"
                onChange={(e) => onUpdate({ sliderMinLabel: e.target.value })}
              />
            </label>
            <label className="sv2-question-field">
              High end label
              <input
                value={question.sliderMaxLabel ?? ''}
                placeholder="e.g. Surprise me"
                onChange={(e) => onUpdate({ sliderMaxLabel: e.target.value })}
              />
            </label>
          </div>
          <label className="sv2-question-field sv2-max-selections">
            Number of steps
            <input
              type="number"
              min={MIN_SLIDER_STEPS}
              max={MAX_SLIDER_STEPS}
              value={question.sliderSteps ?? DEFAULT_SLIDER_STEPS}
              onChange={(e) =>
                onUpdate({
                  sliderSteps: Math.min(
                    MAX_SLIDER_STEPS,
                    Math.max(MIN_SLIDER_STEPS, Number(e.target.value) || DEFAULT_SLIDER_STEPS)
                  ),
                })
              }
            />
          </label>
          <div className="sv2-slider-mini-preview">
            <input
              type="range"
              min={1}
              max={question.sliderSteps ?? DEFAULT_SLIDER_STEPS}
              defaultValue={Math.ceil(((question.sliderSteps ?? DEFAULT_SLIDER_STEPS) + 1) / 2)}
              aria-label="Slider preview"
              disabled
              className="sv2-slider"
            />
            <div className="sv2-slider-labels">
              <span>{question.sliderMinLabel}</span>
              <span>{question.sliderMaxLabel}</span>
            </div>
          </div>
        </div>
      )}

      {question.type === 'multiple' && (
        <label className="sv2-question-field sv2-max-selections">
          Max selections
          <input
            type="number"
            min={1}
            max={Math.max(1, options.length)}
            value={question.maxSelections ?? options.length}
            onChange={(e) => onUpdate({ maxSelections: Number(e.target.value) || 1 })}
          />
        </label>
      )}
    </div>
  )
}

// Fully interactive but purely local -- nothing here is ever persisted. Lets
// the host click through the questionnaire exactly as a guest would see it.
function QuestionnairePreview({ config }: { config: QuestionnaireConfig }) {
  const [dietary, setDietary] = useState<string[]>([])
  const [avoid, setAvoid] = useState<string[]>([])
  const [proteinPreferences, setProteinPreferences] = useState<ProteinPreference[]>([])
  const [flavors, setFlavors] = useState<string[]>([])
  const [adventurousness, setAdventurousness] = useState(50)
  const [customAnswers, setCustomAnswers] = useState<Record<string, CustomResponseValue>>({})

  function toggle<T extends string>(arr: T[], setArr: (v: T[]) => void, value: T) {
    setArr(arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value])
  }

  const canonical = sortedQuestions(config).filter(isCanonical)
  const custom = sortedQuestions(config).filter(isCustom)

  const byKey = Object.fromEntries(canonical.map((q) => [q.canonicalKey, q])) as Record<string, CanonicalQuestionConfig>

  return (
    <div className="sv2-questionnaire-preview">
      <p className="sv2-questionnaire-preview-note">This is a live preview with nothing here saved.</p>
      <PreferencesReceipt
        dietary={dietary}
        onToggleDietary={(v) => toggle(dietary, setDietary, v)}
        onSelectNoDietaryRestriction={() => setDietary([])}
        avoid={avoid}
        onToggleAvoid={(v) => toggle(avoid, setAvoid, v)}
        proteinPreferences={proteinPreferences}
        onToggleProtein={(v) => toggle(proteinPreferences, setProteinPreferences, v)}
        proteinHintVisible={false}
        flavors={flavors}
        onToggleFlavor={(v) => toggle(flavors, setFlavors, v)}
        flavorHintVisible={false}
        adventurousness={adventurousness}
        onAdventurousnessChange={setAdventurousness}
        onSave={() => {}}
        saveLabel="SAVE MY SEAT"
        dietaryTitle={byKey.dietary ? resolveCanonicalTitle(byKey.dietary) : undefined}
        dietaryOptionLabels={byKey.dietary ? optionLabelMap(byKey.dietary) : undefined}
        avoidTitle={byKey.avoid ? resolveCanonicalTitle(byKey.avoid) : undefined}
        avoidOptionLabels={byKey.avoid ? optionLabelMap(byKey.avoid) : undefined}
        proteinTitle={byKey.protein ? resolveCanonicalTitle(byKey.protein) : undefined}
        proteinHelperText={byKey.protein ? resolveCanonicalHelperText(byKey.protein) : undefined}
        proteinOptionLabels={byKey.protein ? optionLabelMap(byKey.protein) : undefined}
        flavorTitle={byKey.flavor ? resolveCanonicalTitle(byKey.flavor) : undefined}
        flavorHelperText={byKey.flavor ? resolveCanonicalHelperText(byKey.flavor) : undefined}
        flavorOptionLabels={byKey.flavor ? optionLabelMap(byKey.flavor) : undefined}
        adventurousnessTitle={byKey.adventurousness ? resolveCanonicalTitle(byKey.adventurousness) : undefined}
        adventurousnessHelperText={byKey.adventurousness ? resolveCanonicalHelperText(byKey.adventurousness) : undefined}
        adventurousnessMinLabel={byKey.adventurousness ? resolveCanonicalSliderMinLabel(byKey.adventurousness) : undefined}
        adventurousnessMaxLabel={byKey.adventurousness ? resolveCanonicalSliderMaxLabel(byKey.adventurousness) : undefined}
        extraContent={
          custom.length > 0 ? (
            <>
              {custom.map((q) => (
                <div key={q.id} style={{ marginTop: 8 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/design-preview/divider-line.svg" alt="" className="sv2-divider" />
                  <CustomQuestionField
                    question={q}
                    value={customAnswers[q.id]}
                    onChange={(value) => setCustomAnswers((c) => ({ ...c, [q.id]: value }))}
                  />
                </div>
              ))}
            </>
          ) : undefined
        }
      />
    </div>
  )
}

function optionLabelMap(q: CanonicalQuestionConfig): Record<string, string> {
  const options = canonicalOptionsFor(q.canonicalKey)
  return Object.fromEntries(
    options.map((opt) => [opt.value, resolveCanonicalOptionLabel(q, opt.value, opt.label)])
  )
}
