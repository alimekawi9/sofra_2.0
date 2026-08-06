'use client'

import { useEffect, useState } from 'react'

const KEY = 'sofra_motion'
const STATIC_LOADER_KEY = 'sofra_static_loader'

export function getReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  if (window.localStorage.getItem(KEY) === 'reduced') return true
  if (window.localStorage.getItem(KEY) === 'full') return false
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

export function applyMotion(reduced: boolean) {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-motion', reduced ? 'reduced' : 'full')
}

export function setReducedMotion(reduced: boolean) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(KEY, reduced ? 'reduced' : 'full')
  applyMotion(reduced)
  window.dispatchEvent(new CustomEvent('sofra-motion', { detail: reduced }))
}

export function getStaticLoader(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(STATIC_LOADER_KEY) === 'static'
}

export function setStaticLoader(enabled: boolean) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STATIC_LOADER_KEY, enabled ? 'static' : 'moving')
  window.dispatchEvent(new CustomEvent('sofra-static-loader', { detail: enabled }))
}

export function useStaticLoader(): [boolean, (v: boolean) => void] {
  const [enabled, setLocal] = useState(false)
  useEffect(() => {
    setLocal(getStaticLoader())
    const onChange = (e: Event) => setLocal((e as CustomEvent<boolean>).detail)
    window.addEventListener('sofra-static-loader', onChange)
    return () => window.removeEventListener('sofra-static-loader', onChange)
  }, [])
  return [enabled, setStaticLoader]
}

export function useReducedMotion(): [boolean, (v: boolean) => void] {
  const [reduced, setLocal] = useState(false)
  useEffect(() => {
    const r = getReducedMotion()
    setLocal(r)
    applyMotion(r)
    const onChange = (e: Event) => setLocal((e as CustomEvent<boolean>).detail)
    window.addEventListener('sofra-motion', onChange)
    return () => window.removeEventListener('sofra-motion', onChange)
  }, [])
  return [reduced, setReducedMotion]
}
