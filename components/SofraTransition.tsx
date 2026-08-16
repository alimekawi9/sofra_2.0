'use client'

import { useEffect, useState } from 'react'

type SofraTransitionProps = {
  active: boolean
  label?: string
  delayMs?: number
}

export default function SofraTransition({
  active,
  label = 'Assembling the plates',
  delayMs = 180,
}: SofraTransitionProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!active) {
      setVisible(false)
      return
    }

    const timer = window.setTimeout(() => setVisible(true), delayMs)
    return () => window.clearTimeout(timer)
  }, [active, delayMs])

  if (!visible) return null

  return (
    <div className="sf-loader" role="status" aria-live="polite" aria-label={label}>
      <div className="sf-snake" aria-hidden="true">
        <div className="strip" />
      </div>
      <div className="cap">{label}</div>
      <div className="bar" aria-hidden="true"><i /></div>
    </div>
  )
}
