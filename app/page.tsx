'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { C } from '@/lib/theme'

const STORAGE_KEY = 'sofra_user_id'

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    router.replace(stored ? '/events' : '/join')
  }, [router])

  return <div style={{ minHeight: '100vh', background: C.ink }} />
}
