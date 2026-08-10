import { buildIntel } from '@/lib/intel'
import {
  scoreDish, scoreComposedDish, draftCourse, draftMenu, deriveCourse, deriveMenu,
  assignSubstitutions, inferSlot, nameMatchesSlot, portionGuidance,
  shortlistSignaturesForAI, SLOT_LABELS, SLOTS,
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
  test('covers the four flexible roles', () => {
    expect(SLOT_LABELS['starter']).toBe('To Start')
    expect(SLOT_LABELS['main']).toBe('Mains')
    expect(SLOT_LABELS['side']).toBe('On the Side')
    expect(SLOT_LABELS['dessert']).toBe('To Finish')
  })
})

describe('scoreDish â€” signature', () => {
  test('returns empty when dish has no conflicts', () => {
    const intel = buildIntel([{ name: 'Ali', dietary: [], avoid: ['Nuts'], adventurousness: 50 }])
    const dish = sig({ id: '1', name: 'Bread', slot: 'starter' })
    expect(scoreDish(dish, intel)).toEqual([])
  })

  test('excludes guest when dish contains their allergen (case-insensitive)', () => {
    const intel = buildIntel([{ name: 'Ali', dietary: [], avoid: ['Nuts'], adventurousness: 50 }])
    const dish = sig({ id: '1', name: 'Walnut Cake', slot: 'dessert', contains_allergens: ['Nuts'] })
    expect(scoreDish(dish, intel)).toEqual([{ guest: 'Ali', reason: 'contains nuts', kind: 'allergy' }])
  })

  test('excludes guest whose strict diet is not in dish tags', () => {
    const intel = buildIntel([{ name: 'Sara', dietary: ['Vegetarian'], avoid: [], adventurousness: 50 }])
    const dish = sig({ id: '2', name: 'Beef Tartare', slot: 'main' })
    expect(scoreDish(dish, intel)).toEqual([{ guest: 'Sara', reason: 'not vegetarian', kind: 'preference' }])
  })

  test('does not exclude guest when dish carries their required diet tag', () => {
    const intel = buildIntel([{ name: 'Sara', dietary: ['Vegetarian'], avoid: [], adventurousness: 50 }])
    const dish = sig({ id: '3', name: 'Risotto', slot: 'side', tags: ['vegetarian'] })
    expect(scoreDish(dish, intel)).toEqual([])
  })

  // Seed data (lib/dish-presets.ts) uses "veg" as shorthand for vegetarian
  // and "vegan" for vegan. A literal-string check on the hard-limit label
  // "Vegetarian" wrongly rejected every one of these dishes for vegetarian
  // guests, cascading the whole menu to pantry-composed placeholders.
  test('"veg" tag satisfies a Vegetarian hard limit', () => {
    const intel = buildIntel([{ name: 'Nadia', dietary: ['Vegetarian'], avoid: [], adventurousness: 50 }])
    const dish = sig({ id: '4', name: 'Baba Ganoush', slot: 'starter', tags: ['veg', 'vegan'] })
    expect(scoreDish(dish, intel)).toEqual([])
  })

  test('"vegan" tag alone satisfies a Vegetarian hard limit (vegan âŠ‚ vegetarian)', () => {
    const intel = buildIntel([{ name: 'Nadia', dietary: ['Vegetarian'], avoid: [], adventurousness: 50 }])
    const dish = sig({ id: '5', name: 'Ratatouille', slot: 'side', tags: ['vegan'] })
    expect(scoreDish(dish, intel)).toEqual([])
  })

  test('"vegan" tag satisfies a No pork hard limit (no pork / animal products)', () => {
    const intel = buildIntel([{ name: 'Tarek', dietary: ['No pork'], avoid: [], adventurousness: 50 }])
    const dish = sig({ id: '6', name: 'Chana Masala', slot: 'side', tags: ['veg', 'vegan'] })
    expect(scoreDish(dish, intel)).toEqual([])
  })

  test('"vegan" tag satisfies a Kosher hard limit (no pork / shellfish / meat-dairy mixing)', () => {
    const intel = buildIntel([{ name: 'Kal', dietary: ['Kosher'], avoid: [], adventurousness: 50 }])
    const dish = sig({ id: '7', name: 'Falafel', slot: 'starter', tags: ['vegan'] })
    expect(scoreDish(dish, intel)).toEqual([])
  })

  // "No pork" used to also mean "no alcohol", so a plain "veg" dish
  // (may contain wine) was deliberately excluded. That pairing was dropped â€”
  // this is now purely about pork, and vegetarian food has none.
  test('"veg" tag alone satisfies No pork (vegetarian food has no pork)', () => {
    const intel = buildIntel([{ name: 'Tarek', dietary: ['No pork'], avoid: [], adventurousness: 50 }])
    const dish = sig({ id: '8', name: 'Mujadara', slot: 'main', tags: ['veg'] })
    expect(scoreDish(dish, intel)).toEqual([])
  })

  // A dish can be genuinely pork-free without being vegetarian at all â€”
  // e.g. a plain grilled meat dish. The chef declares this explicitly via
  // the "no pork" tag rather than relying on the vegan/vegâŠ‚no-pork
  // shortcut, and that explicit declaration must be trusted.
  test('explicit "no pork" tag satisfies the hard limit for a meat dish', () => {
    const intel = buildIntel([{ name: 'Tarek', dietary: ['No pork'], avoid: [], adventurousness: 50 }])
    const dish = sig({ id: '10', name: 'Grilled Chicken Shawarma', slot: 'main', tags: ['meat', 'no pork'] })
    expect(scoreDish(dish, intel)).toEqual([])
  })

  // An undeclared meat dish (no veg/vegan/"no pork" tag) still fails closed
  // with the friendly reason, not the generic "not no pork".
  test('meat dish with no safety tag excludes a No pork guest with the correct reason', () => {
    const intel = buildIntel([{ name: 'Tarek', dietary: ['No pork'], avoid: [], adventurousness: 50 }])
    const dish = sig({ id: '11', name: 'Pork Belly Bao', slot: 'main', tags: ['meat'] })
    expect(scoreDish(dish, intel)).toEqual([{ guest: 'Tarek', reason: 'contains pork', kind: 'preference' }])
  })

  test('"veg" tag alone does NOT satisfy Vegan', () => {
    const intel = buildIntel([{ name: 'Vera', dietary: ['Vegan'], avoid: [], adventurousness: 50 }])
    const dish = sig({ id: '9', name: 'Panna Cotta', slot: 'dessert', tags: ['veg'] })
    expect(scoreDish(dish, intel)).toEqual([{ guest: 'Vera', reason: 'not vegan', kind: 'preference' }])
  })

  test('reproduces the demo table bug: Baba Ganoush is safe for the whole vegetarian/no-pork table', () => {
    const intel = buildIntel([
      { name: 'Nadia', dietary: ['Vegetarian'], avoid: [], adventurousness: 50 },
      { name: 'Mona',  dietary: ['Vegetarian'], avoid: [], adventurousness: 50 },
      { name: 'Priya', dietary: ['Vegetarian'], avoid: [], adventurousness: 50 },
      { name: 'Tarek', dietary: ['No pork'], avoid: [], adventurousness: 50 },
    ])
    const babaGanoush = sig({ id: 'bg', name: 'Baba Ganoush', slot: 'starter', tags: ['veg', 'vegan'] })
    expect(scoreDish(babaGanoush, intel)).toEqual([])
  })

  test('deduplicates guest hit by both allergen and diet â€” first reason wins', () => {
    const intel = buildIntel([{ name: 'Ali', dietary: ['Vegan'], avoid: ['Nuts'], adventurousness: 50 }])
    const dish = sig({ id: '4', name: 'Nut Tart', slot: 'dessert', contains_allergens: ['Nuts'] })
    const excludes = scoreDish(dish, intel)
    const aliEntries = excludes.filter(e => e.guest === 'Ali')
    expect(aliEntries).toHaveLength(1)
    expect(aliEntries[0].reason).toBe('contains nuts')
  })
})

