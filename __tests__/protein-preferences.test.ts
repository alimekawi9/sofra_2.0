import { formatTagLabel } from '@/lib/tag-format'
import {
  formatProteinPreferenceLabel,
  normalizeProteinPreferences,
  proteinPreferenceFit,
  proteinPreferenceMatchesTags,
  proteinPreferenceWeightedScore,
  updateProteinPreferenceSelection,
} from '@/lib/protein-preferences'

describe('protein preference mapping', () => {
  test.each([
    ['beef_lamb', ['beef']], ['beef_lamb', ['lamb']],
    ['chicken', ['chicken']], ['fish', ['fish']],
    ['vegetable', ['vegetable']], ['grain_pasta', ['grain']],
    ['grain_pasta', ['pasta']], ['shellfish', ['shellfish']],
  ] as const)('%s matches its canonical base tags', (preference, tags) => {
    expect(proteinPreferenceMatchesTags(preference, tags)).toBe(true)
  })

  it('keeps no preference neutral', () => {
    expect(proteinPreferenceFit(['no_preference'], ['fish', 'shellfish'])).toBe(0)
  })

  it('awards only one match when either or both selected preferences match', () => {
    expect(proteinPreferenceFit(['fish', 'shellfish'], ['fish'])).toBe(1)
    expect(proteinPreferenceFit(['fish', 'shellfish'], ['fish', 'shellfish'])).toBe(1)
    expect(proteinPreferenceWeightedScore([['fish', 'shellfish']], ['fish', 'shellfish'])).toBe(45)
  })

  it('maps documented legacy values', () => {
    expect(normalizeProteinPreferences(null, null)).toEqual([])
    expect(normalizeProteinPreferences(['fish', 'grain_pasta'], null)).toEqual(['fish', 'grain_pasta'])
    expect(normalizeProteinPreferences([], 'Beef')).toEqual(['beef_lamb'])
    expect(normalizeProteinPreferences([], 'Lamb')).toEqual(['beef_lamb'])
    expect(normalizeProteinPreferences([], 'plant_based')).toEqual(['vegetable'])
    expect(normalizeProteinPreferences([], 'seafood')).toEqual(['fish', 'shellfish'])
  })

  it('applies the same selection rules to create and edit state', () => {
    expect(updateProteinPreferenceSelection([], 'fish')).toEqual({
      preferences: ['fish'], blocked: false,
    })
    expect(updateProteinPreferenceSelection(['fish'], 'grain_pasta')).toEqual({
      preferences: ['fish', 'grain_pasta'], blocked: false,
    })
    expect(updateProteinPreferenceSelection(['fish', 'grain_pasta'], 'chicken')).toEqual({
      preferences: ['fish', 'grain_pasta'], blocked: true,
    })
    expect(updateProteinPreferenceSelection(['fish', 'grain_pasta'], 'fish')).toEqual({
      preferences: ['grain_pasta'], blocked: false,
    })
    expect(updateProteinPreferenceSelection(['fish'], 'no_preference')).toEqual({
      preferences: ['no_preference'], blocked: false,
    })
    expect(updateProteinPreferenceSelection(['no_preference'], 'fish')).toEqual({
      preferences: ['fish'], blocked: false,
    })
  })

  it('uses semantic labels without mutating raw values', () => {
    const raw = 'grain_pasta'
    expect(formatProteinPreferenceLabel(raw)).toBe('Grains or pasta')
    expect(formatTagLabel(raw)).toBe('Grain Pasta')
    expect(raw).toBe('grain_pasta')
  })

  it('keeps protein shellfish matching separate from allergen storage', () => {
    expect(proteinPreferenceMatchesTags('shellfish', ['shellfish'])).toBe(true)
    expect(['shellfish']).toEqual(['shellfish'])
  })
})
