'use client'

import Image from 'next/image'
import type { FormEvent } from 'react'
import { sv2Display, sv2Sans } from './fonts'

export function VerifyPhoneForm({
  code,
  phone,
  onCodeChange,
  onSubmit,
  onBack,
  isSubmitting = false,
}: {
  code: string
  phone: string
  onCodeChange: (value: string) => void
  onSubmit: () => void
  onBack: () => void
  isSubmitting?: boolean
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (code.length === 6 && !isSubmitting) onSubmit()
  }

  return (
    <div className={`sv2-root sv2-device-page sv2-welcome-page sv2-plate-step-page ${sv2Display.variable} ${sv2Sans.variable}`}>
      <form className="sv2-device-shell sv2-welcome-card sv2-plate-step sv2-name-step sv2-receipt-surface" onSubmit={submit}>
        <h1 className="sv2-plate-heading"><span>Check your phone,</span><span>then enter the code.</span></h1>
        <div className="sv2-plate-wrap sv2-plate-wrap--silver">
          <Image className="sv2-plate-image" src="/design-preview/silver-plate.png" alt="" aria-hidden="true" width={1254} height={1254} priority />
          <div className="sv2-plate-bowl">
            <label className="sv2-visually-hidden" htmlFor="sv2-phone-code">Six-digit verification code sent to {phone}</label>
            <input
              id="sv2-phone-code"
              className="sv2-plate-input"
              type="text"
              value={code}
              placeholder="000000"
              onChange={(event) => onCodeChange(event.target.value.replace(/\D/g, '').slice(0, 6))}
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={6}
            />
          </div>
        </div>
        <button type="submit" className="sv2-yalla-btn sv2-plate-action" disabled={code.length !== 6 || isSubmitting}>
          {isSubmitting ? 'VERIFYING...' : 'CONTINUE'}
        </button>
        <button type="button" className="sv2-text-button" onClick={onBack} disabled={isSubmitting}>Use a different number</button>
      </form>
    </div>
  )
}
