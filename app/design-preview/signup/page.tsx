'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import '@/components/sofra-v2/sofra-v2.css'
import { SignupForm } from '@/components/sofra-v2/SignupForm'

export default function DesignPreviewSignupPage() {
  const router = useRouter()
  const [phone, setPhone] = useState('')

  return <SignupForm phone={phone} onPhoneChange={setPhone} onSubmit={() => router.push('/design-preview/name')} />
}
