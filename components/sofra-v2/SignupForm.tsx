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
    <div className={`sv2-root sv2-welcome-page sv2-phone-page ${sv2Display.variable} ${sv2Sans.variable}`}>
      <form className="sv2-welcome-card sv2-phone-card" onSubmit={handleSubmit}>
        <div className="sv2-welcome-hairline" aria-hidden="true" />
        <h1 className="sv2-phone-heading">Enter your phone number</h1>

        <div className="sv2-plate-field sv2-plate-field--burgundy sv2-phone-plate" data-testid="phone-plate">
          <Image className="sv2-plate-art" src="/design-preview/burgundy-plate.png" alt="" aria-hidden="true" width={1254} height={1254} priority />
          <label className="sv2-visually-hidden" htmlFor="sv2-signup-phone">Phone number</label>
          <input id="sv2-signup-phone" className="sv2-plate-input" type="tel" value={phone} placeholder="_ _ _ _" onChange={(event) => onPhoneChange(event.target.value)} autoComplete="tel" inputMode="tel" />
        </div>

        <button type="submit" className="sv2-yalla-btn" disabled={submitDisabled}>
          {isSubmitting ? 'ENTERING…' : 'TAKE YOUR SEAT'}
        </button>
      </form>
    </div>
  )
}
