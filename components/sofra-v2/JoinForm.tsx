'use client'

import type { FormEvent } from 'react'
import { sv2Display, sv2Sans } from './fonts'

type Props = {
  name: string
  phone: string
  onNameChange: (value: string) => void
  onPhoneChange: (value: string) => void
  onSubmit: () => void
  isSubmitting?: boolean
}

export function JoinForm({ name, phone, onNameChange, onPhoneChange, onSubmit, isSubmitting = false }: Props) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (name.trim() && !isSubmitting) onSubmit()
  }

  return (
    <div className={`sv2-root sv2-device-page sv2-welcome-page sv2-plate-step-page ${sv2Display.variable} ${sv2Sans.variable}`}>
      <form className="sv2-device-shell sv2-welcome-card sv2-plate-step sv2-name-step sv2-receipt-surface" onSubmit={submit}>
        <h1 className="sv2-plate-heading"><span>Take your place</span><span>at the table.</span></h1>
        <div className="sv2-join-fields">
          <label htmlFor="sv2-join-name">Your name</label>
          <input id="sv2-join-name" type="text" value={name} onChange={(event) => onNameChange(event.target.value)} autoComplete="name" placeholder="e.g. Giada" required />
          <label htmlFor="sv2-join-phone">International phone number <span>(optional)</span></label>
          <input id="sv2-join-phone" type="tel" value={phone} onChange={(event) => onPhoneChange(event.target.value)} autoComplete="tel" inputMode="tel" placeholder="e.g. +20 10 1234 5678" />
          <p className="sv2-hint">Without a phone number, Sofra will create a new account. Names are never used to find an existing account.</p>
        </div>
        <button type="submit" className="sv2-yalla-btn sv2-plate-action" disabled={!name.trim() || isSubmitting}>{isSubmitting ? 'ENTERING…' : 'CONTINUE'}</button>
      </form>
    </div>
  )
}
