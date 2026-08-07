import {
  MAX_FLAVOR_PREFERENCES,
  normalizeFlavorPreferencesForSubmission,
  updateFlavorPreferenceSelection,
} from '@/lib/flavor-preferences'

describe('flavor preference selection', () => {
  it('allows three exact raw values, blocks a fourth, then permits replacement after removal', () => {
    let current: string[] = []
    for (const value of ['Umami', 'Spicy', 'Plain & clean'] as const) {
      const update = updateFlavorPreferenceSelection(current, value)
      expect(update.blocked).toBe(false)
      current = update.preferences
    }
    expect(current).toEqual(['Umami', 'Spicy', 'Plain & clean'])
    expect(current).toHaveLength(MAX_FLAVOR_PREFERENCES)

    const blocked = updateFlavorPreferenceSelection(current, 'Saucy')
    expect(blocked).toEqual({ preferences: current, blocked: true })

    const removed = updateFlavorPreferenceSelection(current, 'Spicy')
    expect(removed).toEqual({ preferences: ['Umami', 'Plain & clean'], blocked: false })

    const replacement = updateFlavorPreferenceSelection(removed.preferences, 'Saucy')
    expect(replacement).toEqual({ preferences: ['Umami', 'Plain & clean', 'Saucy'], blocked: false })
  })

  it('normalizes legacy data only for submission using the first three unique canonical values', () => {
    expect(normalizeFlavorPreferencesForSubmission([
      'legacy-value',
      'Umami',
      'Spicy',
      'Umami',
      'Smoky',
      'Herby',
    ])).toEqual(['Umami', 'Spicy', 'Smoky'])
    expect(normalizeFlavorPreferencesForSubmission(null)).toEqual([])
  })
})
