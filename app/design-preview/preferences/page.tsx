'use client'

import { useState } from 'react'
import '@/components/sofra-v2/sofra-v2.css'
import { PreferencesReceipt } from '@/components/sofra-v2/PreferencesReceipt'
import { ThemeToggle } from '@/components/sofra-v2/ThemeToggle'
import {
  updateProteinPreferenceSelection,
  type ProteinPreference,
} from '@/lib/protein-preferences'

function toggleValue(current: readonly string[], value: string): string[] {
  return current.includes(value)
    ? current.filter((item) => item !== value)
    : [...current, value]
}

export default function DesignPreviewPreferencesPage() {
  const [dietary, setDietary] = useState<string[]>([])
  const [avoid, setAvoid] = useState<string[]>([])
  const [proteinPreferences, setProteinPreferences] = useState<ProteinPreference[]>([])
  const [proteinHintVisible, setProteinHintVisible] = useState(false)
  const [flavors, setFlavors] = useState<string[]>([])
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

  return (
    <>
      <ThemeToggle />
      <PreferencesReceipt
        dietary={dietary}
        onToggleDietary={(value) => setDietary((current) => toggleValue(current, value))}
        avoid={avoid}
        onToggleAvoid={(value) => setAvoid((current) => toggleValue(current, value))}
        proteinPreferences={proteinPreferences}
        onToggleProtein={handleToggleProtein}
        proteinHintVisible={proteinHintVisible}
        flavors={flavors}
        onToggleFlavor={(value) => setFlavors((current) => toggleValue(current, value))}
        adventurousness={adventurousness}
        onAdventurousnessChange={setAdventurousness}
        onSave={() => undefined}
      />
    </>
  )
}
