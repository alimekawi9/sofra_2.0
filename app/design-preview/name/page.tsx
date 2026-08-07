'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import '@/components/sofra-v2/sofra-v2.css'
import { NamePlateForm } from '@/components/sofra-v2/NamePlateForm'
import {readPreviewSession,updatePreviewSession} from '@/components/sofra-v2/preview-session'

export default function DesignPreviewNamePage() {
  const router = useRouter()
  const [name, setName] = useState(() => readPreviewSession().name)

  return <NamePlateForm name={name} onNameChange={setName} onSubmit={() => {updatePreviewSession({name,role:'guest'});router.push('/design-preview/events')}} />
}
