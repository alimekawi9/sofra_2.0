'use client'

import { useState } from 'react'
import '@/components/sofra-v2/sofra-v2.css'
import { SignupForm } from '@/components/sofra-v2/SignupForm'

export default function DesignPreviewSignupPage() {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')

  function handleSubmit() {
    console.log('signup submitted — preview only', {
      name: name.trim(),
      phone: phone.trim(),
    })
  }

  return (
    <SignupForm
      name={name}
      phone={phone}
      onNameChange={setName}
      onPhoneChange={setPhone}
      onSubmit={handleSubmit}
    />
  )
}
