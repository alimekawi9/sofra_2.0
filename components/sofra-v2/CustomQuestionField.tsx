'use client'

import { useState } from 'react'
import { DEFAULT_SLIDER_STEPS, type CustomQuestionConfig } from '@/lib/questionnaire'

export type CustomResponseValue = string | string[] | number

export interface CustomQuestionFieldProps {
  question: CustomQuestionConfig
  value: CustomResponseValue | undefined
  onChange: (value: CustomResponseValue) => void
}

function OptionRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="sv2-checkbox-row">
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span className="sv2-checkbox-box" aria-hidden="true" />
      {label}
    </label>
  )
}

export function CustomQuestionField({ question, value, onChange }: CustomQuestionFieldProps) {
  const [maxHint, setMaxHint] = useState(false)

  if (question.type === 'text') {
    const text = typeof value === 'string' ? value : ''
    return (
      <section>
        <h3 className="sv2-section-label">{question.title}</h3>
        {question.helperText && <p className="sv2-section-sub">{question.helperText}</p>}
        <textarea
          className="sv2-custom-text"
          aria-label={question.title}
          value={text}
          maxLength={500}
          onChange={(e) => onChange(e.target.value)}
        />
      </section>
    )
  }

  if (question.type === 'slider') {
    const steps = question.sliderSteps ?? DEFAULT_SLIDER_STEPS
    const position = typeof value === 'number' ? value : Math.ceil((steps + 1) / 2)
    return (
      <section>
        <h3 className="sv2-section-label">{question.title}</h3>
        {question.helperText && <p className="sv2-section-sub">{question.helperText}</p>}
        <input
          type="range"
          min={1}
          max={steps}
          step={1}
          value={position}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label={question.title}
          className="sv2-slider"
        />
        <div className="sv2-slider-labels">
          <span>{question.sliderMinLabel}</span>
          <span>{question.sliderMaxLabel}</span>
        </div>
      </section>
    )
  }

  const options = question.options ?? []
  const selected = Array.isArray(value) ? value : typeof value === 'string' ? [value] : []

  if (question.type === 'single') {
    return (
      <section>
        <h3 className="sv2-section-label">{question.title}</h3>
        {question.helperText && <p className="sv2-section-sub">{question.helperText}</p>}
        <div className="sv2-checkbox-grid">
          {options.map((opt) => (
            <OptionRow
              key={opt.value}
              label={opt.label}
              checked={selected.includes(opt.value)}
              onChange={() => onChange(opt.value)}
            />
          ))}
        </div>
      </section>
    )
  }

  const max = question.maxSelections ?? options.length

  function toggleMultiple(optionValue: string) {
    if (selected.includes(optionValue)) {
      onChange(selected.filter((v) => v !== optionValue))
      return
    }
    if (selected.length >= max) {
      setMaxHint(true)
      setTimeout(() => setMaxHint(false), 2000)
      return
    }
    onChange([...selected, optionValue])
  }

  return (
    <section>
      <h3 className="sv2-section-label">{question.title}</h3>
      {question.helperText && <p className="sv2-section-sub">{question.helperText}</p>}
      <div className="sv2-checkbox-grid">
        {options.map((opt) => (
          <OptionRow
            key={opt.value}
            label={opt.label}
            checked={selected.includes(opt.value)}
            onChange={() => toggleMultiple(opt.value)}
          />
        ))}
      </div>
      {maxHint && (
        <p className="sv2-hint">
          Choose up to {max} — tap one to swap it out.
        </p>
      )}
    </section>
  )
}