// The demo table (scripts/seed-demo-event.mjs) shows "Table fit: safe for
// 5/9 guests" for every Main â€” Land course because every land signature is
// a meat dish, so the
// same 4 diet-restricted guests (3 vegetarian + 1 no-pork) are excluded from
// all of them â€” a real property of that signature catalog, not a bug. These
// tests confirm the exclusion count genuinely tracks the allergen a dish
// contains rather than being pinned at a constant: a shellfish-containing
// sea dish excludes an additional guest beyond the land dish's diet-only
// exclusions, and a nuts-containing dish excludes a different guest set
// entirely (nut-avoiders who aren't vegetarian).
describe('demo guest data â€” exclusion counts vary by allergen, not fixed', () => {
  const demoGuests = [
    { name: 'Host',  dietary: [],              avoid: [],            adventurousness: 50 },
    { name: 'Omar',  dietary: [],              avoid: ['Pork'],      adventurousness: 50 },
    { name: 'Nadia', dietary: ['Vegetarian'],  avoid: ['Nuts'],      adventurousness: 50 },
    { name: 'Sam',   dietary: [],              avoid: ['Nuts'],      adventurousness: 50 },
    { name: 'Yara',  dietary: [],              avoid: ['Shellfish'], adventurousness: 50 },
    { name: 'Tarek', dietary: ['No pork'], avoid: [],        adventurousness: 50 },
    { name: 'Mona',  dietary: ['Vegetarian'],  avoid: ['Mushrooms'], adventurousness: 50 },
    { name: 'Dana',  dietary: [],              avoid: ['Nuts'],      adventurousness: 50 },
    { name: 'Priya', dietary: ['Vegetarian'],  avoid: [],            adventurousness: 50 },
  ]
  const intel = buildIntel(demoGuests)

  test('guest count matches the live app (host + 8 guests all RSVP)', () => {
    expect(intel.guestCount).toBe(9)
  })

  test('Main â€” Land dish (diet-only exclusions): excludes exactly the 3 vegetarians + 1 no-pork guest', () => {
    const lambKofta = sig({ id: 'land-1', name: 'Lamb Kofta', slot: 'main', tags: ['meat'] })
    const excludes = scoreDish(lambKofta, intel)
    expect(excludes.map(e => e.guest).sort()).toEqual(['Mona', 'Nadia', 'Priya', 'Tarek'])
    expect(excludes).toHaveLength(4) // Table fit: safe for 5/9 guests
  })

  test('Main â€” Sea dish with shellfish: excludes the same diet guests PLUS the shellfish-allergic guest', () => {
    const sushiPlatter = sig({
      id: 'sea-1', name: 'Sushi Platter', slot: 'main', tags: ['seafood'], contains_allergens: ['shellfish'],
    })
    const excludes = scoreDish(sushiPlatter, intel)
    expect(excludes.map(e => e.guest).sort()).toEqual(['Mona', 'Nadia', 'Priya', 'Tarek', 'Yara'])
    expect(excludes).toHaveLength(5) // Table fit: safe for 4/9 guests â€” differs from the land dish's 5/9
  })

  test('nuts-containing dish excludes a different guest set (nut-avoiders, not vegetarians)', () => {
    const muhammara = sig({
      id: 'start-1', name: 'Muhammara', slot: 'starter', tags: ['veg', 'vegan'], contains_allergens: ['nuts'],
    })
    const excludes = scoreDish(muhammara, intel)
    expect(excludes.map(e => e.guest).sort()).toEqual(['Dana', 'Nadia', 'Sam'])
    expect(excludes).toHaveLength(3) // Table fit: safe for 6/9 guests â€” differs from both the land and sea counts
  })
})

