'use client'

import Image from 'next/image'
import type { FormEvent } from 'react'
import { sv2Display, sv2Sans } from './fonts'

export interface NamePlateFormProps {
  name: string
  onNameChange: (value: string) => void
  onSubmit: () => void
  isSubmitting?: boolean
}

export function NamePlateForm({ name, onNameChange, onSubmit, isSubmitting = false }: NamePlateFormProps) {
  const submitDisabled = name.trim() === '' || isSubmitting

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!submitDisabled) onSubmit()
  }

  return (
    <div className={`sv2-root sv2-device-page sv2-welcome-page sv2-plate-step-page ${sv2Display.variable} ${sv2Sans.variable}`}>
      <form className="sv2-device-shell sv2-welcome-card sv2-plate-step sv2-receipt-surface" onSubmit={handleSubmit}>
        <h1 className="sv2-plate-heading">
          <span>Enter your</span>
          <span>name</span>
        </h1>

        <div className="sv2-plate-wrap sv2-plate-wrap--silver">
          <Image className="sv2-plate-image" src="/design-preview/silver-plate.png" alt="" aria-hidden="true" width={1254} height={1254} priority />
          <div className="sv2-plate-bowl">
            <label className="sv2-visually-hidden" htmlFor="sv2-name">Your name</label>
            <input id="sv2-name" className="sv2-plate-input" type="text" value={name} placeholder="e.g. Alia" onChange={(event) => onNameChange(event.target.value)} autoComplete="name" />
          </div>
        </div>

        <button type="submit" className="sv2-yalla-btn sv2-plate-action" disabled={submitDisabled}>
          {isSubmitting ? 'ENTERING…' : 'CONTINUE'}
        </button>
      </form>
    </div>
  )
}
