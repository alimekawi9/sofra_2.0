'use client'

import Image from 'next/image'
import type { FormEvent } from 'react'
import { sv2Display, sv2Sans } from './fonts'

export interface SignupFormProps {
  phone: string
  onPhoneChange: (value: string) => void
  onSubmit: () => void
  isSubmitting?: boolean
}

export function SignupForm({ phone, onPhoneChange, onSubmit, isSubmitting = false }: SignupFormProps) {
  const submitDisabled = phone.trim() === '' || isSubmitting

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!submitDisabled) onSubmit()
  }

  return (
    <div className={`sv2-root sv2-welcome-page ${sv2Display.variable} ${sv2Sans.variable}`}>
      <form className="sv2-welcome-card" onSubmit={handleSubmit}>
        <div className="sv2-welcome-hairline" aria-hidden="true" />
        <p className="sv2-eyebrow">EST. 2026</p>
        <p className="sv2-welcome-title">Sofra.</p>
        <p className="sv2-signup-sub">No passwords. We only need a number to remember your seat.</p>

        <div className="sv2-plate-field sv2-plate-field--burgundy">
          <Image className="sv2-plate-art" src="/design-preview/burgundy-plate.png" alt="" aria-hidden="true" width={1254} height={1254} priority />
          <label className="sv2-visually-hidden" htmlFor="sv2-signup-phone">Phone number</label>
          <input id="sv2-signup-phone" className="sv2-plate-input" type="tel" value={phone} placeholder="PHONE NUMBER" onChange={(event) => onPhoneChange(event.target.value)} autoComplete="tel" inputMode="tel" />
        </div>

        <button type="submit" className="sv2-yalla-btn" disabled={submitDisabled}>
          {isSubmitting ? 'ENTERING…' : 'YALLA'}
        </button>
      </form>
    </div>
  )
}
