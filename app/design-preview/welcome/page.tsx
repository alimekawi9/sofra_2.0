'use client'

import '@/components/sofra-v2/sofra-v2.css'
import { useRouter } from 'next/navigation'
import { WelcomeCard } from '@/components/sofra-v2/WelcomeCard'

export default function DesignPreviewWelcomePage() {
  const router = useRouter()

  return <WelcomeCard onYalla={() => router.push('/design-preview/signup')} />
}
