'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getCurrentAppUserId } from '@/lib/auth/client-user'

export type SofraUser = { id: string; name: string; phone: string | null; email: string | null; photo_url: string | null }

export function useCurrentUser() {
  const supabase = useMemo(() => createClient(), [])
  const [user, setUser] = useState<SofraUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    async function loadUser() {
      const uid = await getCurrentAppUserId(supabase)
      if (!uid) { if (alive) setLoading(false); return }
      const { data } = await supabase
      .from('users')
      .select('id, name, phone, email, photo_url')
      .eq('id', uid)
      .maybeSingle()
      if (!alive) return
      setUser((data as SofraUser) ?? null)
      setLoading(false)
    }
    void loadUser()
    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      if (!alive) return
      setLoading(true)
      void loadUser()
    })
    return () => {
      alive = false
      listener.subscription.unsubscribe()
    }
  }, [supabase])

  return { user, loading, setUser }
}
