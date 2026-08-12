'use client'

import { Fragment, type ReactNode } from 'react'
import { sv2Display, sv2Sans } from './fonts'
import { DIETARY, NOGOS, FLAVORS } from '@/lib/theme'
import { PROTEIN_PREFERENCE_OPTIONS, type ProteinPreference } from '@/lib/protein-preferences'
import type { FlavorPreference } from '@/lib/flavor-preferences'

export interface PreferencesReceiptProps {
  dietary: string[]
  onToggleDietary: (value: string) => void
  onSelectNoDietaryRestriction?: () => void
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
  visibleCanonicalQuestions?: Array<'dietary' | 'avoid' | 'protein' | 'flavor' | 'adventurousness'>
  saveLabel?: string
  saving?: boolean
  error?: string
  onBack?: () => void
  // Host-customizable display text only. The values passed to onToggle*
  // callbacks above are always the raw canonical strings/values, regardless
  // of any override here -- these never change what gets persisted.
  dietaryTitle?: string
  dietaryHelperText?: string
  dietaryOptionLabels?: Record<string, string>
  avoidTitle?: string
  avoidOptionLabels?: Record<string, string>
  proteinTitle?: string
  proteinHelperText?: string
  proteinOptionLabels?: Record<string, string>
  flavorTitle?: string
  flavorHelperText?: string
  flavorOptionLabels?: Record<string, string>
  adventurousnessTitle?: string
  adventurousnessHelperText?: string
  adventurousnessMinLabel?: string
  adventurousnessMaxLabel?: string
  // Rendered just before the save button -- used to append event-specific
  // custom questions without forking this component.
  extraContent?: ReactNode
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
  onSelectNoDietaryRestriction = () => {},
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
  visibleCanonicalQuestions,
  saveLabel = 'SAVE MY SEAT',
  saving = false,
  error = '',
  onBack,
  dietaryTitle,
  dietaryHelperText,
  dietaryOptionLabels,
  avoidTitle,
  avoidOptionLabels,
  proteinTitle,
  proteinHelperText,
  proteinOptionLabels,
  flavorTitle,
  flavorHelperText,
  flavorOptionLabels,
  adventurousnessTitle,
  adventurousnessHelperText,
  adventurousnessMinLabel,
  adventurousnessMaxLabel,
  extraContent,
}: PreferencesReceiptProps) {
  const shows = (key: 'dietary' | 'avoid' | 'protein' | 'flavor' | 'adventurousness') =>
    visibleCanonicalQuestions === undefined || visibleCanonicalQuestions.includes(key)
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

        {shows('dietary') && <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/design-preview/divider-line.svg" alt="" className="sv2-divider" />
        <h3 className="sv2-section-label">{dietaryTitle || 'ANY LANE TO STAY IN?'}</h3>
        {dietaryHelperText && <p className="sv2-section-sub">{dietaryHelperText}</p>}
        <div className="sv2-checkbox-grid">
          {DIETARY.map((item) => (
            <Fragment key={item}>
              <CheckboxRow
                label={dietaryOptionLabels?.[item] || item}
                checked={dietary.includes(item)}
                onChange={() => onToggleDietary(item)}
              />
              {item === 'No dairy' && (
                <CheckboxRow
                  label="None"
                  checked={dietary.length === 0}
                  onChange={onSelectNoDietaryRestriction}
                />
              )}
            </Fragment>
          ))}
        </div>
        </>}
        {shows('avoid') && <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/design-preview/divider-line.svg" alt="" className="sv2-divider" />
        <h3 className="sv2-section-label">{avoidTitle || 'ANYTHING YOU AVOID?'}</h3>
        <div className="sv2-checkbox-grid">
          {NOGOS.map((item) => (
            <CheckboxRow
              key={item}
              label={avoidOptionLabels?.[item] || item}
              checked={avoid.includes(item)}
              onChange={() => onToggleAvoid(item)}
            />
          ))}
        </div>
        </>}

        {shows('protein') && <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/design-preview/divider-line.svg" alt="" className="sv2-divider" />
        <h3 className="sv2-section-label">{proteinTitle || 'WHAT SOUNDS BEST TONIGHT?'}</h3>
        <p className="sv2-section-sub">{proteinHelperText || 'Choose up to two.'}</p>
        <div className="sv2-checkbox-grid">
          {PROTEIN_PREFERENCE_OPTIONS.map((option) => (
            <CheckboxRow
              key={option.value}
              label={proteinOptionLabels?.[option.value] || option.label}
              checked={proteinPreferences.includes(option.value)}
              onChange={() => onToggleProtein(option.value)}
            />
          ))}
        </div>
        {proteinHintVisible && (
          <p className="sv2-hint" data-testid="protein-hint">Only two at a time with one tap to swap it out.</p>
        )}
        </>}

        {shows('flavor') && <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/design-preview/divider-line.svg" alt="" className="sv2-divider" />
        <h3 className="sv2-section-label">{flavorTitle || 'FLAVOURS YOU LEAN TOWARDS'}</h3>
        {!flavorHintVisible && <p className="sv2-section-sub">{flavorHelperText || 'Choose up to three.'}</p>}
        <div className="sv2-checkbox-grid">
          {FLAVORS.map((item) => (
            <CheckboxRow
              key={item}
              label={flavorOptionLabels?.[item] || item}
              checked={flavors.includes(item)}
              onChange={() => onToggleFlavor(item)}
            />
          ))}
        </div>
        {flavorHintVisible && <p className="sv2-hint" data-testid="flavor-hint">Choose up to three.</p>}
        </>}

        {shows('adventurousness') && <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/design-preview/divider-line.svg" alt="" className="sv2-divider" />
        <h3 className="sv2-section-label">{adventurousnessTitle || 'HOW BRAVE IS YOUR PALATE?'}</h3>
        {adventurousnessHelperText && <p className="sv2-section-sub">{adventurousnessHelperText}</p>}
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
          <span>{adventurousnessMinLabel || 'THE USUAL'}</span>
          <span>{adventurousnessMaxLabel || 'ANYTHING ONCE'}</span>
        </div>
        <p className="sv2-slider-value">{adventurousnessLabel}</p>
        </>}

        {extraContent}

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
