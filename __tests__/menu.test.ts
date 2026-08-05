import { buildIntel } from '@/lib/intel'
import {
  scoreDish, scoreComposedDish, draftCourse, draftMenu, deriveCourse,
  assignSubstitutions, inferSlot, nameMatchesSlot, portionGuidance, SLOT_LABELS, SLOTS,
} from '@/lib/menu'
import type { Signature, PantryItem, Course, PersistedCourseLike } from '@/lib/menu'

// Helpers
const sig = (overrides: Partial<Signature> & { id: string; name: string; slot: import('@/lib/menu').Slot }): Signature => ({
  tags: [],
  contains_allergens: [],
  ...overrides,
})

const pantryItem = (
  id: string,
  name: string,
  overrides: { tags?: string[]; contains_allergens?: string[] } = {}
): PantryItem => ({
  id,
  name,
  tags: overrides.tags ?? [],
  contains_allergens: overrides.contains_allergens ?? [],
})

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
    expect(scoreDish(dish, intel)).toEqual([{ guest: 'Ali', reason: 'contains nuts', kind: 'allergy' }])
  })

  test('excludes guest whose strict diet is not in dish tags', () => {
    const intel = buildIntel([{ name: 'Sara', dietary: ['Vegetarian'], avoid: [], drinks: [], adventurousness: 50 }])
    const dish = sig({ id: '2', name: 'Beef Tartare', slot: 'land' })
    expect(scoreDish(dish, intel)).toEqual([{ guest: 'Sara', reason: 'not vegetarian', kind: 'preference' }])
  })

  test('does not exclude guest when dish carries their required diet tag', () => {
    const intel = buildIntel([{ name: 'Sara', dietary: ['Vegetarian'], avoid: [], drinks: [], adventurousness: 50 }])
    const dish = sig({ id: '3', name: 'Risotto', slot: 'green', tags: ['vegetarian'] })
    expect(scoreDish(dish, intel)).toEqual([])
  })

  // Seed data (lib/dish-presets.ts) uses "veg" as shorthand for vegetarian
  // and "vegan" for vegan. A literal-string check on the hard-limit label
  // "Vegetarian" wrongly rejected every one of these dishes for vegetarian
  // guests, cascading the whole menu to pantry-composed placeholders.
  test('"veg" tag satisfies a Vegetarian hard limit', () => {
    const intel = buildIntel([{ name: 'Nadia', dietary: ['Vegetarian'], avoid: [], drinks: [], adventurousness: 50 }])
    const dish = sig({ id: '4', name: 'Baba Ganoush', slot: 'start', tags: ['veg', 'vegan'] })
    expect(scoreDish(dish, intel)).toEqual([])
  })

  test('"vegan" tag alone satisfies a Vegetarian hard limit (vegan ⊂ vegetarian)', () => {
    const intel = buildIntel([{ name: 'Nadia', dietary: ['Vegetarian'], avoid: [], drinks: [], adventurousness: 50 }])
    const dish = sig({ id: '5', name: 'Ratatouille', slot: 'green', tags: ['vegan'] })
    expect(scoreDish(dish, intel)).toEqual([])
  })

  test('"vegan" tag satisfies a No pork/alcohol hard limit (no pork / animal products)', () => {
    const intel = buildIntel([{ name: 'Tarek', dietary: ['No pork/alcohol'], avoid: [], drinks: [], adventurousness: 50 }])
    const dish = sig({ id: '6', name: 'Chana Masala', slot: 'green', tags: ['veg', 'vegan'] })
    expect(scoreDish(dish, intel)).toEqual([])
  })

  test('"vegan" tag satisfies a Kosher hard limit (no pork / shellfish / meat-dairy mixing)', () => {
    const intel = buildIntel([{ name: 'Kal', dietary: ['Kosher'], avoid: [], drinks: [], adventurousness: 50 }])
    const dish = sig({ id: '7', name: 'Falafel', slot: 'start', tags: ['vegan'] })
    expect(scoreDish(dish, intel)).toEqual([])
  })

  // Conservative: "veg" (may contain dairy/eggs — and possibly wine) is not
  // automatically no-pork/alcohol-safe. Only "vegan" is. Chef can still tag
  // "no pork/alcohol" explicitly on a non-vegan dish they know is safe.
  test('"veg" tag alone does NOT satisfy No pork/alcohol (may contain alcohol)', () => {
    const intel = buildIntel([{ name: 'Tarek', dietary: ['No pork/alcohol'], avoid: [], drinks: [], adventurousness: 50 }])
    const dish = sig({ id: '8', name: 'Coq au Something', slot: 'land', tags: ['veg'] })
    expect(scoreDish(dish, intel)).toEqual([{ guest: 'Tarek', reason: 'contains pork or alcohol', kind: 'preference' }])
  })

  // A dish can be genuinely safe (no pork, no alcohol) without being vegan —
  // e.g. a plain grilled meat dish. The chef declares this explicitly via the
  // "no pork/alcohol" tag rather than relying on the vegan⊂no-pork/alcohol
  // shortcut, and that explicit declaration must be trusted.
  test('explicit "no pork/alcohol" tag satisfies the hard limit for a non-vegan dish', () => {
    const intel = buildIntel([{ name: 'Tarek', dietary: ['No pork/alcohol'], avoid: [], drinks: [], adventurousness: 50 }])
    const dish = sig({ id: '10', name: 'Grilled Chicken Shawarma', slot: 'land', tags: ['meat', 'no pork/alcohol'] })
    expect(scoreDish(dish, intel)).toEqual([])
  })

  test('"veg" tag alone does NOT satisfy Vegan', () => {
    const intel = buildIntel([{ name: 'Vera', dietary: ['Vegan'], avoid: [], drinks: [], adventurousness: 50 }])
    const dish = sig({ id: '9', name: 'Panna Cotta', slot: 'finish', tags: ['veg'] })
    expect(scoreDish(dish, intel)).toEqual([{ guest: 'Vera', reason: 'not vegan', kind: 'preference' }])
  })

  test('reproduces the demo table bug: Baba Ganoush is safe for the whole vegetarian/no-pork-alcohol table', () => {
    const intel = buildIntel([
      { name: 'Nadia', dietary: ['Vegetarian'], avoid: [], drinks: [], adventurousness: 50 },
      { name: 'Mona',  dietary: ['Vegetarian'], avoid: [], drinks: [], adventurousness: 50 },
      { name: 'Priya', dietary: ['Vegetarian'], avoid: [], drinks: [], adventurousness: 50 },
      { name: 'Tarek', dietary: ['No pork/alcohol'], avoid: [], drinks: [], adventurousness: 50 },
    ])
    const babaGanoush = sig({ id: 'bg', name: 'Baba Ganoush', slot: 'start', tags: ['veg', 'vegan'] })
    expect(scoreDish(babaGanoush, intel)).toEqual([])
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

// The demo table (scripts/seed-demo-event.mjs) shows "Table fit: safe for
// 5/9 guests" for every Main — Land course because every land signature is
// a meat dish, so the
// same 4 diet-restricted guests (3 vegetarian + 1 no-pork/alcohol) are excluded from
// all of them — a real property of that signature catalog, not a bug. These
// tests confirm the exclusion count genuinely tracks the allergen a dish
// contains rather than being pinned at a constant: a shellfish-containing
// sea dish excludes an additional guest beyond the land dish's diet-only
// exclusions, and a nuts-containing dish excludes a different guest set
// entirely (nut-avoiders who aren't vegetarian).
describe('demo guest data — exclusion counts vary by allergen, not fixed', () => {
  const demoGuests = [
    { name: 'Host',  dietary: [],              avoid: [],            drinks: [], adventurousness: 50 },
    { name: 'Omar',  dietary: [],              avoid: ['Pork'],      drinks: [], adventurousness: 50 },
    { name: 'Nadia', dietary: ['Vegetarian'],  avoid: ['Nuts'],      drinks: [], adventurousness: 50 },
    { name: 'Sam',   dietary: [],              avoid: ['Nuts'],      drinks: [], adventurousness: 50 },
    { name: 'Yara',  dietary: [],              avoid: ['Shellfish'], drinks: [], adventurousness: 50 },
    { name: 'Tarek', dietary: ['No pork/alcohol'], avoid: [],        drinks: [], adventurousness: 50 },
    { name: 'Mona',  dietary: ['Vegetarian'],  avoid: ['Mushrooms'], drinks: [], adventurousness: 50 },
    { name: 'Dana',  dietary: [],              avoid: ['Nuts'],      drinks: [], adventurousness: 50 },
    { name: 'Priya', dietary: ['Vegetarian'],  avoid: [],            drinks: [], adventurousness: 50 },
  ]
  const intel = buildIntel(demoGuests)

  test('guest count matches the live app (host + 8 guests all RSVP)', () => {
    expect(intel.guestCount).toBe(9)
  })

  test('Main — Land dish (diet-only exclusions): excludes exactly the 3 vegetarians + 1 no-pork/alcohol guest', () => {
    const lambKofta = sig({ id: 'land-1', name: 'Lamb Kofta', slot: 'land', tags: ['meat'] })
    const excludes = scoreDish(lambKofta, intel)
    expect(excludes.map(e => e.guest).sort()).toEqual(['Mona', 'Nadia', 'Priya', 'Tarek'])
    expect(excludes).toHaveLength(4) // Table fit: safe for 5/9 guests
  })

  test('Main — Sea dish with shellfish: excludes the same diet guests PLUS the shellfish-allergic guest', () => {
    const sushiPlatter = sig({
      id: 'sea-1', name: 'Sushi Platter', slot: 'sea', tags: ['seafood'], contains_allergens: ['shellfish'],
    })
    const excludes = scoreDish(sushiPlatter, intel)
    expect(excludes.map(e => e.guest).sort()).toEqual(['Mona', 'Nadia', 'Priya', 'Tarek', 'Yara'])
    expect(excludes).toHaveLength(5) // Table fit: safe for 4/9 guests — differs from the land dish's 5/9
  })

  test('nuts-containing dish excludes a different guest set (nut-avoiders, not vegetarians)', () => {
    const muhammara = sig({
      id: 'start-1', name: 'Muhammara', slot: 'start', tags: ['veg', 'vegan'], contains_allergens: ['nuts'],
    })
    const excludes = scoreDish(muhammara, intel)
    expect(excludes.map(e => e.guest).sort()).toEqual(['Dana', 'Nadia', 'Sam'])
    expect(excludes).toHaveLength(3) // Table fit: safe for 6/9 guests — differs from both the land and sea counts
  })
})

describe('scoreDish — pantry item', () => {
  test('excludes guest when avoid label is a substring of item name (case-insensitive)', () => {
    const intel = buildIntel([{ name: 'Ali', dietary: [], avoid: ['Nuts'], drinks: [], adventurousness: 50 }])
    const item = pantryItem('p1', 'Mixed Nuts Brittle')
    expect(scoreDish(item, intel)).toEqual([{ guest: 'Ali', reason: 'may contain nuts', kind: 'allergy' }])
  })

  test('does not flag when avoid label is not in item name', () => {
    const intel = buildIntel([{ name: 'Ali', dietary: [], avoid: ['Shellfish'], drinks: [], adventurousness: 50 }])
    const item = pantryItem('p2', 'Sourdough Bread')
    expect(scoreDish(item, intel)).toEqual([])
  })

  // Pantry now carries declared tags/allergens like signatures. Untagged items
  // still fail closed on strict diets (chef didn't claim safety), but the
  // reason is now the signature-parity "not vegan" rather than the special
  // "pantry dish — diet-safe status unknown".
  test('untagged pantry item fails closed on strict diet with signature-parity reason', () => {
    const intel = buildIntel([{ name: 'Sara', dietary: ['Vegan'], avoid: [], drinks: [], adventurousness: 50 }])
    const item = pantryItem('p3', 'Seasonal Vegetable')
    expect(scoreDish(item, intel)).toEqual([{ guest: 'Sara', reason: 'not vegan', kind: 'preference' }])
  })

  test('tagged pantry item satisfies a matching strict diet (dishSatisfiesDiet)', () => {
    const intel = buildIntel([{ name: 'Nadia', dietary: ['Vegetarian'], avoid: [], drinks: [], adventurousness: 50 }])
    const item = pantryItem('p4', 'Aubergine', { tags: ['veg', 'vegan'] })
    expect(scoreDish(item, intel)).toEqual([])
  })

  test('vegan-tagged pantry item satisfies No pork/alcohol (same semantics as signatures)', () => {
    const intel = buildIntel([{ name: 'Tarek', dietary: ['No pork/alcohol'], avoid: [], drinks: [], adventurousness: 50 }])
    const item = pantryItem('p5', 'Chickpeas', { tags: ['vegan'] })
    expect(scoreDish(item, intel)).toEqual([])
  })

  test('declared contains_allergens excludes allergic guest (parity with signatures)', () => {
    const intel = buildIntel([{ name: 'Ali', dietary: [], avoid: ['Nuts'], drinks: [], adventurousness: 50 }])
    const item = pantryItem('p6', 'Pistachio Cream', { contains_allergens: ['Nuts'] })
    expect(scoreDish(item, intel)).toEqual([{ guest: 'Ali', reason: 'contains nuts', kind: 'allergy' }])
  })

  test('declared allergen and name-substring dedup to a single exclusion per guest', () => {
    const intel = buildIntel([{ name: 'Ali', dietary: [], avoid: ['Nuts'], drinks: [], adventurousness: 50 }])
    // Name substring AND declared allergen both hit — one exclusion, not two.
    const item = pantryItem('p7', 'Mixed Nuts', { contains_allergens: ['Nuts'] })
    const excludes = scoreDish(item, intel)
    expect(excludes).toHaveLength(1)
    expect(excludes[0]).toEqual({ guest: 'Ali', reason: 'contains nuts', kind: 'allergy' })
  })
})

describe('scoreComposedDish — AI-composed dish safety derived from real pantry data', () => {
  // Safety for an AI-composed dish is derived from the *actual* declared
  // tags/allergens of the pantry items it's built from — never from the AI's
  // own say-so. This is the union of each component's scoreDish result: a
  // dish is only as safe as its least-safe ingredient.
  test('Baba Ganoush case: an all-vegan set of components is safe for every diet-restricted guest', () => {
    const intel = buildIntel([
      { name: 'Nadia', dietary: ['Vegetarian'], avoid: [], drinks: [], adventurousness: 50 },
      { name: 'Tarek', dietary: ['No pork/alcohol'], avoid: [], drinks: [], adventurousness: 50 },
    ])
    const items = [
      pantryItem('p1', 'Aubergine', { tags: ['vegan'] }),
      pantryItem('p2', 'Tahini', { tags: ['vegan'] }),
    ]
    expect(scoreComposedDish(items, intel)).toEqual([])
  })

  test('flags every guest whose diet a single non-compliant component violates', () => {
    const intel = buildIntel([
      { name: 'Nadia', dietary: ['Vegetarian'], avoid: [], drinks: [], adventurousness: 50 },
      { name: 'Tarek', dietary: ['No pork/alcohol'], avoid: [], drinks: [], adventurousness: 50 },
    ])
    // Lamb: violates vegetarian, but tagged safe for no-pork/alcohol.
    const items = [pantryItem('p1', 'Lamb', { tags: ['meat', 'no pork/alcohol'] })]
    expect(scoreComposedDish(items, intel)).toEqual([{ guest: 'Nadia', reason: 'not vegetarian', kind: 'preference' }])
  })

  test('flags guest when any component declares an allergen they avoid (case-insensitive)', () => {
    const intel = buildIntel([{ name: 'Ali', dietary: [], avoid: ['Nuts'], drinks: [], adventurousness: 50 }])
    const items = [
      pantryItem('p1', 'Rice', { tags: ['vegan'] }),
      pantryItem('p2', 'Pistachio Cream', { tags: ['vegan'], contains_allergens: ['nuts'] }),
    ]
    expect(scoreComposedDish(items, intel)).toEqual([{ guest: 'Ali', reason: 'contains nuts', kind: 'allergy' }])
  })

  test('untagged component fails closed on strict diet (no free pass just for being pantry-composed)', () => {
    const intel = buildIntel([
      { name: 'Nadia', dietary: ['Vegetarian'], avoid: [], drinks: [], adventurousness: 50 },
    ])
    const items = [pantryItem('p1', 'Seasonal Vegetable')]
    expect(scoreComposedDish(items, intel)).toEqual([{ guest: 'Nadia', reason: 'not vegetarian', kind: 'preference' }])
  })

  test('deduplicates a guest hit by multiple components — one exclusion per guest', () => {
    const intel = buildIntel([{ name: 'Ali', dietary: [], avoid: ['Nuts'], drinks: [], adventurousness: 50 }])
    const items = [
      pantryItem('p1', 'Almond Cream', { contains_allergens: ['Nuts'] }),
      pantryItem('p2', 'Mixed Nuts', { contains_allergens: ['Nuts'] }),
    ]
    const excludes = scoreComposedDish(items, intel)
    expect(excludes).toHaveLength(1)
    expect(excludes[0]).toEqual({ guest: 'Ali', reason: 'contains nuts', kind: 'allergy' })
  })

  test('empty component list is treated as safe (no ingredients = no violations)', () => {
    const intel = buildIntel([
      { name: 'Nadia', dietary: ['Vegetarian'], avoid: ['Nuts'], drinks: [], adventurousness: 50 },
    ])
    expect(scoreComposedDish([], intel)).toEqual([])
  })
})

describe('portionGuidance', () => {
  // Static per-slot batch-size hint. The chef reads "Portion: feeds ~N" as a
  // recipe yield and scales up for the full table themselves — no dependency
  // on guest count so the number is stable across events. Phrased with
  // "feeds" (not "serves") so it can't be misread as the table-fit safety
  // count shown elsewhere on the same course card.
  test('every slot returns a "Portion: feeds ~N" string', () => {
    for (const slot of SLOTS) {
      expect(portionGuidance(slot)).toMatch(/^Portion: feeds ~\d+$/)
    }
  })

  test('start course serves fewer than mains (small bites, batch feeds more)', () => {
    const startN = parseInt(portionGuidance('start').match(/\d+/)![0], 10)
    const seaN   = parseInt(portionGuidance('sea').match(/\d+/)![0], 10)
    expect(startN).toBeGreaterThan(seaN)
  })

  test('finish course serves more than mains (small dessert portions)', () => {
    const finishN = parseInt(portionGuidance('finish').match(/\d+/)![0], 10)
    const landN   = parseInt(portionGuidance('land').match(/\d+/)![0], 10)
    expect(finishN).toBeGreaterThan(landN)
  })
})

describe('nameMatchesSlot', () => {
  test('sea keywords match fish/seafood names', () => {
    expect(nameMatchesSlot('Sea Bass', 'sea')).toBe(true)
    expect(nameMatchesSlot('Wild Salmon', 'sea')).toBe(true)
    expect(nameMatchesSlot('Apricots', 'sea')).toBe(false)
  })
  test('land keywords match meat names', () => {
    expect(nameMatchesSlot('Lamb Shoulder', 'land')).toBe(true)
    expect(nameMatchesSlot('Duck Breast', 'land')).toBe(true)
    expect(nameMatchesSlot('Zucchini', 'land')).toBe(false)
  })
  test('finish keywords match fruit/dessert names', () => {
    expect(nameMatchesSlot('Apricots', 'finish')).toBe(true)
    expect(nameMatchesSlot('Dark Chocolate', 'finish')).toBe(true)
  })
  test('green keywords match vegetables and grains', () => {
    expect(nameMatchesSlot('Aubergine', 'green')).toBe(true)
    expect(nameMatchesSlot('Rice', 'green')).toBe(true)
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

  // Rule-based drafting has no way to invent a coherent name for a raw
  // pantry ingredient (only the AI path can compose one), so pantry items
  // are never eligible candidates here — presenting one as "Chef's
  // Sourdough" would misrepresent an un-composed ingredient as a finished
  // dish. An honest empty slot is the correct outcome.
  test('does not fabricate a dish name from pantry when no slotted signatures exist', () => {
    const course = draftCourse('start', noGuests, [], [pantryItem('p1', 'Sourdough')])
    expect(course.origin).toBe('empty')
    expect(course.dishName).toBe('')
    expect(course.slotLabel).toBe('To Start')
  })

  test('returns empty course when pool is empty', () => {
    const course = draftCourse('sea', noGuests, [], [])
    expect(course.origin).toBe('empty')
    expect(course.dishName).toBe('')
    expect(course.sourceId).toBeNull()
    expect(course.excludes).toEqual([])
  })

  test('returns empty course when pantry has slot-matching items but no signature exists for the slot', () => {
    const pantry = [pantryItem('p1', 'Sea Bass'), pantryItem('p2', 'Duck Breast')]
    const course = draftCourse('sea', noGuests, [], pantry)
    expect(course.origin).toBe('empty')
    expect(course.dishName).toBe('')
    expect(course.sourceId).toBeNull()
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

  test('tiebreaks: alphabetical by name within same tier', () => {
    const sigs = [
      sig({ id: '2', name: 'Zucchini Soup', slot: 'start' }),
      sig({ id: '1', name: 'Amuse Bouche', slot: 'start' }),
    ]
    const course = draftCourse('start', noGuests, sigs, [])
    expect(course.dishName).toBe('Amuse Bouche')
  })
})

describe('deriveCourse', () => {
  const persisted = (overrides: Partial<PersistedCourseLike>): PersistedCourseLike => ({
    slot: 'start',
    dish_name: 'Amuse Bouche',
    dish_origin: 'signature',
    source: '1',
    ...overrides,
  })

  test('signature dish resolves normally when source is found', () => {
    const sigs = [sig({ id: '1', name: 'Amuse Bouche', slot: 'start' })]
    const course = deriveCourse(persisted({}), sigs, [], noGuests)
    expect(course.dishName).toBe('Amuse Bouche')
    expect(course.origin).toBe('signature')
  })

  test('shows placeholder when a linked signature was actually deleted', () => {
    const course = deriveCourse(persisted({ source: 'gone' }), [], [], noGuests)
    expect(course.dishName).toBe('— source deleted, swap or lock —')
    expect(course.origin).toBe('empty')
  })

  test('AI pantry-composed dish with no linked pantry item keeps its dish_name', () => {
    // Gemini can compose a dish from multiple pantry ingredients without
    // pinning it to one single pantry_id — source is null, not deleted.
    const course = deriveCourse(
      persisted({ dish_name: 'Charred Aubergine with Pomegranate', dish_origin: 'pantry-composed', source: null }),
      [],
      [],
      noGuests
    )
    expect(course.dishName).toBe('Charred Aubergine with Pomegranate')
    expect(course.origin).toBe('pantry-composed')
  })

  test('pantry-composed dish with a source that no longer exists in pantry shows placeholder', () => {
    const course = deriveCourse(
      persisted({ dish_name: 'Old Dish', dish_origin: 'pantry-composed', source: 'p-old' }),
      [],
      [pantryItem('p1', 'Bread')],
      noGuests
    )
    expect(course.dishName).toBe('— source deleted, swap or lock —')
  })

  test('empty course renders with blank dish name', () => {
    const course = deriveCourse(persisted({ dish_name: '', dish_origin: 'empty', source: null }), [], [], noGuests)
    expect(course.dishName).toBe('')
    expect(course.origin).toBe('empty')
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

  test('pantry-only catalog (no signatures) yields all-empty courses rather than fabricated names', () => {
    const pantry = [pantryItem('p1', 'Zaatar'), pantryItem('p2', 'Aleppo Pepper')]
    const courses = draftMenu(noGuests, [], pantry)
    expect(courses.every(c => c.origin === 'empty' && c.dishName === '')).toBe(true)
  })
})

// The bug the user hit in production: every signature in the database has
// slot=NULL because the Kitchen UI never wrote it. The rule-based
// draftCourse filter `s.slot === slot` then rejected all 15 signatures,
// leaving every course origin='empty'. These tests lock in the two safety
// nets: (1) inferSlot fills the void from tags/name, and (2) draftCourse's
// last-resort fallback tier never returns empty while any signature exists.
describe('inferSlot — auto-assign when chef never set a slot', () => {
  test('meat tag maps to land', () => {
    expect(inferSlot('Lamb Kofta', ['meat'])).toBe('land')
  })
  test('seafood tag maps to sea', () => {
    expect(inferSlot('Grilled Fish', ['seafood'])).toBe('sea')
  })
  test('dessert tag maps to finish', () => {
    expect(inferSlot('Panna Cotta', ['dessert'])).toBe('finish')
  })
  test('vegan tag with no other signal maps to green', () => {
    expect(inferSlot('Chickpea Bowl', ['vegan'])).toBe('green')
  })
  test('name keywords beat tag defaults (soup → start)', () => {
    expect(inferSlot('Butternut Soup', ['veg'])).toBe('start')
  })
  test('unknown tags + generic name → null (last-resort tier)', () => {
    expect(inferSlot('Mystery Plate', [])).toBeNull()
  })
})

describe('draftCourse never returns empty when signatures exist (the real bug)', () => {
  test('slot=null signatures still enter the pool via inferSlot', () => {
    // Simulates the DB state: chef added Baba Ganoush + Lamb Kofta from the
    // preset picker, both stored with slot=null. Neither slot was reachable
    // under the old `s.slot === slot` filter — start and land both went
    // empty. With inferSlot, tag 'veg'/'vegan' → green (no name hit here),
    // but 'Baba Ganoush' name matches start's 'baba' keyword, so it lands
    // in start correctly.
    const sigs: Signature[] = [
      { id: '1', name: 'Baba Ganoush', tags: ['veg', 'vegan'], contains_allergens: [], slot: null },
      { id: '2', name: 'Lamb Kofta',   tags: ['meat'],         contains_allergens: [], slot: null },
    ]
    const startCourse = draftCourse('start', noGuests, sigs, [])
    const landCourse  = draftCourse('land',  noGuests, sigs, [])
    expect(startCourse.origin).not.toBe('empty')
    expect(startCourse.dishName).toBe('Baba Ganoush')
    expect(landCourse.origin).not.toBe('empty')
    expect(landCourse.dishName).toBe('Lamb Kofta')
  })

  test('last-resort tier picks the best available signature when nothing slots to this course', () => {
    // Only signatures are for land + finish. The `sea` slot has zero
    // in-slot candidates → last-resort widens the pool. Marked 'fallback'.
    const sigs = [
      sig({ id: 'l1', name: 'Lamb Chops',  slot: 'land',   tags: ['meat'] }),
      sig({ id: 'f1', name: 'Panna Cotta', slot: 'finish', tags: ['dessert'] }),
    ]
    const seaCourse = draftCourse('sea', noGuests, sigs, [])
    expect(seaCourse.origin).toBe('fallback')
    expect(seaCourse.dishName).not.toBe('')
  })

  test('genuinely empty signature list still returns empty (only truly-empty state)', () => {
    const c = draftCourse('sea', noGuests, [], [])
    expect(c.origin).toBe('empty')
  })
})

describe('per-guest substitutions — strict-diet preferences become side plates', () => {
  test('vegetarian excluded from a meat main receives a labeled substitute from the veg pool', () => {
    // Table: 2 vegetarians who cannot eat lamb. Under the substitution
    // model, the main course still lands on the majority-preferred dish
    // that would otherwise best-fit the table (e.g. locked by the chef,
    // picked by the AI, or the only slotted candidate) — and the excluded
    // guests receive a labeled alt on the side.
    const intel = buildIntel([
      { name: 'Omar', dietary: [], avoid: [], drinks: [], adventurousness: 50 },
      { name: 'Nadia', dietary: ['Vegetarian'], avoid: [], drinks: [], adventurousness: 50 },
      { name: 'Priya', dietary: ['Vegetarian'], avoid: [], drinks: [], adventurousness: 50 },
    ])
    const sigs = [
      sig({ id: 'l1', name: 'Lamb Kofta',  slot: 'land',  tags: ['meat'] }),
      sig({ id: 'g1', name: 'Ratatouille', slot: 'green', tags: ['veg', 'vegan'] }),
    ]
    const lamb: Course = {
      slot: 'land',
      slotLabel: SLOT_LABELS.land,
      dishName: 'Lamb Kofta',
      origin: 'signature',
      sourceId: 'l1',
      excludes: scoreDish(sigs[0], intel),
    }
    const subs = assignSubstitutions(lamb, intel, sigs, new Set())
    expect(subs).toHaveLength(1)
    expect(subs[0].guests.sort()).toEqual(['Nadia', 'Priya'])
    expect(subs[0].dishName).toBe('Ratatouille')
    expect(subs[0].origin).toBe('signature')
  })

  test('guests with different exclusion reasons get different substitutes', () => {
    const intel = buildIntel([
      { name: 'Nadia', dietary: ['Vegetarian'], avoid: [], drinks: [], adventurousness: 50 },
      { name: 'Sam',   dietary: [],             avoid: ['Nuts'], drinks: [], adventurousness: 50 },
    ])
    // Main dish excludes Sam (nuts) AND Nadia (not vegetarian). Alt pool
    // has two veg options + one nut-free meat option, so the assignment
    // can hand each excluded guest a dish they can actually eat.
    const sigs = [
      sig({ id: 'm1', name: 'Nut-Crusted Lamb', slot: 'land', tags: ['meat'], contains_allergens: ['Nuts'] }),
      sig({ id: 'v1', name: 'Aubergine Steak',  slot: 'land', tags: ['veg', 'vegan'] }),
      sig({ id: 'm2', name: 'Plain Lamb',       slot: 'land', tags: ['meat'] }),
      sig({ id: 'v2', name: 'Ratatouille',      slot: 'land', tags: ['veg', 'vegan'] }),
    ]
    const main: Course = {
      slot: 'land',
      slotLabel: SLOT_LABELS.land,
      dishName: 'Nut-Crusted Lamb',
      origin: 'signature',
      sourceId: 'm1',
      excludes: scoreDish(sigs[0], intel),
    }
    const subs = assignSubstitutions(main, intel, sigs, new Set())
    // Both excluded guests receive a substitute they can actually eat —
    // exact dish depends on ranking, but Sam's must be nut-free and
    // Nadia's must be veg. And they cannot be the same dish.
    const nadiaSub = subs.find(s => s.guests.includes('Nadia'))
    const samSub   = subs.find(s => s.guests.includes('Sam'))
    expect(nadiaSub).toBeDefined()
    expect(samSub).toBeDefined()
    expect(nadiaSub!.dishName).not.toBe(samSub!.dishName)
    // Nadia's substitute must be vegetarian (one of the veg options).
    expect(['Aubergine Steak', 'Ratatouille']).toContain(nadiaSub!.dishName)
    // Sam's substitute must not contain nuts (main is nut-crusted; the
    // three others are all nut-free per the fixture).
    expect(samSub!.dishName).not.toBe('Nut-Crusted Lamb')
  })

  test('true allergy blocks the main pick (dish with a nut-safe alt gets selected instead)', () => {
    const intel = buildIntel([
      { name: 'Sam', dietary: [], avoid: ['Nuts'], drinks: [], adventurousness: 50 },
    ])
    const sigs = [
      sig({ id: 'f1', name: 'Walnut Tart', slot: 'finish', contains_allergens: ['Nuts'] }),
      sig({ id: 'f2', name: 'Panna Cotta', slot: 'finish', tags: ['veg'] }),
    ]
    // Allergy exclusions rank higher than preference exclusions, so
    // Panna Cotta (0 allergy) beats Walnut Tart (1 allergy). Sam is served.
    const course = draftCourse('finish', intel, sigs, [])
    expect(course.dishName).toBe('Panna Cotta')
  })
})
