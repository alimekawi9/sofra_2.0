import { buildIntel } from '@/lib/intel'
import type { TasteProfile } from '@/lib/intel'

const guest = (overrides: Partial<TasteProfile> & { name: string }): TasteProfile => ({
  dietary: [],
  avoid: [],
  adventurousness: 50,
  ...overrides,
})

describe('buildIntel', () => {
  test('returns safe defaults for empty guest list', () => {
    const intel = buildIntel([])
    expect(intel.guestCount).toBe(0)
    expect(intel.hardLimits).toEqual([])
    expect(intel.proteinCounts).toEqual([])
    expect(intel.flavorCounts).toEqual([])
    expect(intel.avgAdventurousness).toBe(0)
    expect(intel.brief).toBe('No guest data yet.')
  })

  test('guestCount equals input array length', () => {
    const intel = buildIntel([guest({ name: 'A' }), guest({ name: 'B' })])
    expect(intel.guestCount).toBe(2)
  })

  test('creates one allergy HardLimit per distinct avoid label', () => {
    const intel = buildIntel([
      guest({ name: 'Ali', avoid: ['Nuts', 'Shellfish'] }),
      guest({ name: 'Sam', avoid: ['Nuts'] }),
    ])
    const nuts = intel.hardLimits.find(h => h.label === 'Nuts' && h.type === 'allergy')
    expect(nuts?.guests).toEqual(expect.arrayContaining(['Ali', 'Sam']))
    const shellfish = intel.hardLimits.find(h => h.label === 'Shellfish' && h.type === 'allergy')
    expect(shellfish?.guests).toEqual(['Ali'])
  })

  test('creates diet HardLimit for every strict diet the guest declared', () => {
    const intel = buildIntel([
      guest({ name: 'Sara', dietary: ['Vegetarian', 'Gluten-free'] }),
    ])
    expect(intel.hardLimits.some(h => h.label === 'Vegetarian' && h.type === 'diet')).toBe(true)
    expect(intel.hardLimits.some(h => h.label === 'Gluten-free' && h.type === 'diet')).toBe(true)
  })

  test('allergy HardLimits appear before diet HardLimits', () => {
    const intel = buildIntel([
      guest({ name: 'A', avoid: ['Nuts'], dietary: ['Vegan'] }),
    ])
    const firstAllergyIdx = intel.hardLimits.findIndex(h => h.type === 'allergy')
    const firstDietIdx    = intel.hardLimits.findIndex(h => h.type === 'diet')
    expect(firstAllergyIdx).toBeLessThan(firstDietIdx)
  })

  test('dietMix includes strict diets as recorded preferences while hard limits remain', () => {
    const intel = buildIntel([
      guest({ name: 'A', dietary: ['Gluten-free'] }),
      guest({ name: 'B', dietary: ['Halal'] }),
      guest({ name: 'C', dietary: ['Vegan'] }),
    ])
    expect(intel.dietMix.some(d => d.label === 'Gluten-free')).toBe(true)
    expect(intel.dietMix.some(d => d.label === 'Vegan')).toBe(true)
    expect(intel.dietMix.some(d => d.label === 'Halal')).toBe(true)
    expect(intel.hardLimits.some(d => d.label === 'Gluten-free')).toBe(true)
    expect(intel.hardLimits.some(d => d.label === 'Vegan')).toBe(true)
  })

  test('aggregates diet, protein, and flavor values across multiple guests and ignores empty values', () => {
    const rawProtein = 'Fish'
    const rawFlavor = 'Fresh'
    const intel = buildIntel([
      guest({ name: 'A', dietary: ['Vegetarian'], proteinAnchor: rawProtein, flavorPreference: [rawFlavor], adventurousness: 40 }),
      guest({ name: 'B', dietary: ['Vegetarian'], proteinAnchor: rawProtein, flavorPreference: [rawFlavor, 'Rich'], adventurousness: 60 }),
      guest({ name: 'C', dietary: [], proteinAnchor: null, flavorPreference: [], adventurousness: 50 }),
    ])

    expect(intel.dietMix).toContainEqual({ label: 'Vegetarian', count: 2 })
    expect(intel.proteinCounts).toContainEqual({ label: 'fish', count: 2 })
    expect(intel.flavorCounts).toEqual(expect.arrayContaining([
      { label: rawFlavor, count: 2 },
      { label: 'Rich', count: 1 },
    ]))
    expect(intel.avgAdventurousness).toBe(50)
    expect(intel.hardLimits.some((limit) => limit.label === 'Vegetarian')).toBe(true)
    expect(rawProtein).toBe('Fish')
    expect(rawFlavor).toBe('Fresh')
  })

  test('proteinCounts groups guest protein anchors, sorted descending', () => {
    const intel = buildIntel([
      guest({ name: 'A', proteinAnchor: 'Fish' }),
      guest({ name: 'B', proteinAnchor: 'Fish' }),
      guest({ name: 'C', proteinAnchor: 'Chicken' }),
    ])
    expect(intel.proteinCounts[0]).toEqual({ label: 'fish', count: 2 })
    expect(intel.proteinCounts[1]).toEqual({ label: 'chicken', count: 1 })
  })

  test('proteinCounts omits guests with no anchor set', () => {
    const intel = buildIntel([guest({ name: 'A' })])
    expect(intel.proteinCounts).toEqual([])
  })

  test('flavorCounts counts each guest once per selected flavor, sorted descending', () => {
    const intel = buildIntel([
      guest({ name: 'A', flavorPreference: ['Fresh', 'Rich', 'Spicy'] }),
      guest({ name: 'B', flavorPreference: ['Fresh'] }),
    ])
    expect(intel.flavorCounts[0]).toEqual({ label: 'Fresh', count: 2 })
    expect(intel.flavorCounts.find(f => f.label === 'Rich')).toEqual({ label: 'Rich', count: 1 })
    expect(intel.flavorCounts.find(f => f.label === 'Spicy')).toEqual({ label: 'Spicy', count: 1 })
  })

  test('avgAdventurousness is rounded mean', () => {
    const intel = buildIntel([
      guest({ name: 'A', adventurousness: 40 }),
      guest({ name: 'B', adventurousness: 60 }),
    ])
    expect(intel.avgAdventurousness).toBe(50)
  })

  test('adventurousnessLabel breakpoints', () => {
    expect(buildIntel([guest({ name: 'A', adventurousness: 30 })]).adventurousnessLabel).toBe('cautious')
    expect(buildIntel([guest({ name: 'A', adventurousness: 50 })]).adventurousnessLabel).toBe('balanced')
    expect(buildIntel([guest({ name: 'A', adventurousness: 70 })]).adventurousnessLabel).toBe('adventurous')
    expect(buildIntel([guest({ name: 'A', adventurousness: 90 })]).adventurousnessLabel).toBe('daring')
  })

  test('brief includes guestCount, diet, allergy, and adventurousness', () => {
    const intel = buildIntel([
      guest({ name: 'Ali', avoid: ['Nuts'], adventurousness: 54 }),
      guest({ name: 'Sara', dietary: ['Vegan'], adventurousness: 54 }),
    ])
    expect(intel.brief).toContain('2 guests')
    expect(intel.brief).toContain('vegan')
    expect(intel.brief).toContain('nuts')
    expect(intel.brief).toContain('balanced')
    expect(intel.brief).toContain('54')
  })

  test('brief says "no hard limits" when there are none', () => {
    const intel = buildIntel([guest({ name: 'A', adventurousness: 50 })])
    expect(intel.brief).toContain('no hard limits')
  })

  test('brief mentions dominant protein lean when >50% of guests share it', () => {
    const intel = buildIntel([
      guest({ name: 'A', proteinAnchor: 'Fish' }),
      guest({ name: 'B', proteinAnchor: 'Fish' }),
      guest({ name: 'C', proteinAnchor: 'Chicken' }),
    ])
    expect(intel.brief).toContain('fish-forward')
  })

  test('brief does not mention a protein lean when no majority exists', () => {
    const intel = buildIntel([
      guest({ name: 'A', proteinAnchor: 'Fish' }),
      guest({ name: 'B', proteinAnchor: 'Chicken' }),
    ])
    expect(intel.brief).not.toContain('-forward')
  })

  test('brief never announces "No preference" as a protein lean', () => {
    const intel = buildIntel([
      guest({ name: 'A', proteinAnchor: 'No preference' }),
      guest({ name: 'B', proteinAnchor: 'No preference' }),
      guest({ name: 'C', proteinAnchor: 'No preference' }),
    ])
    expect(intel.brief).not.toContain('-forward')
  })

  test('brief mentions dominant flavor lean when >50% of guests share it', () => {
    const intel = buildIntel([
      guest({ name: 'A', flavorPreference: ['Fresh'] }),
      guest({ name: 'B', flavorPreference: ['Fresh'] }),
      guest({ name: 'C', flavorPreference: ['Rich'] }),
    ])
    expect(intel.brief).toContain('fresh flavors')
  })

  test('brief combines protein and flavor lean when both are dominant', () => {
    const intel = buildIntel([
      guest({ name: 'A', proteinAnchor: 'Fish', flavorPreference: ['Fresh'] }),
      guest({ name: 'B', proteinAnchor: 'Fish', flavorPreference: ['Fresh'] }),
    ])
    expect(intel.brief).toContain('leans fish-forward with fresh flavors')
  })
})
