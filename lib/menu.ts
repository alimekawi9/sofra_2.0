import type { TableIntel } from './intel'

export type Slot = 'start' | 'sea' | 'land' | 'green' | 'finish'
export type CourseOrigin = 'signature' | 'pantry-composed' | 'empty'

export type Signature = {
  id: string
  name: string
  tags: string[]
  contains_allergens: string[]
  slot: Slot | null
}

export type PantryItem = {
  id: string
  name: string
}

export type Exclusion = {
  guest: string
  reason: string
}

export type Course = {
  slot: Slot
  slotLabel: string
  dishName: string
  origin: CourseOrigin
  sourceId: string | null
  excludes: Exclusion[]
}

export const SLOTS: Slot[] = ['start', 'sea', 'land', 'green', 'finish']

export const SLOT_LABELS: Record<Slot, string> = {
  start:  'To Start',
  sea:    'Main — Sea',
  land:   'Main — Land',
  green:  'Main — Green',
  finish: 'To Finish',
}

export function scoreDish(dish: Signature | PantryItem, intel: TableIntel): Exclusion[] {
  const seen = new Set<string>()
  const result: Exclusion[] = []

  if ('contains_allergens' in dish) {
    // Signature path
    for (const allergen of dish.contains_allergens) {
      const limit = intel.hardLimits.find(
        h => h.type === 'allergy' && h.label.toLowerCase() === allergen.toLowerCase()
      )
      if (!limit) continue
      for (const guestName of limit.guests) {
        if (seen.has(guestName)) continue
        seen.add(guestName)
        result.push({ guest: guestName, reason: `contains ${allergen.toLowerCase()}` })
      }
    }
    for (const limit of intel.hardLimits.filter(h => h.type === 'diet')) {
      const tag = limit.label.toLowerCase()
      if (dish.tags.map(t => t.toLowerCase()).includes(tag)) continue
      for (const guestName of limit.guests) {
        if (seen.has(guestName)) continue
        seen.add(guestName)
        result.push({ guest: guestName, reason: `not ${tag}` })
      }
    }
  } else {
    // Pantry item path — v1 approximate substring heuristic (not medical-grade)
    for (const limit of intel.hardLimits.filter(h => h.type === 'allergy')) {
      const nameLC  = dish.name.toLowerCase()
      const labelLC = limit.label.toLowerCase()
      if (!nameLC.includes(labelLC)) continue
      for (const guestName of limit.guests) {
        if (seen.has(guestName)) continue
        seen.add(guestName)
        result.push({ guest: guestName, reason: `may contain ${labelLC}` })
      }
    }
    for (const limit of intel.hardLimits.filter(h => h.type === 'diet')) {
      for (const guestName of limit.guests) {
        if (seen.has(guestName)) continue
        seen.add(guestName)
        result.push({ guest: guestName, reason: 'pantry dish — diet-safe status unknown' })
      }
    }
  }

  return result
}

type Candidate = {
  dish: Signature | PantryItem
  origin: 'signature' | 'pantry-composed'
  sourceId: string
  dishName: string
  exclusions: Exclusion[]
}

export function draftCourse(
  slot: Slot,
  intel: TableIntel,
  signatures: Signature[],
  pantry: PantryItem[],
  exclude?: Set<string>
): Course {
  const slotLabel = SLOT_LABELS[slot]

  const candidates: Candidate[] = [
    ...signatures
      .filter(s => s.slot === slot)
      .map(s => ({
        dish: s,
        origin: 'signature' as const,
        sourceId: s.id,
        dishName: s.name,
        exclusions: scoreDish(s, intel),
      })),
    ...pantry.map(item => ({
      dish: item,
      origin: 'pantry-composed' as const,
      sourceId: item.id,
      dishName: `Chef's ${item.name}`,
      exclusions: scoreDish(item, intel),
    })),
  ]

  const eligible = exclude
    ? candidates.filter(c => !exclude.has(c.sourceId))
    : candidates

  if (eligible.length === 0) {
    return { slot, slotLabel, dishName: '', origin: 'empty', sourceId: null, excludes: [] }
  }

  const minExclusions = Math.min(...eligible.map(c => c.exclusions.length))
  const pool = minExclusions === 0
    ? eligible.filter(c => c.exclusions.length === 0)
    : eligible

  pool.sort((a, b) => {
    if (a.exclusions.length !== b.exclusions.length) return a.exclusions.length - b.exclusions.length
    if (a.origin !== b.origin) return a.origin === 'signature' ? -1 : 1
    return a.dishName.localeCompare(b.dishName)
  })

  const winner = pool[0]
  return {
    slot,
    slotLabel,
    dishName: winner.dishName,
    origin: winner.origin,
    sourceId: winner.sourceId,
    excludes: winner.exclusions,
  }
}

export function draftMenu(
  intel: TableIntel,
  signatures: Signature[],
  pantry: PantryItem[]
): Course[] {
  return SLOTS.map(slot => draftCourse(slot, intel, signatures, pantry))
}
