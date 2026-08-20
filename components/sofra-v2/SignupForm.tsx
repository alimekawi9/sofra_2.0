'use client'

import Image from 'next/image'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { PHONE_COUNTRIES, phoneLengths, type PhoneCountry } from '@/lib/phone-countries'
import { sv2Display, sv2Sans } from './fonts'

/*
  { iso: 'EG', name: 'Egypt', dialCode: '+20', lengths: [10] },
  { iso: 'US', name: 'United States', dialCode: '+1', lengths: [10] },
  { iso: 'CA', name: 'Canada', dialCode: '+1', lengths: [10] },
  { iso: 'MX', name: 'Mexico', dialCode: '+52', lengths: [10] },
  { iso: 'BR', name: 'Brazil', dialCode: '+55', lengths: [10, 11] },
  { iso: 'AR', name: 'Argentina', dialCode: '+54', lengths: [10] },
  { iso: 'CO', name: 'Colombia', dialCode: '+57', lengths: [10] },
  { iso: 'GB', name: 'United Kingdom', dialCode: '+44', lengths: [10] },
  { iso: 'LB', name: 'Lebanon', dialCode: '+961', lengths: [7, 8] },
  { iso: 'AE', name: 'United Arab Emirates', dialCode: '+971', lengths: [9] },
  { iso: 'SA', name: 'Saudi Arabia', dialCode: '+966', lengths: [9] },
  { iso: 'JO', name: 'Jordan', dialCode: '+962', lengths: [9] },
  { iso: 'KW', name: 'Kuwait', dialCode: '+965', lengths: [8] },
  { iso: 'QA', name: 'Qatar', dialCode: '+974', lengths: [8] },
  { iso: 'BH', name: 'Bahrain', dialCode: '+973', lengths: [8] },
  { iso: 'OM', name: 'Oman', dialCode: '+968', lengths: [8] },
  { iso: 'IQ', name: 'Iraq', dialCode: '+964', lengths: [10] },
  { iso: 'SY', name: 'Syria', dialCode: '+963', lengths: [9] },
  { iso: 'PS', name: 'Palestine', dialCode: '+970', lengths: [9] },
  { iso: 'FR', name: 'France', dialCode: '+33', lengths: [9] },
  { iso: 'IT', name: 'Italy', dialCode: '+39', lengths: [9, 10] },
  { iso: 'DE', name: 'Germany', dialCode: '+49', lengths: [10, 11] },
  { iso: 'ES', name: 'Spain', dialCode: '+34', lengths: [9] },
  { iso: 'PT', name: 'Portugal', dialCode: '+351', lengths: [9] },
  { iso: 'NL', name: 'Netherlands', dialCode: '+31', lengths: [9] },
  { iso: 'BE', name: 'Belgium', dialCode: '+32', lengths: [9] },
  { iso: 'CH', name: 'Switzerland', dialCode: '+41', lengths: [9] },
  { iso: 'GR', name: 'Greece', dialCode: '+30', lengths: [10] },
  { iso: 'TR', name: 'Türkiye', dialCode: '+90', lengths: [10] },
  { iso: 'MA', name: 'Morocco', dialCode: '+212', lengths: [9] },
  { iso: 'DZ', name: 'Algeria', dialCode: '+213', lengths: [9] },
  { iso: 'TN', name: 'Tunisia', dialCode: '+216', lengths: [8] },
  { iso: 'ZA', name: 'South Africa', dialCode: '+27', lengths: [9] },
  { iso: 'NG', name: 'Nigeria', dialCode: '+234', lengths: [10] },
  { iso: 'KE', name: 'Kenya', dialCode: '+254', lengths: [9] },
  { iso: 'IN', name: 'India', dialCode: '+91', lengths: [10] },
  { iso: 'PK', name: 'Pakistan', dialCode: '+92', lengths: [10] },
  { iso: 'CN', name: 'China', dialCode: '+86', lengths: [11] },
  { iso: 'JP', name: 'Japan', dialCode: '+81', lengths: [10] },
  { iso: 'KR', name: 'South Korea', dialCode: '+82', lengths: [9, 10] },
  { iso: 'SG', name: 'Singapore', dialCode: '+65', lengths: [8] },
  { iso: 'AU', name: 'Australia', dialCode: '+61', lengths: [9] },
  { iso: 'NZ', name: 'New Zealand', dialCode: '+64', lengths: [8, 9] },
] as const
*/

function initialCountry(phone: string): PhoneCountry {
  const defaultCountry = PHONE_COUNTRIES.find((country) => country.iso === 'EG') ?? PHONE_COUNTRIES[0]
  if (!phone.startsWith('+')) return defaultCountry
  if (phone.startsWith('+1')) return PHONE_COUNTRIES.find((country) => country.iso === 'US') ?? defaultCountry
  return [...PHONE_COUNTRIES]
    .sort((a, b) => b.dialCode.length - a.dialCode.length)
    .find((country) => phone.startsWith(country.dialCode)) ?? defaultCountry
}

function placeholderFor(length: number): string {
  return '5550555055'.repeat(Math.ceil(length / 10)).slice(0, length)
}

