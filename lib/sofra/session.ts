'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

/** The app's deliberate MVP session model: name + phone, id in localStorage. */
export const UID_KEY = 'sofra_user_id'

export function getUid(): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(UID_KEY)
}
export function setUid(id: string) {
  window.localStorage.setItem(UID_KEY, id)
}
export function clearUid() {
  window.localStorage.removeItem(UID_KEY)
}

export type SofraUser = { id: string; name: string; phone: string; photo_url: string | null }

export function useCurrentUser() {
  const [user, setUser] = useState<SofraUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    let alive = true
    const uid = getUid()
    if (!uid) {
      setLoading(false)
      return
    }
    supabase
      .from('users')
      .select('id, name, phone, photo_url')
      .eq('id', uid)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive) return
        setUser((data as SofraUser) ?? null)
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  return { user, loading, setUser }
}
