import { normalizeProteinPreferences, type ProteinPreference } from './protein-preferences'

export type TasteProfile = {
  name: string
  dietary: string[]
  avoid: string[]
  proteinAnchor?: string | null
  proteinPreferences?: string[]
  flavorPreference?: string[]
  adventurousness: number
}

export type HardLimit = {
  label: string
  guests: string[]
  type: 'allergy' | 'diet'
}

// Named TableIntel (not Intel) to match menu-draft spec and all downstream imports.
export type TableIntel = {
  hardLimits: HardLimit[]
  dietMix: { label: string; count: number }[]
  proteinCounts: { label: string; count: number }[]
  proteinPreferencesByGuest: ProteinPreference[][]
  flavorCounts: { label: string; count: number }[]
  avgAdventurousness: number
  adventurousnessLabel: 'cautious' | 'balanced' | 'adventurous' | 'daring'
  brief: string
  guestCount: number
}

// Every strict diet is a substitution-case (not a hard block on dish
// selection). Genuine allergies live in guest.avoid, not here. We used to
// keep Gluten-free / No dairy / Pescatarian as soft "dietMix" info because
// they had no downstream effect — now they trigger per-guest substitutes on
// dishes that don't satisfy them.
export const STRICT_DIET_LIST = [
  'Vegetarian', 'Vegan', 'No pork', 'Kosher',
  'Gluten-free', 'No dairy', 'Pescatarian',
] as const
const STRICT_DIETS: Set<string> = new Set(STRICT_DIET_LIST)

// Lean phrasing for the brief when a table majority (>50%) shares a protein
// anchor or flavor preference. "No preference" is never announced as a lean.
const PROTEIN_LEAN_PHRASE: Record<string, string> = {
  beef_lamb: 'beef-or-lamb-forward',
  chicken: 'chicken-forward',
  fish: 'fish-forward',
  shellfish: 'shellfish-forward',
  vegetable: 'vegetable-forward',
  grain_pasta: 'grain-or-pasta-forward',
  Beef: 'beef-forward',
  Chicken: 'chicken-forward',
  Fish: 'fish-forward',
  Pork: 'pork-forward',
  Lamb: 'lamb-forward',
  Vegetarian: 'vegetarian-forward',
}

export function buildIntel(guests: TasteProfile[]): TableIntel {
  if (guests.length === 0) {
    return {
      hardLimits: [], dietMix: [], proteinCounts: [], proteinPreferencesByGuest: [], flavorCounts: [],
      avgAdventurousness: 0,
      // 'cautious' is a safe sentinel — the brief returns 'No guest data yet.' for this case,
      // so adventurousnessLabel is never surfaced to users when guestCount is 0.
      adventurousnessLabel: 'cautious',
      brief: 'No guest data yet.', guestCount: 0,
    }
  }

  // allergy HardLimits — one per distinct avoid value
  const allergyMap = new Map<string, string[]>()
  for (const g of guests) {
    for (const a of g.avoid) {
      if (!allergyMap.has(a)) allergyMap.set(a, [])
      allergyMap.get(a)!.push(g.name)
    }
  }
  const allergyLimits: HardLimit[] = Array.from(allergyMap.entries()).map(([label, gs]) => ({
    label, guests: gs, type: 'allergy',
  }))

  // diet HardLimits — strict diets only
  const dietMap = new Map<string, string[]>()
  for (const g of guests) {
    for (const d of g.dietary) {
      if (!STRICT_DIETS.has(d)) continue
      if (!dietMap.has(d)) dietMap.set(d, [])
      dietMap.get(d)!.push(g.name)
    }
  }
  const dietLimits: HardLimit[] = Array.from(dietMap.entries()).map(([label, gs]) => ({
    label, guests: gs, type: 'diet',
  }))

  const hardLimits = [...allergyLimits, ...dietLimits]

  // dietMix is a descriptive breakdown of every recorded dietary preference.
  // Strict diets also appear in hardLimits; excluding them here made a table
  // with real Vegetarian/No pork data incorrectly render the empty state.
  const dietMixMap = new Map<string, number>()
  for (const g of guests) {
    for (const d of g.dietary) {
      dietMixMap.set(d, (dietMixMap.get(d) ?? 0) + 1)
    }
  }
  const dietMix = Array.from(dietMixMap.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)

  // proteinCounts — descending; guests with no anchor set are omitted
  const proteinMap = new Map<string, number>()
  const proteinPreferencesByGuest = guests.map((guest) =>
    normalizeProteinPreferences(guest.proteinPreferences, guest.proteinAnchor)
  )
  for (const preferences of proteinPreferencesByGuest) {
    for (const preference of Array.from(new Set(preferences))) {
      if (preference === 'no_preference') continue
      proteinMap.set(preference, (proteinMap.get(preference) ?? 0) + 1)
    }
  }
  const proteinCounts = Array.from(proteinMap.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)

  // flavorCounts — descending; each guest can contribute up to 3 flavors
  const flavorMap = new Map<string, number>()
  for (const g of guests) {
    for (const f of g.flavorPreference ?? []) {
      flavorMap.set(f, (flavorMap.get(f) ?? 0) + 1)
    }
  }
  const flavorCounts = Array.from(flavorMap.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)

  const avgAdventurousness = Math.round(
    guests.reduce((s, g) => s + g.adventurousness, 0) / guests.length
  )

  const adventurousnessLabel: TableIntel['adventurousnessLabel'] =
    avgAdventurousness < 40 ? 'cautious'
    : avgAdventurousness < 60 ? 'balanced'
    : avgAdventurousness < 78 ? 'adventurous'
    : 'daring'

  const brief = buildBrief(
    guests.length, hardLimits, proteinCounts, flavorCounts, avgAdventurousness, adventurousnessLabel
  )

  return {
    hardLimits, dietMix, proteinCounts, proteinPreferencesByGuest, flavorCounts,
    avgAdventurousness, adventurousnessLabel,
    brief, guestCount: guests.length,
  }
}