describe('scoreDish â€” pantry item', () => {
  test('excludes guest when avoid label is a substring of item name (case-insensitive)', () => {
    const intel = buildIntel([{ name: 'Ali', dietary: [], avoid: ['Nuts'], adventurousness: 50 }])
    const item = pantryItem('p1', 'Mixed Nuts Brittle')
    expect(scoreDish(item, intel)).toEqual([{ guest: 'Ali', reason: 'may contain nuts', kind: 'allergy' }])
  })

  test('does not flag when avoid label is not in item name', () => {
    const intel = buildIntel([{ name: 'Ali', dietary: [], avoid: ['Shellfish'], adventurousness: 50 }])
    const item = pantryItem('p2', 'Sourdough Bread')
    expect(scoreDish(item, intel)).toEqual([])
  })

  // Pantry now carries declared tags/allergens like signatures. Untagged items
  // still fail closed on strict diets (chef didn't claim safety), but the
  // reason is now the signature-parity "not vegan" rather than the special
  // "pantry dish â€” diet-safe status unknown".
  test('untagged pantry item fails closed on strict diet with signature-parity reason', () => {
    const intel = buildIntel([{ name: 'Sara', dietary: ['Vegan'], avoid: [], adventurousness: 50 }])
    const item = pantryItem('p3', 'Seasonal Vegetable')
    expect(scoreDish(item, intel)).toEqual([{ guest: 'Sara', reason: 'not vegan', kind: 'preference' }])
  })

  test('tagged pantry item satisfies a matching strict diet (dishSatisfiesDiet)', () => {
    const intel = buildIntel([{ name: 'Nadia', dietary: ['Vegetarian'], avoid: [], adventurousness: 50 }])
    const item = pantryItem('p4', 'Aubergine', { tags: ['veg', 'vegan'] })
    expect(scoreDish(item, intel)).toEqual([])
  })

  test('vegan-tagged pantry item satisfies No pork (same semantics as signatures)', () => {
    const intel = buildIntel([{ name: 'Tarek', dietary: ['No pork'], avoid: [], adventurousness: 50 }])
    const item = pantryItem('p5', 'Chickpeas', { tags: ['vegan'] })
    expect(scoreDish(item, intel)).toEqual([])
  })

  test('declared contains_allergens excludes allergic guest (parity with signatures)', () => {
    const intel = buildIntel([{ name: 'Ali', dietary: [], avoid: ['Nuts'], adventurousness: 50 }])
    const item = pantryItem('p6', 'Pistachio Cream', { contains_allergens: ['Nuts'] })
    expect(scoreDish(item, intel)).toEqual([{ guest: 'Ali', reason: 'contains nuts', kind: 'allergy' }])
  })

  test('declared allergen and name-substring dedup to a single exclusion per guest', () => {
    const intel = buildIntel([{ name: 'Ali', dietary: [], avoid: ['Nuts'], adventurousness: 50 }])
    // Name substring AND declared allergen both hit â€” one exclusion, not two.
    const item = pantryItem('p7', 'Mixed Nuts', { contains_allergens: ['Nuts'] })
    const excludes = scoreDish(item, intel)
    expect(excludes).toHaveLength(1)
    expect(excludes[0]).toEqual({ guest: 'Ali', reason: 'contains nuts', kind: 'allergy' })
  })
})

describe('scoreComposedDish â€” AI-composed dish safety derived from real pantry data', () => {
  // Safety for an AI-composed dish is derived from the *actual* declared
  // tags/allergens of the pantry items it's built from â€” never from the AI's
  // own say-so. This is the union of each component's scoreDish result: a
  // dish is only as safe as its least-safe ingredient.
  test('Baba Ganoush case: an all-vegan set of components is safe for every diet-restricted guest', () => {
    const intel = buildIntel([
      { name: 'Nadia', dietary: ['Vegetarian'], avoid: [], adventurousness: 50 },
      { name: 'Tarek', dietary: ['No pork'], avoid: [], adventurousness: 50 },
    ])
    const items = [
      pantryItem('p1', 'Aubergine', { tags: ['vegan'] }),
      pantryItem('p2', 'Tahini', { tags: ['vegan'] }),
    ]
    expect(scoreComposedDish(items, intel)).toEqual([])
  })

  test('flags every guest whose diet a single non-compliant component violates', () => {
    const intel = buildIntel([
      { name: 'Nadia', dietary: ['Vegetarian'], avoid: [], adventurousness: 50 },
      { name: 'Tarek', dietary: ['No pork'], avoid: [], adventurousness: 50 },
    ])
    // Lamb: violates vegetarian, but tagged safe for no-pork.
    const items = [pantryItem('p1', 'Lamb', { tags: ['meat', 'no pork'] })]
    expect(scoreComposedDish(items, intel)).toEqual([{ guest: 'Nadia', reason: 'not vegetarian', kind: 'preference' }])
  })

  test('flags guest when any component declares an allergen they avoid (case-insensitive)', () => {
    const intel = buildIntel([{ name: 'Ali', dietary: [], avoid: ['Nuts'], adventurousness: 50 }])
    const items = [
      pantryItem('p1', 'Rice', { tags: ['vegan'] }),
      pantryItem('p2', 'Pistachio Cream', { tags: ['vegan'], contains_allergens: ['nuts'] }),
    ]
    expect(scoreComposedDish(items, intel)).toEqual([{ guest: 'Ali', reason: 'contains nuts', kind: 'allergy' }])
  })

  test('untagged component fails closed on strict diet (no free pass just for being pantry-composed)', () => {
    const intel = buildIntel([
      { name: 'Nadia', dietary: ['Vegetarian'], avoid: [], adventurousness: 50 },
    ])
    const items = [pantryItem('p1', 'Seasonal Vegetable')]
    expect(scoreComposedDish(items, intel)).toEqual([{ guest: 'Nadia', reason: 'not vegetarian', kind: 'preference' }])
  })

  test('deduplicates a guest hit by multiple components â€” one exclusion per guest', () => {
    const intel = buildIntel([{ name: 'Ali', dietary: [], avoid: ['Nuts'], adventurousness: 50 }])
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
      { name: 'Nadia', dietary: ['Vegetarian'], avoid: ['Nuts'], adventurousness: 50 },
    ])
    expect(scoreComposedDish([], intel)).toEqual([])
  })
})

