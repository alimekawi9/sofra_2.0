import { buildIntel } from '@/lib/intel'
import type { TasteProfile } from '@/lib/intel'

const guest = (overrides: Partial<TasteProfile> & { name: string }): TasteProfile => ({
  dietary: [],
  avoid: [],
  drinks: [],
  adventurousness: 50,
  ...overrides,
})

describe('buildIntel', () => {
  test('returns safe defaults for empty guest list', () => {
    const intel = buildIntel([])
    expect(intel.guestCount).toBe(0)
    expect(intel.hardLimits).toEqual([])
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

  test('creates diet HardLimit for Vegetarian, Vegan, No pork/alcohol, Kosher (STRICT_DIETS)', () => {
    const intel = buildIntel([
      guest({ name: 'Sara', dietary: ['Vegetarian', 'Gluten-free'] }),
    ])
    expect(intel.hardLimits.some(h => h.label === 'Vegetarian' && h.type === 'diet')).toBe(true)
    expect(intel.hardLimits.some(h => h.label === 'Gluten-free')).toBe(false)
  })

  test('allergy HardLimits appear before diet HardLimits', () => {
    const intel = buildIntel([
      guest({ name: 'A', avoid: ['Nuts'], dietary: ['Vegan'] }),
    ])
    const firstAllergyIdx = intel.hardLimits.findIndex(h => h.type === 'allergy')
    const firstDietIdx    = intel.hardLimits.findIndex(h => h.type === 'diet')
    expect(firstAllergyIdx).toBeLessThan(firstDietIdx)
  })

  test('dietMix excludes STRICT_DIETS, sorted descending', () => {
    const intel = buildIntel([
      guest({ name: 'A', dietary: ['Gluten-free', 'Pescatarian'] }),
      guest({ name: 'B', dietary: ['Gluten-free'] }),
      guest({ name: 'C', dietary: ['Vegan'] }),  // strict — excluded from dietMix
    ])
    expect(intel.dietMix[0]).toEqual({ label: 'Gluten-free', count: 2 })
    expect(intel.dietMix.some(d => d.label === 'Vegan')).toBe(false)
  })

  test('drinksCounts sorted descending', () => {
    const intel = buildIntel([
      guest({ name: 'A', drinks: ['Wine', 'Beer'] }),
      guest({ name: 'B', drinks: ['Wine'] }),
    ])
    expect(intel.drinksCounts[0]).toEqual({ label: 'Wine', count: 2 })
    expect(intel.drinksCounts[1]).toEqual({ label: 'Beer', count: 1 })
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

  test('brief includes guestCount, diet, allergy, drink, adventurousness', () => {
    const intel = buildIntel([
      guest({ name: 'Ali', avoid: ['Nuts'], drinks: ['Wine'], adventurousness: 54 }),
      guest({ name: 'Sara', dietary: ['Vegan'], drinks: ['Wine'], adventurousness: 54 }),
    ])
    expect(intel.brief).toContain('2 guests')
    expect(intel.brief).toContain('vegan')
    expect(intel.brief).toContain('nuts')
    expect(intel.brief).toContain('wine dominant')
    expect(intel.brief).toContain('balanced')
    expect(intel.brief).toContain('54')
  })

  test('brief says "no hard limits" when there are none', () => {
    const intel = buildIntel([guest({ name: 'A', adventurousness: 50 })])
    expect(intel.brief).toContain('no hard limits')
  })
})
