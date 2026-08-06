'use client'

import { useEffect, useState } from 'react'

type PreviewTheme = 'light' | 'dark'

const STORAGE_KEY = 'sofra-v2-preview-theme'

function applyPreviewTheme(theme: PreviewTheme) {
  document.documentElement.setAttribute('data-theme', theme)
}

export function ThemeToggle() {
  // Deterministic for SSR and first client paint: always 'dark', matching
  // the Figma-sourced screens' default. Browser storage is read only after
  // mount (below), never during render, so server and first-paint markup
  // always match — no hydration mismatch.
  const [theme, setTheme] = useState<PreviewTheme>('dark')

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    const initial: PreviewTheme = stored === 'light' ? 'light' : 'dark'
    setTheme(initial)
    applyPreviewTheme(initial)
  }, [])

  function selectTheme(next: PreviewTheme) {
    setTheme(next)
    window.localStorage.setItem(STORAGE_KEY, next)
    applyPreviewTheme(next)
  }

  return (
    <div className="sv2-root sv2-theme-toggle" role="group" aria-label="Preview appearance">
      <button
        type="button"
        className={theme === 'dark' ? 'sv2-theme-toggle-btn sv2-on' : 'sv2-theme-toggle-btn'}
        aria-pressed={theme === 'dark'}
        aria-label={theme === 'dark' ? 'Dark preview theme (current)' : 'Switch to dark preview theme'}
        onClick={() => selectTheme('dark')}
      >
        Dark
      </button>
      <button
        type="button"
        className={theme === 'light' ? 'sv2-theme-toggle-btn sv2-on' : 'sv2-theme-toggle-btn'}
        aria-pressed={theme === 'light'}
        aria-label={theme === 'light' ? 'Light preview theme (current)' : 'Switch to light preview theme'}
        onClick={() => selectTheme('light')}
      >
        Light
      </button>
    </div>
  )
}
