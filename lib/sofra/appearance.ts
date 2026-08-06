'use client'

import { useEffect, useState } from 'react'

/** Light/dark table setting. Distinct from lib/theme.ts, which is the
 *  per-event cover mood stored on events.theme. */
export type Appearance = 'light' | 'dark'
const KEY = 'sofra_theme'

export function getAppearance(): Appearance {
  if (typeof window === 'undefined') return 'dark'
  return window.localStorage.getItem(KEY) === 'light' ? 'light' : 'dark'
}

export function applyAppearance(t: Appearance) {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-theme', t)
}

export function setAppearance(t: Appearance) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(KEY, t)
  applyAppearance(t)
  window.dispatchEvent(new CustomEvent('sofra-theme', { detail: t }))
}

export function useAppearance(): [Appearance, (t: Appearance) => void] {
  const [theme, setLocal] = useState<Appearance>('dark')
  useEffect(() => {
    const t = getAppearance()
    setLocal(t)
    applyAppearance(t)
    const onChange = (e: Event) => setLocal((e as CustomEvent<Appearance>).detail)
    window.addEventListener('sofra-theme', onChange)
    return () => window.removeEventListener('sofra-theme', onChange)
  }, [])
  return [theme, setAppearance]
}
