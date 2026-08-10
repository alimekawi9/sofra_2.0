'use client'

import type { CSSProperties } from 'react'
import { sv2Display, sv2Sans } from './fonts'

export interface PreferencesConfirmProps {
  saving: boolean
  error: string
  onUseSaved: () => void
  onUpdate: () => void
  onBack: () => void
}

const buttonStyle: CSSProperties = {
  minHeight: 46,
  padding: 14,
  border: '1px solid var(--sv2-ink)',
  background: 'transparent',
  color: 'inherit',
  fontSize: 11,
  fontFamily: 'inherit',
  cursor: 'pointer',
}

export function PreferencesConfirm({ saving, error, onUseSaved, onUpdate, onBack }: PreferencesConfirmProps) {
  return (
    <div className={`sv2-root sv2-device-page sv2-invite-page ${sv2Display.variable} ${sv2Sans.variable}`}>
      <main className="sv2-device-shell sv2-missing-out">
        <p className="sv2-event-kicker">WELCOME BACK</p>
        <h1>Same taste as last time?</h1>
        <p>We already have your dietary, protein, flavor, and adventurousness preferences on file.</p>
        <div>
          <button type="button" onClick={onUseSaved} disabled={saving} style={{ ...buttonStyle, background: 'var(--sv2-ink)', color: 'var(--sv2-off-white)' }}>
            {saving ? 'SAVING…' : 'USE MY SAVED PREFERENCES'}
          </button>
          <button type="button" onClick={onUpdate} disabled={saving} style={buttonStyle}>
            UPDATE MY PREFERENCES
          </button>
          <button type="button" onClick={onBack} disabled={saving} style={{ ...buttonStyle, border: 'none' }}>
            ← Back
          </button>
        </div>
        {error && <p role="alert" style={{ marginTop: 12, fontSize: 12 }}>{error}</p>}
      </main>
    </div>
  )
}
