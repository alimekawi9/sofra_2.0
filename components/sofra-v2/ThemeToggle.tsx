'use client'

import { useEffect, useState } from 'react'

type PreviewTheme = 'light' | 'dark'

const STORAGE_KEY = 'sofra-v2-preview-theme'
const PREVIEW_ATTR = 'data-sv2-theme'

function applyPreviewTheme(theme: PreviewTheme) {
  document.documentElement.setAttribute(PREVIEW_ATTR, theme)
}

export function ThemeToggle() {
  // Deterministic for SSR and first client paint: always 'dark', matching
  // the Figma-sourced screens' default. Browser storage is read only after
  // mount (below), never during render, so server and first-paint markup
  // always match — no hydration mismatch.
  const [theme, setTheme] = useState<PreviewTheme>('dark')

  useEffect(() => {
    let stored: string | null = null
    try {
      stored = window.localStorage.getItem(STORAGE_KEY)
    } catch {
      // Storage unavailable (e.g. private browsing) — fall back to the default.
    }
    const initial: PreviewTheme = stored === 'light' ? 'light' : 'dark'
    setTheme(initial)
    applyPreviewTheme(initial)

    // Preview-only attribute — distinct from the app's real `data-theme`
    // attribute — so it must not outlive this component. Without this,
    // leaving a /design-preview route would leave data-sv2-theme sitting
    // on <html> indefinitely.
    return () => {
      document.documentElement.removeAttribute(PREVIEW_ATTR)
    }
  }, [])

  function selectTheme(next: PreviewTheme) {
    setTheme(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Storage unavailable — the in-memory theme still applies for this session.
    }
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
