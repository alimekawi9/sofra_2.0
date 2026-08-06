'use client'

import { sv2Display, sv2Sans } from './fonts'

export interface WelcomeCardProps {
  onYalla: () => void
}

export function WelcomeCard({ onYalla }: WelcomeCardProps) {
  return (
    <div className={`sv2-root sv2-device-page sv2-welcome-page ${sv2Display.variable} ${sv2Sans.variable}`}>
      <main className="sv2-device-shell sv2-welcome-card">
        <p className="sv2-eyebrow">EST. 2026</p>
        <p className="sv2-arabic" dir="auto" lang="ar">اتفضلوا على السفرة</p>
        <p className="sv2-welcome-kicker">
          WELCOME TO
          <br />
          THE
        </p>
        <p className="sv2-welcome-title">Sofra.</p>
        <button type="button" className="sv2-yalla-btn" onClick={onYalla}>
          YALLA
        </button>
      </main>
    </div>
  )
}
