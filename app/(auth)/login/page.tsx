'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { joinHref, safeNext } from '@/lib/navigation'

export default function LoginCompatibilityPage() {
  return <Suspense fallback={null}><RedirectToJoin /></Suspense>
}

function RedirectToJoin() {
  const router = useRouter()
  const searchParams = useSearchParams()
  useEffect(() => { router.replace(joinHref(safeNext(searchParams?.get('next') ?? null))) }, [router, searchParams])
  return null
}
