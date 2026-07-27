'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Step       = 'status' | 'profile'
type RsvpStatus = 'going' | 'maybe' | 'cant'

const DIETARY = ['Vegetarian','Vegan','Halal','Kosher','Gluten-free','No dairy','Pescatarian']
const NOGOS   = ['Nuts','Shellfish','Pork','Eggs','Cilantro','Mushrooms']
const DRINKS  = ['Cocktails','Wine','Beer','Alcohol-free']

const C = {
  ink:         '#140E10',
  ink2:        '#1E1518',
  burgundy:    '#5C1A1B',
  burgundyLit: '#7A2324',
  cream:       '#F3E9DD',
  dim:         '#B7A493',
  faint:       '#7C6B5F',
  gold:        '#D9A15B',
  rose:        '#C97B6E',
}

export default function RSVPPage({ params }: { params: { id: string } }) {
  const router   = useRouter()
  const supabase = createClient()
  const uidRef   = useRef<string | null>(null)

  const [loading,          setLoading]          = useState(true)
  const [step,             setStep]             = useState<Step>('status')
  const [status,           setStatus]           = useState<RsvpStatus | null>(null)
  const [dietary,          setDietary]          = useState<string[]>([])
  const [avoid,            setAvoid]            = useState<string[]>([])
  const [drinks,           setDrinks]           = useState<string[]>([])
  const [adventurousness,  setAdventurousness]  = useState(50)
  const [prefilled,        setPrefilled]        = useState(false)
  const [hasExistingRsvp,  setHasExistingRsvp]  = useState(false)
  const [submitting,       setSubmitting]       = useState(false)
  const [error,            setError]            = useState('')

  return <div data-testid="rsvp-page" />
}
