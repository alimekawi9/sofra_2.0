'use client'

import { sv2Display, sv2Sans } from './fonts'
import { DIETARY, NOGOS, FLAVORS } from '@/lib/theme'
import { PROTEIN_PREFERENCE_OPTIONS, type ProteinPreference } from '@/lib/protein-preferences'
import type { FlavorPreference } from '@/lib/flavor-preferences'

export interface PreferencesReceiptProps {
  dietary: string[]
  onToggleDietary: (value: string) => void
  avoid: string[]
  onToggleAvoid: (value: string) => void
  proteinPreferences: ProteinPreference[]
  onToggleProtein: (value: ProteinPreference) => void
  proteinHintVisible: boolean
  flavors: string[]
  onToggleFlavor: (value: FlavorPreference) => void
  flavorHintVisible: boolean
  adventurousness: number
  onAdventurousnessChange: (value: number) => void
  onSave: () => void
  prefilled?: boolean
  saveLabel?: string
  saving?: boolean
  error?: string
  onBack?: () => void
}

function CheckboxRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: () => void
}) {
  return (
    <label className="sv2-checkbox-row">
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span className="sv2-checkbox-box" aria-hidden="true" />
      {label}
    </label>
  )
}

export function PreferencesReceipt({
  dietary,
  onToggleDietary,
  avoid,
  onToggleAvoid,
  proteinPreferences,
  onToggleProtein,
  proteinHintVisible,
  flavors,
  onToggleFlavor,
  flavorHintVisible,
  adventurousness,
  onAdventurousnessChange,
  onSave,
  prefilled = false,
  saveLabel = 'SAVE MY SEAT',
  saving = false,
  error = '',
  onBack,
}: PreferencesReceiptProps) {
  const adventurousnessLabel =
    adventurousness < 25
      ? 'Keep it familiar'
      : adventurousness < 55
      ? 'Open to a nudge'
      : adventurousness < 82
      ? 'Feed me something new'
      : 'Chef, surprise me'

  return (
    <div className={`sv2-root sv2-device-page sv2-receipt-page ${sv2Display.variable} ${sv2Sans.variable}`}>
      <main className="sv2-device-shell sv2-receipt-card">
        {onBack && (
          <button type="button" className="sv2-back-link" onClick={onBack} style={{ border: 0, background: 'none', cursor: 'pointer', padding: 0 }}>
            ← Back
          </button>
        )}
        <div className="sv2-perforation" data-testid="receipt-perforation" aria-hidden="true" />
        <p className="sv2-receipt-wordmark" dir="auto" lang="ar">سفرة</p>
        <p className="sv2-receipt-headline">
          WHAT&apos;S ON YOUR MIND,
          <br />
          BEFORE IT&apos;S ON YOUR PLATE
        </p>
        {prefilled && <p className="sv2-hint" data-testid="prefilled-badge">✦ Pulled from your profile</p>}

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/design-preview/divider-line.svg" alt="" className="sv2-divider" />
        <h3 className="sv2-section-label">DEAL BREAKERS</h3>
        <div className="sv2-checkbox-grid">
          {DIETARY.map((item) => (
            <CheckboxRow
              key={item}
              label={item}
              checked={dietary.includes(item)}
              onChange={() => onToggleDietary(item)}
            />
          ))}
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/design-preview/divider-line.svg" alt="" className="sv2-divider" />
        <h3 className="sv2-section-label">ANYTHING YOU AVOID?</h3>
        <div className="sv2-checkbox-grid">
          {NOGOS.map((item) => (
            <CheckboxRow
              key={item}
              label={item}
              checked={avoid.includes(item)}
              onChange={() => onToggleAvoid(item)}
            />
          ))}
        </div>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/design-preview/divider-line.svg" alt="" className="sv2-divider" />
        <h3 className="sv2-section-label">WHAT SOUNDS BEST TONIGHT?</h3>
        <p className="sv2-section-sub">Choose up to two.</p>
        <div className="sv2-checkbox-grid">
          {PROTEIN_PREFERENCE_OPTIONS.map((option) => (
            <CheckboxRow
              key={option.value}
              label={option.label}
              checked={proteinPreferences.includes(option.value)}
              onChange={() => onToggleProtein(option.value)}
            />
          ))}
        </div>
        {proteinHintVisible && (
          <p className="sv2-hint" data-testid="protein-hint">Only two at a time — tap one to swap it out.</p>
        )}

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/design-preview/divider-line.svg" alt="" className="sv2-divider" />
        <h3 className="sv2-section-label">FLAVOURS YOU LEAN TOWARDS</h3>
        {!flavorHintVisible && <p className="sv2-section-sub">Choose up to three.</p>}
        <div className="sv2-checkbox-grid">
          {FLAVORS.map((item) => (
            <CheckboxRow
              key={item}
              label={item}
              checked={flavors.includes(item)}
              onChange={() => onToggleFlavor(item)}
            />
          ))}
        </div>
        {flavorHintVisible && <p className="sv2-hint" data-testid="flavor-hint">Choose up to three.</p>}

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/design-preview/divider-line.svg" alt="" className="sv2-divider" />
        <h3 className="sv2-section-label">HOW BRAVE IS YOUR PALATE?</h3>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={adventurousness}
          onChange={(e) => onAdventurousnessChange(Number(e.target.value))}
          aria-label="Adventurousness"
          className="sv2-slider"
        />
        <div className="sv2-slider-labels">
          <span>THE USUAL</span>
          <span>ANYTHING ONCE</span>
        </div>
        <p className="sv2-slider-value">{adventurousnessLabel}</p>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/design-preview/divider-line.svg" alt="" className="sv2-divider" />
        <button type="button" className="sv2-save-btn" onClick={onSave} disabled={saving}>
          {saving ? 'SAVING…' : saveLabel}
        </button>
        {error && <p className="sv2-hint" role="alert">{error}</p>}
      </main>
    </div>
  )
}