function displayNumber(countryIso: string, digits: string): string {
  if (countryIso !== 'US' && countryIso !== 'CA') return digits
  if (digits.length <= 3) return digits.length ? `(${digits}` : ''
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

export interface SignupFormProps {
  phone: string
  onPhoneChange: (value: string) => void
  onSubmit: () => void
  isSubmitting?: boolean
}

export function SignupForm({ phone, onPhoneChange, onSubmit, isSubmitting = false }: SignupFormProps) {
  const [countryIso, setCountryIso] = useState(() => initialCountry(phone).iso)
  const [countryMenuOpen, setCountryMenuOpen] = useState(false)
  const countryPickerRef = useRef<HTMLDivElement>(null)
  const country = PHONE_COUNTRIES.find((option) => option.iso === countryIso) ?? PHONE_COUNTRIES[0]
  const nationalDigits = (phone.startsWith(country.dialCode) ? phone.slice(country.dialCode.length) : phone)
    .replace(/\D/g, '')
  const lengths = phoneLengths(country)
  const maxDigits = Math.max(...lengths)
  const valid = lengths.includes(nationalDigits.length)
  const countTarget = lengths.length === 1
    ? String(lengths[0])
    : `${Math.min(...lengths)}-${maxDigits}`
  const submitDisabled = !valid || isSubmitting
  const formattedNumber = displayNumber(country.iso, nationalDigits)
  const formattedPlaceholder = displayNumber(country.iso, placeholderFor(maxDigits))

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (!countryPickerRef.current?.contains(event.target as Node)) setCountryMenuOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    return () => document.removeEventListener('mousedown', closeOnOutsideClick)
  }, [])

  function setNationalNumber(value: string) {
    const digits = value.replace(/\D/g, '').slice(0, maxDigits)
    onPhoneChange(digits ? `${country.dialCode}${digits}` : '')
  }

  function changeCountry(nextIso: string) {
    const next = PHONE_COUNTRIES.find((option) => option.iso === nextIso) ?? PHONE_COUNTRIES[0]
    setCountryIso(next.iso)
    setCountryMenuOpen(false)
    // A national number typed for one country isn't meaningful under another
    // country's dial code -- carrying the digits over produced nonsense
    // numbers like +20 (Egypt) prefixed onto a US-length number. Start fresh.
    onPhoneChange('')
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!submitDisabled) onSubmit()
  }

  return (
    <div className={`sv2-root sv2-device-page sv2-welcome-page sv2-plate-step-page ${sv2Display.variable} ${sv2Sans.variable}`}>
      <form className="sv2-device-shell sv2-welcome-card sv2-plate-step sv2-receipt-surface" onSubmit={handleSubmit}>
        <h1 className="sv2-plate-heading">
          <span>But first,</span>
          <span>What&apos;s your number?</span>
        </h1>

        <div className="sv2-plate-wrap sv2-plate-wrap--burgundy" data-testid="phone-plate">
          <Image className="sv2-plate-image" src="/design-preview/burgundy-plate.png" alt="" aria-hidden="true" width={1254} height={1254} priority />
          <div className="sv2-plate-bowl sv2-phone-plate-bowl">
            <div className="sv2-phone-entry">
              <div className="sv2-phone-entry-row">
                <div className="sv2-country-picker" ref={countryPickerRef}>
                <button
                  id="sv2-signup-country"
                  type="button"
                  className="sv2-country-trigger"
                  aria-label="Country code"
                  role="combobox"
                  aria-expanded={countryMenuOpen}
                  aria-controls="sv2-country-options"
                  onClick={() => setCountryMenuOpen((open) => !open)}
                >
                  <span>{country.dialCode} {country.iso}</span><span aria-hidden="true">⌄</span>
                </button>
                {countryMenuOpen ? (
                  <div id="sv2-country-options" className="sv2-country-options" role="listbox" aria-label="Countries">
                    {PHONE_COUNTRIES.map((option) => (
                      <button
                        key={option.iso}
                        type="button"
                        role="option"
                        aria-selected={option.iso === country.iso}
                        onClick={() => changeCountry(option.iso)}
                      >
                        <span>{option.name}</span><span>{option.dialCode}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
                </div>
                <label className="sv2-visually-hidden" htmlFor="sv2-signup-phone">Phone number</label>
                <input
                  id="sv2-signup-phone"
                  className="sv2-plate-input"
                  type="tel"
                  value={formattedNumber}
                  placeholder={formattedPlaceholder}
                  onChange={(event) => setNationalNumber(event.target.value)}
                  autoComplete="tel-national"
                  inputMode="numeric"
                  pattern="[0-9() -]*"
                  maxLength={country.iso === 'US' || country.iso === 'CA' ? 14 : maxDigits}
                  aria-invalid={nationalDigits.length > 0 && !valid}
                  aria-describedby="sv2-phone-counter"
                />
              </div>
              <span id="sv2-phone-counter" className={nationalDigits.length > 0 && !valid ? 'sv2-phone-counter is-invalid' : 'sv2-phone-counter'}>
                {nationalDigits.length}/{countTarget} digits
              </span>
            </div>
          </div>
        </div>

        <button type="submit" className="sv2-yalla-btn sv2-plate-action" disabled={submitDisabled}>
          {isSubmitting ? 'ENTERING...' : 'CONTINUE'}
        </button>
      </form>
    </div>
  )
}
