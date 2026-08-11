export const PROTEIN_PREFERENCE_OPTIONS = [
  { value: 'beef_lamb', label: 'Beef or lamb' },
  { value: 'chicken', label: 'Chicken' },
  { value: 'fish', label: 'Fish' },
  { value: 'shellfish', label: 'Shellfish' },
  { value: 'vegetable', label: 'Vegetable-forward' },
  { value: 'grain_pasta', label: 'Grains or pasta' },
  { value: 'no_preference', label: 'No preference with a surprise' },
] as const

export type ProteinPreference = (typeof PROTEIN_PREFERENCE_OPTIONS)[number]['value']
export const PROTEIN_PREFERENCE_WEIGHT = 45

export type ProteinPreferenceUpdate = {
  preferences: ProteinPreference[]
  blocked: boolean
}

export function updateProteinPreferenceSelection(
  current: readonly ProteinPreference[],
  value: ProteinPreference
): ProteinPreferenceUpdate {
  if (value === 'no_preference') {
    return { preferences: ['no_preference'], blocked: false }
  }

  const specific = current.filter((item) => item !== 'no_preference')
  if (specific.includes(value)) {
    return {
      preferences: specific.filter((item) => item !== value),
      blocked: false,
    }
  }
  if (specific.length >= 2) {
    return { preferences: [...specific], blocked: true }
  }
  return { preferences: [...specific, value], blocked: false }
}

const LABELS = new Map<string, string>(
  PROTEIN_PREFERENCE_OPTIONS.map((option) => [option.value, option.label])
)

export const PROTEIN_PREFERENCE_TAGS: Record<ProteinPreference, readonly string[]> = {
  beef_lamb: ['beef', 'lamb'],
  chicken: ['chicken'],
  fish: ['fish'],
  shellfish: ['shellfish'],
  vegetable: ['vegetable'],
  grain_pasta: ['grain', 'pasta'],
  no_preference: [],
}

const LEGACY: Record<string, readonly ProteinPreference[]> = {
  beef: ['beef_lamb'],
  lamb: ['beef_lamb'],
  red_meat: ['beef_lamb'],
  chicken: ['chicken'],
  fish: ['fish'],
  shellfish: ['shellfish'],
  vegetarian: ['vegetable'],
  vegetable: ['vegetable'],
  plant_based: ['vegetable'],
  grain: ['grain_pasta'],
  pasta: ['grain_pasta'],
  grain_pasta: ['grain_pasta'],
  no_preference: ['no_preference'],
  'no preference': ['no_preference'],
  // Legacy "seafood" did not distinguish finfish from shellfish. Preserve
  // both possibilities explicitly instead of silently choosing one.
  seafood: ['fish', 'shellfish'],
}

export function normalizeProteinPreferences(
  stored: readonly string[] | null | undefined,
  legacyAnchor?: string | null
): ProteinPreference[] {
  const source = stored?.length ? stored : legacyAnchor ? [legacyAnchor] : []
  const normalized = source.flatMap((value) => {
    const raw = value.trim().toLowerCase().replace(/\s+/g, '_')
    return LEGACY[raw] ?? (LABELS.has(raw) ? [raw as ProteinPreference] : [])
  })
  const unique = Array.from(new Set(normalized)).slice(0, 2)
  return unique.includes('no_preference') ? ['no_preference'] : unique
}

export function formatProteinPreferenceLabel(value: string): string {
  return LABELS.get(value) ?? value
}

export function proteinPreferenceMatchesTags(
  preference: ProteinPreference,
  dishTags: readonly string[]
): boolean {
  if (preference === 'no_preference') return false
  const tags = new Set(dishTags.map((tag) => tag.toLowerCase()))
  return PROTEIN_PREFERENCE_TAGS[preference].some((tag) => tags.has(tag))
}

export function proteinPreferenceFit(
  preferences: readonly ProteinPreference[],
  dishTags: readonly string[]
): number {
  return preferences.some((preference) => proteinPreferenceMatchesTags(preference, dishTags)) ? 1 : 0
}

export function proteinPreferenceWeightedScore(
  preferencesByGuest: readonly (readonly ProteinPreference[])[],
  dishTags: readonly string[]
): number {
  if (preferencesByGuest.length === 0) return 0
  const matches = preferencesByGuest.reduce(
    (total, preferences) => total + proteinPreferenceFit(preferences, dishTags),
    0
  )
  return (matches / preferencesByGuest.length) * PROTEIN_PREFERENCE_WEIGHT
}
