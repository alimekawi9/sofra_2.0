'use client'

import { useState } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
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
          <Image src="/design-preview/silver-plate.png" alt="" width={340} height={340} priority />
        </motion.div>
        <AnimatePresence>
          {!leaving && (
            <motion.div className="sv2-host-entry-overlay" exit={{ opacity: 0 }} transition={{ duration: 0.22 }}>
              <svg className="sv2-host-entry-fork" width="18" height="90" viewBox="0 0 18 90" aria-hidden="true">
                <g fill="none" stroke="#C4A35A" strokeWidth="2">
                  <path d="M4 0v22M9 0v22M14 0v22" />
                  <path d="M4 22c0 8 5 8 5 14s-5 6-5 14v40" />
                  <path d="M14 22c0 8-5 8-5 14" />
                </g>
              </svg>
              <svg className="sv2-host-entry-knife" width="16" height="90" viewBox="0 0 16 90" aria-hidden="true">
                <g fill="none" stroke="#C4A35A" strokeWidth="2">
                  <path d="M8 0c5 4 5 20 0 30s-5 8 0 8v52" />
                </g>
              </svg>
              <div className="sv2-host-entry-card">
                <p>Ready to host<br />your own Sofra?</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </button>
    </div>
  )
}