function buildBrief(
  guestCount: number,
  hardLimits: HardLimit[],
  proteinCounts: { label: string; count: number }[],
  flavorCounts: { label: string; count: number }[],
  avg: number,
  label: TableIntel['adventurousnessLabel']
): string {
  const parts: string[] = []

  const diets = hardLimits.filter(h => h.type === 'diet')
  if (diets.length > 0) {
    parts.push(diets.map(h => `${h.guests.length} ${h.label.toLowerCase()}`).join(', '))
  }

  const allergies = hardLimits.filter(h => h.type === 'allergy')
  if (allergies.length > 0) {
    const uniqueGuests = Array.from(new Set(allergies.flatMap(h => h.guests)))
    const labels = allergies.map(h => h.label.toLowerCase())
    const labelStr = labels.length === 1
      ? labels[0]
      : labels.slice(0, -1).join(', ') + ' & ' + labels[labels.length - 1]
    parts.push(`${labelStr} off-limits across ${uniqueGuests.length} guest${uniqueGuests.length !== 1 ? 's' : ''}`)
  }

  if (hardLimits.length === 0) parts.push('no hard limits')

  const lean = leanPart(proteinCounts, flavorCounts, guestCount)
  if (lean) parts.push(lean)

  parts.push(`${label} table (avg ${avg})`)

  return `${guestCount} guest${guestCount !== 1 ? 's' : ''} — ${parts.join(', ')}.`
}

function leanPart(
  proteinCounts: { label: string; count: number }[],
  flavorCounts: { label: string; count: number }[],
  guestCount: number
): string | null {
  const topProtein = proteinCounts[0]
  const proteinLean =
    topProtein && topProtein.label !== 'no_preference' && topProtein.label !== 'No preference' && topProtein.count > guestCount / 2
      ? PROTEIN_LEAN_PHRASE[topProtein.label] ?? topProtein.label.toLowerCase()
      : null

  const topFlavor = flavorCounts[0]
  const flavorLean =
    topFlavor && topFlavor.count > guestCount / 2
      ? `${topFlavor.label.toLowerCase()} flavors`
      : null

  if (proteinLean && flavorLean) return `leans ${proteinLean} with ${flavorLean}`
  if (proteinLean) return `leans ${proteinLean}`
  if (flavorLean) return `leans toward ${flavorLean}`
  return null
}
