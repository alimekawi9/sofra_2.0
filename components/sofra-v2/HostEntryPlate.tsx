'use client'

import { useState } from 'react'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { sv2Display, sv2Sans } from './fonts'

export const HOST_ENTRY_SHELL_LAYOUT_ID = 'host-entry-shell'

export interface HostEntryPlateProps {
  onEnter: () => void
}

export function HostEntryPlate({ onEnter }: HostEntryPlateProps) {
  const [leaving, setLeaving] = useState(false)

  function handleClick() {
    if (leaving) return
    setLeaving(true)
    window.setTimeout(onEnter, 500)
  }

  return (
    <div className={`sv2-root sv2-host-entry-page${leaving ? ' leaving' : ''} ${sv2Display.variable} ${sv2Sans.variable}`}>
      <button
        type="button"
        className="sv2-host-entry-trigger"
        onClick={handleClick}
        disabled={leaving}
        aria-label="Start hosting a Sofra"
      >
        <motion.div layoutId={HOST_ENTRY_SHELL_LAYOUT_ID} className="sv2-host-entry-plate">
          <Image
            src="/host-entry-plate.png"
            alt=""
            fill
            priority
            sizes="(min-width: 600px) 640px, 100vw"
            className="sv2-host-entry-image"
          />
        </motion.div>
      </button>
    </div>
  )
}
