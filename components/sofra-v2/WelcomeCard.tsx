'use client'

import { sv2Display, sv2Sans } from './fonts'

export interface WelcomeCardProps {
  onYalla: () => void
}

export function WelcomeCard({ onYalla }: WelcomeCardProps) {
  return (
    <div className={`sv2-root sv2-welcome-page ${sv2Display.variable} ${sv2Sans.variable}`}>
      <div className="sv2-welcome-card">
        <div className="sv2-welcome-hairline" aria-hidden="true" />
        <p className="sv2-eyebrow">EST. 2026</p>
        <p className="sv2-arabic" dir="auto">اتفضلوا على السفرة</p>
        <p className="sv2-welcome-kicker">
          WELCOME TO
          <br />
          THE
        </p>
        <p className="sv2-welcome-title">Sofra.</p>
        <button type="button" className="sv2-yalla-btn" onClick={onYalla}>
          YALLA
        </button>
      </div>
    </div>
  )
}
