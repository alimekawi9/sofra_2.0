export type TasteProfile = {
  name: string
  dietary: string[]
  avoid: string[]
  drinks: string[]
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
  drinksCounts: { label: string; count: number }[]
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
  'Vegetarian', 'Vegan', 'No pork/alcohol', 'Kosher',
  'Gluten-free', 'No dairy', 'Pescatarian',
] as const
const STRICT_DIETS: Set<string> = new Set(STRICT_DIET_LIST)

export function buildIntel(guests: TasteProfile[]): TableIntel {
  if (guests.length === 0) {
    return {
      hardLimits: [], dietMix: [], drinksCounts: [],
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

  // dietMix — soft dietary values, descending count
  const dietMixMap = new Map<string, number>()
  for (const g of guests) {
    for (const d of g.dietary) {
      if (STRICT_DIETS.has(d)) continue
      dietMixMap.set(d, (dietMixMap.get(d) ?? 0) + 1)
    }
  }
  const dietMix = Array.from(dietMixMap.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)

  // drinksCounts — descending
  const drinksMap = new Map<string, number>()
  for (const g of guests) {
    for (const d of g.drinks) {
      drinksMap.set(d, (drinksMap.get(d) ?? 0) + 1)
    }
  }
  const drinksCounts = Array.from(drinksMap.entries())
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
    guests.length, hardLimits, drinksCounts, avgAdventurousness, adventurousnessLabel
  )

  return {
    hardLimits, dietMix, drinksCounts,
    avgAdventurousness, adventurousnessLabel,
    brief, guestCount: guests.length,
  }
}

function buildBrief(
  guestCount: number,
  hardLimits: HardLimit[],
  drinksCounts: { label: string; count: number }[],
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

  if (drinksCounts.length > 0) {
    parts.push(`${drinksCounts[0].label.toLowerCase()} dominant`)
  }

  parts.push(`${label} table (avg ${avg})`)

  return `${guestCount} guest${guestCount !== 1 ? 's' : ''} — ${parts.join(', ')}.`
}
