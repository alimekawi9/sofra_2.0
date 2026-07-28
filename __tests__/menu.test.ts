import { buildIntel } from '@/lib/intel'
import {
  scoreDish, draftCourse, draftMenu,
  SLOT_LABELS, SLOTS,
} from '@/lib/menu'
import type { Signature, PantryItem, Course } from '@/lib/menu'

// Helpers
const sig = (overrides: Partial<Signature> & { id: string; name: string; slot: import('@/lib/menu').Slot }): Signature => ({
  tags: [],
  contains_allergens: [],
  ...overrides,
})

const pantryItem = (id: string, name: string): PantryItem => ({ id, name })

const noGuests = buildIntel([])

describe('SLOT_LABELS', () => {
  test('covers all five slots', () => {
    expect(SLOT_LABELS['start']).toBe('To Start')
    expect(SLOT_LABELS['sea']).toBe('Main — Sea')
    expect(SLOT_LABELS['land']).toBe('Main — Land')
    expect(SLOT_LABELS['green']).toBe('Main — Green')
    expect(SLOT_LABELS['finish']).toBe('To Finish')
  })
})

describe('scoreDish — signature', () => {
  test('returns empty when dish has no conflicts', () => {
    const intel = buildIntel([{ name: 'Ali', dietary: [], avoid: ['Nuts'], drinks: [], adventurousness: 50 }])
    const dish = sig({ id: '1', name: 'Bread', slot: 'start' })
    expect(scoreDish(dish, intel)).toEqual([])
  })

  test('excludes guest when dish contains their allergen (case-insensitive)', () => {
    const intel = buildIntel([{ name: 'Ali', dietary: [], avoid: ['Nuts'], drinks: [], adventurousness: 50 }])
    const dish = sig({ id: '1', name: 'Walnut Cake', slot: 'finish', contains_allergens: ['Nuts'] })
    expect(scoreDish(dish, intel)).toEqual([{ guest: 'Ali', reason: 'contains nuts' }])
  })

  test('excludes guest whose strict diet is not in dish tags', () => {
    const intel = buildIntel([{ name: 'Sara', dietary: ['Vegetarian'], avoid: [], drinks: [], adventurousness: 50 }])
    const dish = sig({ id: '2', name: 'Beef Tartare', slot: 'land' })
    expect(scoreDish(dish, intel)).toEqual([{ guest: 'Sara', reason: 'not vegetarian' }])
  })

  test('does not exclude guest when dish carries their required diet tag', () => {
    const intel = buildIntel([{ name: 'Sara', dietary: ['Vegetarian'], avoid: [], drinks: [], adventurousness: 50 }])
    const dish = sig({ id: '3', name: 'Risotto', slot: 'green', tags: ['vegetarian'] })
    expect(scoreDish(dish, intel)).toEqual([])
  })

  test('deduplicates guest hit by both allergen and diet — first reason wins', () => {
    const intel = buildIntel([{ name: 'Ali', dietary: ['Vegan'], avoid: ['Nuts'], drinks: [], adventurousness: 50 }])
    const dish = sig({ id: '4', name: 'Nut Tart', slot: 'finish', contains_allergens: ['Nuts'] })
    const excludes = scoreDish(dish, intel)
    const aliEntries = excludes.filter(e => e.guest === 'Ali')
    expect(aliEntries).toHaveLength(1)
    expect(aliEntries[0].reason).toBe('contains nuts')
  })
})

describe('scoreDish — pantry item', () => {
  test('excludes guest when avoid label is a substring of item name (case-insensitive)', () => {
    const intel = buildIntel([{ name: 'Ali', dietary: [], avoid: ['Nuts'], drinks: [], adventurousness: 50 }])
    const item = pantryItem('p1', 'Mixed Nuts Brittle')
    expect(scoreDish(item, intel)).toEqual([{ guest: 'Ali', reason: 'may contain nuts' }])
  })

  test('does not flag when avoid label is not in item name', () => {
    const intel = buildIntel([{ name: 'Ali', dietary: [], avoid: ['Shellfish'], drinks: [], adventurousness: 50 }])
    const item = pantryItem('p2', 'Sourdough Bread')
    expect(scoreDish(item, intel)).toEqual([])
  })

  test('excludes all strict-diet guests with diet-unknown reason', () => {
    const intel = buildIntel([{ name: 'Sara', dietary: ['Vegan'], avoid: [], drinks: [], adventurousness: 50 }])
    const item = pantryItem('p3', 'Seasonal Vegetable')
    const excludes = scoreDish(item, intel)
    expect(excludes).toEqual([{ guest: 'Sara', reason: 'pantry dish — diet-safe status unknown' }])
  })
})

