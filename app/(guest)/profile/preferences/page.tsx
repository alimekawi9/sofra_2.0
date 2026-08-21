'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { PreferencesReceipt } from '@/components/sofra-v2/PreferencesReceipt'
import {
  normalizeProteinPreferences,
  updateProteinPreferenceSelection,
  type ProteinPreference,
} from '@/lib/protein-preferences'
import {
  normalizeFlavorPreferencesForSubmission,
  updateFlavorPreferenceSelection,
  type FlavorPreference,
} from '@/lib/flavor-preferences'
import '@/components/sofra-v2/sofra-v2.css'

type TasteProfileRow = {
  dietary: string[] | null
  avoid: string[] | null
  protein_anchor: string | null
  protein_preferences: string[] | null
  flavor_preference: string[] | null
  adventurousness: number | null
}

export default function ProfilePreferencesPage() {
  const router = useRouter()
  const supabase = createClient()
  const [userId, setUserId] = useState<string | null>(null)
  const [dietary, setDietary] = useState<string[]>([])
  const [avoid, setAvoid] = useState<string[]>([])
  const [proteinPreferences, setProteinPreferences] = useState<ProteinPreference[]>([])
  const [flavors, setFlavors] = useState<string[]>([])
  const [adventurousness, setAdventurousness] = useState(50)
  const [proteinHint, setProteinHint] = useState(false)
  const [flavorHint, setFlavorHint] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    const stored = localStorage.getItem('sofra_user_id')
    if (!stored) {
      router.replace('/login?next=%2Fprofile%2Fpreferences')
      return
    }
    setUserId(stored)

    void supabase
      .from('taste_profiles')
      .select('dietary,avoid,protein_anchor,protein_preferences,flavor_preference,adventurousness')
      .eq('user_id', stored)
      .maybeSingle()
      .then(({ data, error: loadError }: { data: TasteProfileRow | null; error: { message?: string } | null }) => {
        if (!active) return
        if (loadError) {
          setError('Could not load your preferences. Try again.')
          return
        }
        if (!data) return
        setDietary(data.dietary ?? [])
        setAvoid(data.avoid ?? [])
        setProteinPreferences(normalizeProteinPreferences(data.protein_preferences, data.protein_anchor))
        setFlavors(data.flavor_preference ?? [])
        setAdventurousness(data.adventurousness ?? 50)
      })

    return () => { active = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleValue(current: string[], value: string, update: (next: string[]) => void) {
    update(current.includes(value) ? current.filter((item) => item !== value) : [...current, value])
  }

  function toggleProtein(value: ProteinPreference) {
    const result = updateProteinPreferenceSelection(proteinPreferences, value)
    setProteinPreferences(result.preferences)
    setProteinHint(result.blocked)
  }

  function toggleFlavor(value: FlavorPreference) {
    const result = updateFlavorPreferenceSelection(flavors, value)
    setFlavors(result.preferences)
    setFlavorHint(result.blocked)
  }

  async function save() {
    if (!userId || saving) return
    setSaving(true)
    setError('')
    const { error: saveError } = await supabase.from('taste_profiles').upsert({
      user_id: userId,
      dietary,
      avoid,
      protein_preferences: proteinPreferences,
      flavor_preference: normalizeFlavorPreferencesForSubmission(flavors),
      adventurousness,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    setSaving(false)
    if (saveError) {
      setError('Could not save your preferences. Try again.')
      return
    }
    router.push('/profile')
  }

  return (
    <PreferencesReceipt
      dietary={dietary}
      onToggleDietary={(value) => toggleValue(dietary, value, setDietary)}
      onSelectNoDietaryRestriction={() => setDietary([])}
      avoid={avoid}
      onToggleAvoid={(value) => toggleValue(avoid, value, setAvoid)}
      proteinPreferences={proteinPreferences}
      onToggleProtein={toggleProtein}
      proteinHintVisible={proteinHint}
      flavors={flavors}
      onToggleFlavor={toggleFlavor}
      flavorHintVisible={flavorHint}
      adventurousness={adventurousness}
      onAdventurousnessChange={setAdventurousness}
      onSave={save}
      saveLabel="SAVE MY PREFERENCES"
      saving={saving}
      error={error}
      onBack={() => router.push('/profile')}
      headline={"YOUR TASTES,\nYOUR TABLE"}
    />
  )
}