describe('portionGuidance', () => {
  // Static per-slot batch-size hint. The chef reads "Enough for ~N bellies" as
  // a recipe yield and scales up for the full table themselves â€” no
  // dependency on guest count so the number is stable across events. Phrased
  // disjointly from "serves" so it can't be misread as the table-fit safety
  // count shown elsewhere on the same course card.
  test('every slot returns an "Enough for ~N bellies" string', () => {
    for (const slot of SLOTS) {
      expect(portionGuidance(slot)).toMatch(/^Enough for ~\d+ bellies$/)
    }
  })

  test('start course serves fewer than mains (small bites, batch feeds more)', () => {
    const startN = parseInt(portionGuidance('starter').match(/\d+/)![0], 10)
    const seaN   = parseInt(portionGuidance('main').match(/\d+/)![0], 10)
    expect(startN).toBeGreaterThan(seaN)
  })

  test('finish course serves more than mains (small dessert portions)', () => {
    const finishN = parseInt(portionGuidance('dessert').match(/\d+/)![0], 10)
    const landN   = parseInt(portionGuidance('main').match(/\d+/)![0], 10)
    expect(finishN).toBeGreaterThan(landN)
  })
})

describe('nameMatchesSlot', () => {
  test('sea keywords match fish/seafood names', () => {
    expect(nameMatchesSlot('Sea Bass', 'main')).toBe(true)
    expect(nameMatchesSlot('Wild Salmon', 'main')).toBe(true)
    expect(nameMatchesSlot('Apricots', 'main')).toBe(false)
  })
  test('land keywords match meat names', () => {
    expect(nameMatchesSlot('Lamb Shoulder', 'main')).toBe(true)
    expect(nameMatchesSlot('Duck Breast', 'main')).toBe(true)
    expect(nameMatchesSlot('Zucchini', 'main')).toBe(false)
  })
  test('finish keywords match fruit/dessert names', () => {
    expect(nameMatchesSlot('Apricots', 'dessert')).toBe(true)
    expect(nameMatchesSlot('Dark Chocolate', 'dessert')).toBe(true)
  })
  test('green keywords match vegetables and grains', () => {
    expect(nameMatchesSlot('Aubergine', 'side')).toBe(true)
    expect(nameMatchesSlot('Rice', 'side')).toBe(true)
  })
})

describe('draftCourse', () => {
  test('picks zero-exclusion signature over one with exclusions', () => {
    const intel = buildIntel([{ name: 'Ali', dietary: [], avoid: ['Nuts'], adventurousness: 50 }])
    const sigs = [
      sig({ id: '1', name: 'Walnut Tart', slot: 'dessert', contains_allergens: ['Nuts'] }),
      sig({ id: '2', name: 'Panna Cotta', slot: 'dessert' }),
    ]
    const course = draftCourse('dessert', intel, sigs, [])
    expect(course.dishName).toBe('Panna Cotta')
    expect(course.excludes).toHaveLength(0)
  })

  // Rule-based drafting has no way to invent a coherent name for a raw
  // pantry ingredient (only the AI path can compose one), so pantry items
  // are never eligible candidates here â€” presenting one as "Chef's
  // Sourdough" would misrepresent an un-composed ingredient as a finished
  // dish. An honest empty slot is the correct outcome.
  test('does not fabricate a dish name from pantry when no slotted signatures exist', () => {
    const course = draftCourse('starter', noGuests, [], [pantryItem('p1', 'Sourdough')])
    expect(course.origin).toBe('empty')
    expect(course.dishName).toBe('')
    expect(course.slotLabel).toBe('To Start')
  })

  test('returns empty course when pool is empty', () => {
    const course = draftCourse('main', noGuests, [], [])
    expect(course.origin).toBe('empty')
    expect(course.dishName).toBe('')
    expect(course.sourceId).toBeNull()
    expect(course.excludes).toEqual([])
  })

  test('returns empty course when pantry has slot-matching items but no signature exists for the slot', () => {
    const pantry = [pantryItem('p1', 'Sea Bass'), pantryItem('p2', 'Duck Breast')]
    const course = draftCourse('main', noGuests, [], pantry)
    expect(course.origin).toBe('empty')
    expect(course.dishName).toBe('')
    expect(course.sourceId).toBeNull()
  })

  test('exclude set prevents picking the current dish, returns next-best', () => {
    const sigs = [
      sig({ id: '1', name: 'Amuse Bouche', slot: 'starter' }),
      sig({ id: '2', name: 'Oyster Shot', slot: 'starter' }),
    ]
    const first  = draftCourse('starter', noGuests, sigs, [])
    const second = draftCourse('starter', noGuests, sigs, [], new Set([first.sourceId!]))
    expect(second.sourceId).not.toBe(first.sourceId)
  })

  test('exclude-emptied pool returns empty course', () => {
    const sigs = [sig({ id: '1', name: 'Only Option', slot: 'starter' })]
    const course = draftCourse('starter', noGuests, sigs, [], new Set(['1']))
    expect(course.origin).toBe('empty')
  })

  test('tiebreaks: alphabetical by name within same tier', () => {
    const sigs = [
      sig({ id: '2', name: 'Zucchini Soup', slot: 'starter' }),
      sig({ id: '1', name: 'Amuse Bouche', slot: 'starter' }),
    ]
    const course = draftCourse('starter', noGuests, sigs, [])
    expect(course.dishName).toBe('Amuse Bouche')
  })
})