describe('draftCourse', () => {
  test('picks zero-exclusion signature over one with exclusions', () => {
    const intel = buildIntel([{ name: 'Ali', dietary: [], avoid: ['Nuts'], drinks: [], adventurousness: 50 }])
    const sigs = [
      sig({ id: '1', name: 'Walnut Tart', slot: 'finish', contains_allergens: ['Nuts'] }),
      sig({ id: '2', name: 'Panna Cotta', slot: 'finish' }),
    ]
    const course = draftCourse('finish', intel, sigs, [])
    expect(course.dishName).toBe('Panna Cotta')
    expect(course.excludes).toHaveLength(0)
  })

  test('falls back to pantry when no slotted signatures', () => {
    const course = draftCourse('start', noGuests, [], [pantryItem('p1', 'Sourdough')])
    expect(course.dishName).toBe("Chef's Sourdough")
    expect(course.origin).toBe('pantry-composed')
    expect(course.slotLabel).toBe('To Start')
  })

  test('returns empty course when pool is empty', () => {
    const course = draftCourse('sea', noGuests, [], [])
    expect(course.origin).toBe('empty')
    expect(course.dishName).toBe('')
    expect(course.sourceId).toBeNull()
    expect(course.excludes).toEqual([])
  })

  test('exclude set prevents picking the current dish, returns next-best', () => {
    const sigs = [
      sig({ id: '1', name: 'Amuse Bouche', slot: 'start' }),
      sig({ id: '2', name: 'Oyster Shot', slot: 'start' }),
    ]
    const first  = draftCourse('start', noGuests, sigs, [])
    const second = draftCourse('start', noGuests, sigs, [], new Set([first.sourceId!]))
    expect(second.sourceId).not.toBe(first.sourceId)
  })

  test('exclude-emptied pool returns empty course', () => {
    const sigs = [sig({ id: '1', name: 'Only Option', slot: 'start' })]
    const course = draftCourse('start', noGuests, sigs, [], new Set(['1']))
    expect(course.origin).toBe('empty')
  })

  test('tiebreaks: signatures before pantry at same exclusion count', () => {
    const intel = noGuests
    const sigs  = [sig({ id: 's1', name: 'A Dish', slot: 'start' })]
    const pantry = [pantryItem('p1', 'Bread')]
    const course = draftCourse('start', intel, sigs, pantry)
    expect(course.origin).toBe('signature')
  })

  test('tiebreaks: alphabetical by name within same tier', () => {
    const sigs = [
      sig({ id: '2', name: 'Zucchini Soup', slot: 'start' }),
      sig({ id: '1', name: 'Amuse Bouche', slot: 'start' }),
    ]
    const course = draftCourse('start', noGuests, sigs, [])
    expect(course.dishName).toBe('Amuse Bouche')
  })
})

describe('draftMenu', () => {
  test('returns exactly five courses in SLOTS order', () => {
    const courses = draftMenu(noGuests, [], [])
    expect(courses).toHaveLength(5)
    expect(courses.map(c => c.slot)).toEqual(SLOTS)
  })

  test('all empty when pool is empty', () => {
    const courses = draftMenu(noGuests, [], [])
    expect(courses.every(c => c.origin === 'empty')).toBe(true)
  })

  test('uses slotted signatures per slot', () => {
    const sigs = [
      sig({ id: '1', name: 'Mushroom Soup', slot: 'start' }),
      sig({ id: '2', name: 'Sea Bass', slot: 'sea' }),
    ]
    const courses = draftMenu(noGuests, sigs, [])
    expect(courses.find(c => c.slot === 'start')?.dishName).toBe('Mushroom Soup')
    expect(courses.find(c => c.slot === 'sea')?.dishName).toBe('Sea Bass')
  })
})
