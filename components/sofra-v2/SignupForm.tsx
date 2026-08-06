'use client'

import type { FormEvent } from 'react'
import { sv2Display, sv2Sans } from './fonts'

export interface SignupFormProps {
  name: string
  phone: string
  onNameChange: (value: string) => void
  onPhoneChange: (value: string) => void
  onSubmit: () => void
  isSubmitting?: boolean
}

export function SignupForm({
  name,
  phone,
  onNameChange,
  onPhoneChange,
  onSubmit,
  isSubmitting = false,
}: SignupFormProps) {
  const submitDisabled = name.trim() === '' || phone.trim() === '' || isSubmitting

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
        <p className="sv2-signup-sub">No passwords. Your name and number stay with your account.</p>

        <label className="sv2-field-label" htmlFor="sv2-signup-name">Your name</label>
        <input
          id="sv2-signup-name"
          className="sv2-field-input"
          type="text"
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          autoComplete="name"
        />

        <label className="sv2-field-label" htmlFor="sv2-signup-phone">Phone number</label>
        <input
          id="sv2-signup-phone"
          className="sv2-field-input"
          type="tel"
          value={phone}
          onChange={(event) => onPhoneChange(event.target.value)}
          autoComplete="tel"
          inputMode="tel"
        />

        <button type="submit" className="sv2-yalla-btn" disabled={submitDisabled}>
          {isSubmitting ? 'ENTERING…' : 'ENTER SOFRA'}
        </button>
      </form>
    </div>
  )
}
