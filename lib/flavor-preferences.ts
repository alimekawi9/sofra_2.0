import { FLAVORS } from './theme'

export const MAX_FLAVOR_PREFERENCES = 3

export type FlavorPreference = (typeof FLAVORS)[number]

export type FlavorPreferenceUpdate = {
  preferences: string[]
  blocked: boolean
}

const CANONICAL_FLAVORS = new Set<string>(FLAVORS)

export function updateFlavorPreferenceSelection(
  current: readonly string[],
  value: FlavorPreference
): FlavorPreferenceUpdate {
  if (current.includes(value)) {
    return {
      preferences: current.filter((item) => item !== value),
      blocked: false,
    }
  }

  const selectedCanonicalCount = current.filter((item) => CANONICAL_FLAVORS.has(item)).length
  if (selectedCanonicalCount >= MAX_FLAVOR_PREFERENCES) {
    return { preferences: [...current], blocked: true }
  }

  return { preferences: [...current, value], blocked: false }
}

export function normalizeFlavorPreferencesForSubmission(
  stored: readonly string[] | null | undefined
): FlavorPreference[] {
  if (!Array.isArray(stored)) return []

  const valid = stored.filter((value): value is FlavorPreference => CANONICAL_FLAVORS.has(value))
  return Array.from(new Set(valid)).slice(0, MAX_FLAVOR_PREFERENCES)
}
