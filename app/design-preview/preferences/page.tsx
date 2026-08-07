'use client'

import { useState } from 'react'
import '@/components/sofra-v2/sofra-v2.css'
import { PreferencesReceipt } from '@/components/sofra-v2/PreferencesReceipt'
import {
  updateProteinPreferenceSelection,
  type ProteinPreference,
} from '@/lib/protein-preferences'
import { updateFlavorPreferenceSelection, type FlavorPreference } from '@/lib/flavor-preferences'
import {useRouter} from 'next/navigation'
import {updatePreviewSession} from '@/components/sofra-v2/preview-session'

function toggleValue(current: readonly string[], value: string): string[] {
  return current.includes(value)
    ? current.filter((item) => item !== value)
    : [...current, value]
}

export default function DesignPreviewPreferencesPage() {
  const router=useRouter()
  const [dietary, setDietary] = useState<string[]>([])
  const [avoid, setAvoid] = useState<string[]>([])
  const [proteinPreferences, setProteinPreferences] = useState<ProteinPreference[]>([])
  const [proteinHintVisible, setProteinHintVisible] = useState(false)
  const [flavors, setFlavors] = useState<string[]>([])
  const [flavorHintVisible, setFlavorHintVisible] = useState(false)
  const [adventurousness, setAdventurousness] = useState(50)

  function handleToggleProtein(value: ProteinPreference) {
    const update = updateProteinPreferenceSelection(proteinPreferences, value)
    if (update.blocked) {
      setProteinHintVisible(true)
      return
    }
    setProteinHintVisible(false)
    setProteinPreferences(update.preferences)
  }

  function handleToggleFlavor(value: FlavorPreference) {
    const update = updateFlavorPreferenceSelection(flavors, value)
    setFlavorHintVisible(update.blocked)
    if (!update.blocked) setFlavors(update.preferences)
  }

  return (
    <PreferencesReceipt
      dietary={dietary}
      onToggleDietary={(value) => setDietary((current) => toggleValue(current, value))}
      onSelectNoDietaryRestriction={() => setDietary([])}
      avoid={avoid}
      onToggleAvoid={(value) => setAvoid((current) => toggleValue(current, value))}
      proteinPreferences={proteinPreferences}
      onToggleProtein={handleToggleProtein}
      proteinHintVisible={proteinHintVisible}
      flavors={flavors}
      onToggleFlavor={handleToggleFlavor}
      flavorHintVisible={flavorHintVisible}
      adventurousness={adventurousness}
      onAdventurousnessChange={setAdventurousness}
      onSave={() => {updatePreviewSession({preferencesSubmitted:true,role:'guest'});router.push('/design-preview/events/demo?role=guest')}}
    />
  )
}
