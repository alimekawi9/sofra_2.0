'use client'

import { useRouter } from 'next/navigation'
import { C } from '@/lib/theme'

interface ChefTabsProps {
  eventId: string
  active: 'table' | 'menu'
  title?: string
  subtitle?: string
}

export default function ChefTabs({ eventId, active, title, subtitle }: ChefTabsProps) {
  const router = useRouter()

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ color: C.cream, fontSize: 24, fontStyle: 'italic' }}>
            Sofra{' '}
            <span
              style={{
                color: C.gold,
                fontSize: 14,
                fontStyle: 'normal',
                fontFamily: 'system-ui, sans-serif',
                letterSpacing: 1,
              }}
            >
              · Kitchen
            </span>
          </div>
          {(title || subtitle) && (
            <div
              style={{
                color: C.dim,
                fontSize: 13,
                marginTop: 4,
                fontFamily: 'system-ui, sans-serif',
              }}
            >
              {title}
              {title && subtitle ? ' · ' : ''}
              {subtitle}
            </div>
          )}
        </div>
        <button
          onClick={() => router.push(`/kitchen?from=${eventId}&from_page=${active}`)}
          className="regen"
          aria-label="My kitchen"
          style={{ background: 'transparent', border: '1px solid rgba(217,161,91,0.35)' }}
        >
          My Kitchen
        </button>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 6,
          paddingTop: 14,
          borderBottom: `1px solid ${C.line}`,
          marginTop: 14,
        }}
      >
        <button
          className={active === 'table' ? 'tab on' : 'tab'}
          onClick={() => router.push(`/events/${eventId}/table`)}
        >
          The Table
        </button>
        <button
          className={active === 'menu' ? 'tab on' : 'tab'}
          onClick={() => router.push(`/events/${eventId}/menu`)}
        >
          Drafted Menu
        </button>
      </div>
    </div>
  )
}
