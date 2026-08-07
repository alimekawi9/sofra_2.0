'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import '@/components/sofra-v2/sofra-v2.css'
import { SignupForm } from '@/components/sofra-v2/SignupForm'
import {readPreviewSession,updatePreviewSession} from '@/components/sofra-v2/preview-session'

export default function DesignPreviewSignupPage() {
  const router = useRouter()
  const [phone, setPhone] = useState(() => readPreviewSession().phone)

  return <SignupForm phone={phone} onPhoneChange={setPhone} onSubmit={() => {updatePreviewSession({phone});router.push('/design-preview/name')}} />
}