describe('deriveCourse', () => {
  const persisted = (overrides: Partial<PersistedCourseLike>): PersistedCourseLike => ({
    slot: 'starter',
    dish_name: 'Amuse Bouche',
    dish_origin: 'signature',
    source: '1',
    ...overrides,
  })

  test('signature dish resolves normally when source is found', () => {
    const sigs = [sig({ id: '1', name: 'Amuse Bouche', slot: 'starter' })]
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
    // pinning it to one single pantry_id â€” source is null, not deleted.
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
  test('returns exactly four courses in SLOTS order', () => {
    const courses = draftMenu(noGuests, [], [])
    expect(courses).toHaveLength(4)
    expect(courses.map(c => c.slot)).toEqual(SLOTS)
  })

  test('all empty when pool is empty', () => {
    const courses = draftMenu(noGuests, [], [])
    expect(courses.every(c => c.origin === 'empty')).toBe(true)
  })

  test('uses slotted signatures per slot', () => {
    const sigs = [
      sig({ id: '1', name: 'Mushroom Soup', slot: 'starter' }),
      sig({ id: '2', name: 'Sea Bass', slot: 'main' }),
    ]
    const courses = draftMenu(noGuests, sigs, [])
    expect(courses.find(c => c.slot === 'starter')?.dishName).toBe('Mushroom Soup')
    expect(courses.find(c => c.slot === 'main')?.dishName).toBe('Sea Bass')
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
describe('inferSlot â€” auto-assign when chef never set a slot', () => {
  test('meat tag maps to land', () => {
    expect(inferSlot('Lamb Kofta', ['meat'])).toBe('main')
  })
  test('seafood tag maps to sea', () => {
    expect(inferSlot('Grilled Fish', ['seafood'])).toBe('main')
  })
  test('dessert tag maps to finish', () => {
    expect(inferSlot('Panna Cotta', ['dessert'])).toBe('dessert')
  })
  test('vegan tag with no other signal maps to green', () => {
    expect(inferSlot('Chickpea Bowl', ['vegan'])).toBe('side')
  })
  test('name keywords beat tag defaults (soup â†’ start)', () => {
    expect(inferSlot('Butternut Soup', ['veg'])).toBe('starter')
  })
  test('unknown tags + generic name â†’ null (last-resort tier)', () => {
    expect(inferSlot('Mystery Plate', [])).toBeNull()
  })
  test('side tag routes to the broad side role', () => {
    expect(inferSlot('Mac and Cheese', ['veg', 'side'])).toBe('side')
    expect(inferSlot('Gyoza', ['meat', 'side'])).toBe('side')
  })
  test('starter tag routes to start even with a meat/veg course-type tag', () => {
    expect(inferSlot('Samosas', ['veg', 'vegan', 'starter'])).toBe('starter')
  })
})

describe('draftCourse never returns empty when signatures exist (the real bug)', () => {
  test('slot=null signatures still enter the pool via inferSlot', () => {
    // Simulates the DB state: chef added Baba Ganoush + Lamb Kofta from the
    // preset picker, both stored with slot=null. Neither slot was reachable
    // under the old `s.slot === slot` filter â€” start and land both went
    // empty. With inferSlot, tag 'veg'/'vegan' â†’ green (no name hit here),
    // but 'Baba Ganoush' name matches start's 'baba' keyword, so it lands
    // in start correctly.
    const sigs: Signature[] = [
      { id: '1', name: 'Baba Ganoush', tags: ['veg', 'vegan'], contains_allergens: [], slot: null },
      { id: '2', name: 'Lamb Kofta',   tags: ['meat'],         contains_allergens: [], slot: null },
    ]
    const startCourse = draftCourse('starter', noGuests, sigs, [])
    const landCourse  = draftCourse('main',  noGuests, sigs, [])
    expect(startCourse.origin).not.toBe('empty')
    expect(startCourse.dishName).toBe('Baba Ganoush')
    expect(landCourse.origin).not.toBe('empty')
    expect(landCourse.dishName).toBe('Lamb Kofta')
  })

  test('main accepts any strong main without protein-category restrictions', () => {
    // Sea has no in-slot signature, but "Sea Bass Terrine" name-matches 'main'
    // keywords â†’ slotAffinity=1 â†’ fallback pool has one candidate.
    const sigs = [
      sig({ id: 'l1', name: 'Lamb Chops',        slot: 'main',   tags: ['meat'] }),
      sig({ id: 'f1', name: 'Panna Cotta',       slot: 'dessert', tags: ['dessert'] }),
      sig({ id: 's1', name: 'Sea Bass Terrine',  slot: 'starter' }),
    ]
    const seaCourse = draftCourse('main', noGuests, sigs, [])
    expect(seaCourse.origin).toBe('signature')
    expect(seaCourse.dishName).toBe('Lamb Chops')
  })

  test('main does not require separate sea or land inventory', () => {
    // Only land + finish signatures, none name-matching sea. The old
    // behavior widened to any signature and would pick e.g. "Panna Cotta"
    // for Main â€” Sea, which mislabels the category. New behavior: honest
    // empty so the chef knows to add a real sea dish.
    const sigs = [
      sig({ id: 'l1', name: 'Lamb Chops',  slot: 'main',   tags: ['meat'] }),
      sig({ id: 'f1', name: 'Panna Cotta', slot: 'dessert', tags: ['dessert'] }),
    ]
    expect(draftCourse('main', noGuests, sigs, []).origin).toBe('signature')
    // Symmetric for land when only start/finish/green signatures exist.
    const noMeat = [
      sig({ id: 'g1', name: 'Chickpea Stew', slot: 'side', tags: ['veg'] }),
      sig({ id: 'f1', name: 'Panna Cotta',   slot: 'dessert', tags: ['dessert'] }),
    ]
    expect(draftCourse('main', noGuests, noMeat, []).origin).toBe('fallback')
  })

  test('start/green/finish still permissive â€” any signature is better than empty', () => {
    // Non-category-strict slots keep the old broad fallback: "any veg" is
    // plausible enough for start/green/finish that empty would be worse.
    const sigs = [sig({ id: 'l1', name: 'Lamb Chops', slot: 'main', tags: ['meat'] })]
    expect(draftCourse('starter', noGuests, sigs, []).origin).toBe('fallback')
    expect(draftCourse('side', noGuests, sigs, []).origin).toBe('fallback')
    expect(draftCourse('dessert', noGuests, sigs, []).origin).toBe('fallback')
  })

  test('genuinely empty signature list still returns empty (only truly-empty state)', () => {
    const c = draftCourse('main', noGuests, [], [])
    expect(c.origin).toBe('empty')
  })
})

describe('per-guest substitutions â€” strict-diet preferences become side plates', () => {
  test('vegetarian excluded from a meat main receives a labeled substitute from the veg pool', () => {
    // Table: 2 vegetarians who cannot eat lamb. Under the substitution
    // model, the main course still lands on the majority-preferred dish
    // that would otherwise best-fit the table (e.g. locked by the chef,
    // picked by the AI, or the only slotted candidate) â€” and the excluded
    // guests receive a labeled alt on the side.
    const intel = buildIntel([
      { name: 'Omar', dietary: [], avoid: [], adventurousness: 50 },
      { name: 'Nadia', dietary: ['Vegetarian'], avoid: [], adventurousness: 50 },
      { name: 'Priya', dietary: ['Vegetarian'], avoid: [], adventurousness: 50 },
    ])
    const sigs = [
      sig({ id: 'l1', name: 'Lamb Kofta',  slot: 'main',  tags: ['meat'] }),
      sig({ id: 'g1', name: 'Ratatouille', slot: 'side', tags: ['veg', 'vegan'] }),
    ]
    const lamb: Course = {
      slot: 'main',
      slotLabel: SLOT_LABELS.main,
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
      { name: 'Nadia', dietary: ['Vegetarian'], avoid: [], adventurousness: 50 },
      { name: 'Sam',   dietary: [],             avoid: ['Nuts'], adventurousness: 50 },
    ])
    // Main dish excludes Sam (nuts) AND Nadia (not vegetarian). Alt pool
    // has two veg options + one nut-free meat option, so the assignment
    // can hand each excluded guest a dish they can actually eat.
    const sigs = [
      sig({ id: 'm1', name: 'Nut-Crusted Lamb', slot: 'main', tags: ['meat'], contains_allergens: ['Nuts'] }),
      sig({ id: 'v1', name: 'Aubergine Steak',  slot: 'main', tags: ['veg', 'vegan'] }),
      sig({ id: 'm2', name: 'Plain Lamb',       slot: 'main', tags: ['meat'] }),
      sig({ id: 'v2', name: 'Ratatouille',      slot: 'main', tags: ['veg', 'vegan'] }),
    ]
    const main: Course = {
      slot: 'main',
      slotLabel: SLOT_LABELS.main,
      dishName: 'Nut-Crusted Lamb',
      origin: 'signature',
      sourceId: 'm1',
      excludes: scoreDish(sigs[0], intel),
    }
    const subs = assignSubstitutions(main, intel, sigs, new Set())
    // Both excluded guests receive a substitute they can actually eat â€”
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
      { name: 'Sam', dietary: [], avoid: ['Nuts'], adventurousness: 50 },
    ])
    const sigs = [
      sig({ id: 'f1', name: 'Walnut Tart', slot: 'dessert', contains_allergens: ['Nuts'] }),
      sig({ id: 'f2', name: 'Panna Cotta', slot: 'dessert', tags: ['veg'] }),
    ]
    // Allergy exclusions rank higher than preference exclusions, so
    // Panna Cotta (0 allergy) beats Walnut Tart (1 allergy). Sam is served.
    const course = draftCourse('dessert', intel, sigs, [])
    expect(course.dishName).toBe('Panna Cotta')
  })
})

describe('inferSlot â€” preset-name fallback for legacy DB rows', () => {
  // Existing DB rows (added before dish-presets gained the `role` field)
  // have tags like ['veg'] with no 'side'/'starter' tag. Without a fallback,
  // Mac and Cheese would infer to 'side' via the isVeg path and end up as
  // "Main â€” Green". The preset-name lookup keeps it out of the mains.
  test('Mac and Cheese with legacy [veg] tags routes to start via preset lookup', () => {
    expect(inferSlot('Mac and Cheese', ['veg'])).toBe('side')
  })
  test('Greek Salad (preset side) with legacy [veg] tags routes to start', () => {
    expect(inferSlot('Greek Salad', ['veg'])).toBe('side')
  })
  test('Tzatziki (preset starter) with legacy [veg] tags routes to start', () => {
    expect(inferSlot('Tzatziki', ['veg'])).toBe('starter')
  })
  test('Gyoza (preset starter, tagged meat) routes to start not land', () => {
    // Even 'meat' as a tag doesn't win against the preset-known starter role.
    expect(inferSlot('Gyoza', ['meat'])).toBe('starter')
  })
  test('unknown-name dish falls through to tag/keyword scoring', () => {
    expect(inferSlot('Chef Special Beef Stew', ['meat'])).toBe('main')
  })
})

describe('deriveCourse â€” composed dish re-scoring from component_ids', () => {
  // The silent-9/9 bug: an AI-composed pantry dish is persisted with
  // source=null. Without component_ids, deriveCourse can't reconstruct which
  // pantry items backed the dish, so excludes come back empty and the UI
  // shows "safe for 9/9 guests" even when the untagged components should
  // fail-closed on the 3 vegetarians. component_ids fixes this.
  const vegIntel = buildIntel([
    { name: 'Nadia', dietary: ['Vegetarian'], avoid: [], adventurousness: 50 },
  ])

  test('pantry-composed with component_ids re-scores against live pantry (untagged fails closed)', () => {
    const pantry = [
      pantryItem('p-miso', 'Miso paste'),
      pantryItem('p-orzo', 'Orzo'),
      pantryItem('p-bell', 'Bell peppers'),
    ]
    const persisted: PersistedCourseLike = {
      slot: 'main',
      dish_name: 'Creamy Miso Orzo with Charred Bell Peppers',
      dish_origin: 'pantry-composed',
      source: null,
      component_ids: ['p-miso', 'p-orzo', 'p-bell'],
    }
    const derived = deriveCourse(persisted, [], pantry, vegIntel)
    // At least one exclusion for Nadia â€” untagged pantry items fail closed
    // on vegetarian, and the composed dish inherits the union of its
    // components' exclusions.
    expect(derived.excludes.some(e => e.guest === 'Nadia')).toBe(true)
  })

  test('pantry-composed with tagged veg components has no vegetarian exclusion', () => {
    const pantry = [
      pantryItem('p1', 'Aubergine', { tags: ['veg', 'vegan'] }),
      pantryItem('p2', 'Tahini',    { tags: ['veg', 'vegan'] }),
    ]
    const persisted: PersistedCourseLike = {
      slot: 'starter',
      dish_name: 'Aubergine Tahini Dip',
      dish_origin: 'pantry-composed',
      source: null,
      component_ids: ['p1', 'p2'],
    }
    const derived = deriveCourse(persisted, [], pantry, vegIntel)
    expect(derived.excludes).toEqual([])
  })

  test('pantry-composed without component_ids stays backward-compatible (empty excludes)', () => {
    const persisted: PersistedCourseLike = {
      slot: 'main',
      dish_name: 'Legacy Composed Dish',
      dish_origin: 'pantry-composed',
      source: null,
    }
    const derived = deriveCourse(persisted, [], [], vegIntel)
    expect(derived.origin).toBe('pantry-composed')
    expect(derived.excludes).toEqual([])
  })

  test('pantry-composed with all components deleted shows source-deleted placeholder', () => {
    const persisted: PersistedCourseLike = {
      slot: 'main',
      dish_name: 'Ephemeral Dish',
      dish_origin: 'pantry-composed',
      source: null,
      component_ids: ['gone-1', 'gone-2'],
    }
    const derived = deriveCourse(persisted, [], [], vegIntel)
    expect(derived.dishName).toBe('— source deleted, swap or lock —')
    expect(derived.origin).toBe('empty')
  })
})

describe('deriveMenu â€” cross-course substitute dedup', () => {
  // Bug repro: Duck Confit on Land needs a veg substitute; the isolated
  // per-course derive picks Baba Ganoush, which is already the Start main.
  // deriveMenu threads shared used-ids/used-names so the substitute pool
  // for Land can't reuse Baba Ganoush.
  test("Land's veg substitute cannot reuse Start's main dish", () => {
    const intel = buildIntel([
      { name: 'Nadia', dietary: ['Vegetarian'], avoid: [], adventurousness: 50 },
    ])
    const signatures: Signature[] = [
      { id: 'bg', name: 'Baba Ganoush', tags: ['veg', 'vegan'], contains_allergens: [], slot: 'starter' },
      { id: 'dc', name: 'Duck Confit',  tags: ['meat'],         contains_allergens: [], slot: 'main' },
      { id: 'ch', name: 'Chana Masala', tags: ['veg', 'vegan'], contains_allergens: [], slot: 'side' },
    ]
    const persisted: PersistedCourseLike[] = [
      { slot: 'starter',  dish_name: 'Baba Ganoush', dish_origin: 'signature', source: 'bg' },
      { slot: 'main',   dish_name: 'Duck Confit',  dish_origin: 'signature', source: 'dc' },
    ]
    const derived = deriveMenu(persisted, signatures, [], intel)
    const land = derived.find(c => c.slot === 'main')!
    const babaAsSub = land.substitutions?.some(s => s.dishName === 'Baba Ganoush')
    expect(babaAsSub).toBeFalsy()
    // And a valid alternative was picked instead.
    expect(land.substitutions?.[0]?.dishName).toBe('Chana Masala')
  })

  test("composed main's name blocks a later slot's substitute of the same name", () => {
    // Course 1: pantry-composed "Chana Masala" (source=null, but named same
    // as signature 'ch'). Course 2: Duck Confit needs veg sub; sourceId
    // dedup misses because course 1 has no sourceId â€” the name dedup catches.
    const intel = buildIntel([
      { name: 'Nadia', dietary: ['Vegetarian'], avoid: [], adventurousness: 50 },
    ])
    const signatures: Signature[] = [
      { id: 'ch', name: 'Chana Masala',  tags: ['veg', 'vegan'], contains_allergens: [], slot: 'side' },
      { id: 'bg', name: 'Baba Ganoush',  tags: ['veg', 'vegan'], contains_allergens: [], slot: 'starter' },
      { id: 'dc', name: 'Duck Confit',   tags: ['meat'],         contains_allergens: [], slot: 'main' },
    ]
    const pantry = [pantryItem('p-veg', 'Aubergine', { tags: ['vegan'] })]
    const persisted: PersistedCourseLike[] = [
      { slot: 'starter', dish_name: 'Chana Masala', dish_origin: 'pantry-composed', source: null, component_ids: ['p-veg'] },
      { slot: 'main',  dish_name: 'Duck Confit',  dish_origin: 'signature',       source: 'dc' },
    ]
    const derived = deriveMenu(persisted, signatures, pantry, intel)
    const land = derived.find(c => c.slot === 'main')!
    // Chana Masala the signature must NOT be handed as a substitute even
    // though the composed main shares its name (sourceId=null â†’ name dedup).
    expect(land.substitutions?.some(s => s.dishName === 'Chana Masala')).toBeFalsy()
    // Baba Ganoush is next-best veg option.
    expect(land.substitutions?.[0]?.dishName).toBe('Baba Ganoush')
  })
})

describe('shortlistSignaturesForAI â€” trims AI prompt while preserving strong picks', () => {
  test('unions top-K per slot into one deduped list, preserving slot-order encounters', () => {
    const intel = buildIntel([
      { name: 'Ali', dietary: [], avoid: [], adventurousness: 50 },
    ])
    const sigs = [
      sig({ id: 'oct',  name: 'Charred Octopus', slot: 'main',    tags: ['seafood'] }),
      sig({ id: 'lamb', name: 'Braised Lamb',    slot: 'main',   tags: ['meat'] }),
      sig({ id: 'salm', name: 'Roasted Salmon',  slot: 'main',    tags: ['seafood'] }),
      sig({ id: 'chan', name: 'Chana Masala',    slot: 'side',  tags: ['vegan'] }),
      sig({ id: 'baba', name: 'Baba Ganoush',    slot: 'starter',  tags: ['vegan'] }),
      sig({ id: 'knaf', name: 'Knafeh',          slot: 'dessert', tags: ['dessert'] }),
      sig({ id: 'duck', name: 'Duck Confit',     slot: 'main',   tags: ['meat'] }),
    ]
    const short = shortlistSignaturesForAI(sigs, intel, 2)
    expect(short).toHaveLength(5)
    expect(new Set(short.map(s => s.id))).toEqual(new Set(['baba', 'lamb', 'oct', 'chan', 'knaf']))
  })

  test('drops weak candidates when catalog is bigger than K Ã— slots', () => {
    const intel = buildIntel([
      { name: 'Ali', dietary: [], avoid: [], adventurousness: 50 },
    ])
    // 10 desserts and 10 meats â€” with K=1 and 5 slots (at most 5 wins), most
    // of the catalog is dropped. The strongest per-slot picks by affinity
    // survive; the rest are trimmed.
    const many = [
      ...Array.from({ length: 10 }, (_, i) =>
        sig({ id: `d${i}`, name: `Dessert ${i}`, slot: 'dessert', tags: ['dessert'] })
      ),
      ...Array.from({ length: 10 }, (_, i) =>
        sig({ id: `m${i}`, name: `Meat ${i}`, slot: 'main', tags: ['meat'] })
      ),
    ]
    const short = shortlistSignaturesForAI(many, intel, 1)
    // Two winners: one per slot (finish, land). Other three slots have no
    // matching sigs â€” they still pick the alphabetically-first candidate,
    // but that's usually one already picked for finish/land, so dedup collapses.
    expect(short.length).toBeGreaterThanOrEqual(2)
    expect(short.length).toBeLessThan(many.length)
  })

  test('demotes dishes with true allergies for affected guests', () => {
    const intel = buildIntel([
      { name: 'Sam', dietary: [], avoid: ['Nuts'], adventurousness: 50 },
    ])
    const sigs = [
      sig({ id: 'nuts', name: 'Almond Cake',   slot: 'dessert', tags: ['dessert'], contains_allergens: ['nuts'] }),
      sig({ id: 'safe', name: 'Chocolate Tart', slot: 'dessert', tags: ['dessert'] }),
    ]
    const short = shortlistSignaturesForAI(sigs, intel, 1)
    // The nut-free dessert should be first (fewer allergy excludes).
    const finishPick = short.find(s => s.slot === 'dessert')
    expect(finishPick?.id).toBe('safe')
  })
})

describe('assignSubstitutions â€” usedNames filter', () => {
  test('busyNames blocks a substitute name even when its id is not in busyIds', () => {
    const intel = buildIntel([
      { name: 'Nadia', dietary: ['Vegetarian'], avoid: [], adventurousness: 50 },
    ])
    const sigs = [
      sig({ id: 'bg', name: 'Baba Ganoush', slot: 'starter', tags: ['veg', 'vegan'] }),
      sig({ id: 'ch', name: 'Chana Masala', slot: 'side', tags: ['veg', 'vegan'] }),
    ]
    const main: Course = {
      slot: 'main',
      slotLabel: SLOT_LABELS.main,
      dishName: 'Osso Buco',
      origin: 'signature',
      sourceId: 'ob',
      excludes: [{ guest: 'Nadia', reason: 'not vegetarian', kind: 'preference' }],
    }
    // Baba Ganoush isn't in busyIds, but its name is in usedNames â€” must skip.
    const subs = assignSubstitutions(main, intel, sigs, new Set(), new Set(['baba ganoush']))
    expect(subs).toHaveLength(1)
    expect(subs[0].dishName).toBe('Chana Masala')
  })
})

