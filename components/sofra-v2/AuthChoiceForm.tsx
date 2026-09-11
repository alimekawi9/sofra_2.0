'use client'

import Image from 'next/image'
import { useState, type FormEvent } from 'react'
import { sv2Display, sv2Sans } from './fonts'

type Props = { email: string; onEmailChange: (value: string) => void; onGoogle: () => void; onEmail: () => void; submitting: boolean; sent: boolean }

export function AuthChoiceForm({ email, onEmailChange, onGoogle, onEmail, submitting, sent }: Props) {
  const [showEmail, setShowEmail] = useState(false)
  function submit(event: FormEvent) { event.preventDefault(); if (email.trim() && !submitting) onEmail() }
  return (
    <div className={`sv2-root sv2-device-page sv2-welcome-page sv2-plate-step-page ${sv2Display.variable} ${sv2Sans.variable}`}>
      <main className="sv2-device-shell sv2-welcome-card sv2-plate-step sv2-receipt-surface">
        <h1 className="sv2-plate-heading"><span>But first,</span><span>take your seat.</span></h1>
        <div className="sv2-plate-wrap sv2-plate-wrap--burgundy">
          <Image className="sv2-plate-image" src="/design-preview/burgundy-plate.png" alt="" aria-hidden="true" width={1254} height={1254} priority />
        </div>
        <div className="sv2-auth-actions">
          <button type="button" className="sv2-auth-provider sv2-auth-google" onClick={onGoogle} disabled={submitting}>
            <svg className="sv2-auth-provider-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.41Z" />
              <path fill="#34A853" d="M12 22c2.7 0 4.98-.9 6.63-2.36l-3.24-2.54c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.62A10 10 0 0 0 12 22Z" />
              <path fill="#FBBC05" d="M6.39 13.93A6.02 6.02 0 0 1 6.08 12c0-.67.11-1.32.31-1.93V7.45H3.04A10 10 0 0 0 2 12c0 1.63.39 3.17 1.04 4.55l3.35-2.62Z" />
              <path fill="#EA4335" d="M12 5.94c1.47 0 2.79.5 3.82 1.5l2.88-2.88A9.66 9.66 0 0 0 12 2a10 10 0 0 0-8.96 5.45l3.35 2.62C7.18 7.7 9.39 5.94 12 5.94Z" />
            </svg>
            <span>CONTINUE WITH GOOGLE</span>
          </button>
          <div className="sv2-auth-divider" aria-hidden="true"><span>OR</span></div>
          {!showEmail ? <button type="button" className="sv2-auth-provider sv2-auth-email-option" onClick={() => setShowEmail(true)}>
            <svg className="sv2-auth-provider-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.75 5.75h16.5v12.5H3.75zM4.5 6.5 12 12l7.5-5.5" /></svg>
            <span>CONTINUE WITH EMAIL</span>
          </button>
            : sent ? <p className="sv2-auth-confirmation" role="status">Check your email for your Sofra sign-in link.</p>
              : <form className="sv2-auth-email" onSubmit={submit}>
                <label htmlFor="sv2-auth-email">EMAIL</label>
                <input id="sv2-auth-email" type="email" autoComplete="email" required value={email} onChange={(event) => onEmailChange(event.target.value)} placeholder="you@example.com" />
                <button type="submit" className="sv2-auth-email-submit" disabled={!email.trim() || submitting}>{submitting ? 'SENDING...' : 'EMAIL ME A LINK'}</button>
              </form>}
        </div>
      </main>
    </div>
  )
}
