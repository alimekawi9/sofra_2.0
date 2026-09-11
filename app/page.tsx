'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { C } from '@/lib/theme'
import { createClient } from '@/lib/supabase/client'

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    void createClient().auth.getUser().then(({ data }) => router.replace(data.user ? '/events' : '/login'))
  }, [router])

  return <div style={{ minHeight: '100vh', background: C.ink }} />
}
