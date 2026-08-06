'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import '@/components/sofra-v2/sofra-v2.css'
import { NamePlateForm } from '@/components/sofra-v2/NamePlateForm'

export default function DesignPreviewNamePage() {
  const router = useRouter()
  const [name, setName] = useState('')

  return <NamePlateForm name={name} onNameChange={setName} onSubmit={() => router.push('/design-preview/preferences')} />
}
