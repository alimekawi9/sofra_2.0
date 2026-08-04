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
  tags: string[]
  contains_allergens: string[]
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
  // Populated only for AI-generated courses; explains why the model picked this dish.
  reasoning?: string
}

export const SLOTS: Slot[] = ['start', 'sea', 'land', 'green', 'finish']

export const SLOT_LABELS: Record<Slot, string> = {
  start:  'To Start',
  sea:    'Main — Sea',
  land:   'Main — Land',
  green:  'Main — Green',
  finish: 'To Finish',
}

// Coarse name-based routing so pantry fallbacks pick something plausible for
// the slot (fish for Sea, meat for Land, etc.) instead of the first item
// alphabetically. Not exhaustive — a miss just means the item won't be
// preferred, and the sort falls back to alphabetical.
export const SLOT_KEYWORDS: Record<Slot, string[]> = {
  start: [
    'bread', 'sourdough', 'focaccia', 'cracker', 'olive', 'labneh', 'yogurt',
    'feta', 'burrata', 'ricotta', 'cured', 'prosciutto', 'jamon', 'salami',
    'tartare', 'crudo', 'ceviche', 'soup', 'broth', 'dip', 'hummus', 'baba',
    'muhammara', 'mezze',
  ],
  sea: [
    'fish', 'salmon', 'tuna', 'cod', 'bass', 'trout', 'mackerel', 'sardine',
    'anchovy', 'halibut', 'sole', 'monkfish', 'bream', 'turbot', 'sea ',
    'shrimp', 'prawn', 'crab', 'lobster', 'clam', 'mussel', 'oyster', 'scallop',
    'octopus', 'squid', 'calamari', 'urchin', 'uni', 'roe', 'caviar', 'seafood',
  ],
  land: [
    'beef', 'steak', 'lamb', 'pork', 'chicken', 'duck', 'poultry', 'veal',
    'venison', 'rabbit', 'quail', 'pigeon', 'turkey', 'sausage', 'chorizo',
    'bacon', 'meat', 'game', 'kofta', 'kebab', 'shawarma',
  ],
  green: [
    'spinach', 'kale', 'chard', 'arugula', 'watercress', 'lettuce', 'courgette',
    'zucchini', 'aubergine', 'eggplant', 'pepper', 'tomato', 'carrot', 'beet',
    'onion', 'shallot', 'leek', 'fennel', 'artichoke', 'asparagus', 'broccoli',
    'cauliflower', 'cabbage', 'squash', 'pumpkin', 'mushroom', 'truffle', 'pea',
    'bean', 'lentil', 'chickpea', 'rice', 'risotto', 'pasta', 'polenta',
    'quinoa', 'farro', 'barley', 'greens', 'vegetable', 'vegetables', 'herb',
    'tofu',
  ],
  finish: [
    'chocolate', 'cocoa', 'cream', 'honey', 'sugar', 'fruit', 'apricot',
    'peach', 'plum', 'cherry', 'strawberry', 'raspberry', 'blueberry',
    'blackberry', 'fig', 'pear', 'apple', 'pomegranate', 'citrus', 'lemon',
    'orange', 'date', 'pistachio', 'almond', 'walnut', 'hazelnut', 'pecan',
    'coffee', 'tea', 'cardamom', 'vanilla', 'rose', 'baklava', 'tart',
    'cake', 'sorbet', 'gelato', 'ice cream', 'panna cotta', 'mousse',
    'dessert', 'halva', 'knafeh',
  ],
}

export function nameMatchesSlot(name: string, slot: Slot): boolean {
  const n = name.toLowerCase()
  return SLOT_KEYWORDS[slot].some(k => n.includes(k))
}

// Static recipe-yield hint per slot. Independent of guest count so the
// number is stable across events — the chef reads it as "one prep of this
// dish serves ~N" and scales up for the full table themselves. Small bites
// (start) and small desserts (finish) yield more per batch than mains
// (sea/land/green) which are typically plated per guest.
export const SLOT_PORTIONS: Record<Slot, number> = {
  start:  6,
  sea:    4,
  land:   4,
  green:  6,
  finish: 8,
}

export function portionGuidance(slot: Slot): string {
  return `Serves approximately ${SLOT_PORTIONS[slot]}`
}

// A strict-diet hard limit's label ("Vegetarian" | "Vegan" | "No pork/alcohol"
// | "Kosher") is satisfied by any of these signature-tag values. Two things
// to know:
//   1. "veg" is the shorthand the seed data (lib/dish-presets.ts) uses for
//      vegetarian — literal-equal checks miss it and reject every vegetarian
//      signature.
//   2. Vegan ⊂ Vegetarian, and vegan food has no pork / animal products, so
//      it satisfies "no pork/alcohol" and Kosher as well. Vegetarian is
//      deliberately NOT treated as safe here — a "veg" dish can still contain
//      wine. Chef can tag "no pork/alcohol" explicitly on a non-vegan dish
//      they know is safe (e.g. a plain grilled meat dish).
const DIET_SATISFIED_BY: Record<string, Set<string>> = {
  vegetarian:          new Set(['vegetarian', 'veg', 'vegan']),
  vegan:               new Set(['vegan']),
  'no pork/alcohol':   new Set(['no pork/alcohol', 'vegan']),
  kosher:              new Set(['kosher', 'vegan']),
}

// Nicer phrasing than the generic `not ${tag}` for diet labels that don't
// read well negated ("not no pork/alcohol").
const DIET_VIOLATION_REASON: Record<string, string> = {
  'no pork/alcohol': 'contains pork or alcohol',
}

function dishSatisfiesDiet(dishTags: string[], dietLabel: string): boolean {
  const diet = dietLabel.toLowerCase()
  const satisfiers = DIET_SATISFIED_BY[diet] ?? new Set([diet])
  return dishTags.some(t => satisfiers.has(t.toLowerCase()))
}

function dietViolationReason(dietLabel: string): string {
  const diet = dietLabel.toLowerCase()
  return DIET_VIOLATION_REASON[diet] ?? `not ${diet}`
}

export function scoreDish(dish: Signature | PantryItem, intel: TableIntel): Exclusion[] {
  const seen = new Set<string>()
  const result: Exclusion[] = []

  // Both signatures and pantry items now carry declared tags + allergens,
  // so the diet check and declared-allergen check are identical. The only
  // pantry-specific behavior is the extra name-substring fallback for
  // allergens: chef may add "Pistachios" to the pantry without remembering
  // to tag "nuts", and we don't want the safety net to miss that.
  const isSignature = 'slot' in dish

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

  if (!isSignature) {
    // Pantry-only safety net: approximate substring match on the item name.
    // Not medical-grade — a chef who declares contains_allergens accurately
    // gets exact behavior; this only rescues un-tagged raw ingredients whose
    // names carry the allergen word ("Pistachios", "Mixed Nuts Brittle").
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
  }

  for (const limit of intel.hardLimits.filter(h => h.type === 'diet')) {
    const tag = limit.label.toLowerCase()
    if (dishSatisfiesDiet(dish.tags, tag)) continue
    for (const guestName of limit.guests) {
      if (seen.has(guestName)) continue
      seen.add(guestName)
      result.push({ guest: guestName, reason: dietViolationReason(limit.label) })
    }
  }

  return result
}

// Safety check for AI-composed dishes.
//
// A composed dish is only as safe as its least-safe ingredient. Safety is
// derived from the union of each real pantry item's own scoreDish result —
// never from any self-declared safety claim by the AI about the composed
// dish. The AI's job is to name a dish and tell us which pantry items back
// it; the safety verdict comes entirely from those items' declared tags and
// allergens (which the chef controls).
//
// Deduplication: a guest hit by multiple components collapses to one
// exclusion (first component's reason wins), matching scoreDish's per-guest
// semantics.
export function scoreComposedDish(items: PantryItem[], intel: TableIntel): Exclusion[] {
  const seen = new Set<string>()
  const result: Exclusion[] = []
  for (const item of items) {
    for (const excl of scoreDish(item, intel)) {
      if (seen.has(excl.guest)) continue
      seen.add(excl.guest)
      result.push(excl)
    }
  }
  return result
}

type Candidate = {
  sourceId: string
  dishName: string
  exclusions: Exclusion[]
}

// Rule-based drafting can only offer chef-curated signatures as named dishes:
// it has no way to invent a coherent name for a raw pantry ingredient the way
// the AI path does (see the "never name a composed dish 'Chef's <ingredient>'"
// instruction in lib/menu-ai.ts's prompt). Presenting a raw pantry item as
// "Chef's Apricots" misrepresents an un-composed ingredient as a finished
// dish, so pantry items are not eligible candidates here — an honest empty
// slot is preferable to a fabricated name. Pantry-composed dishes still reach
// the menu, just only via the AI path, which supplies a real dish_name.
export function draftCourse(
  slot: Slot,
  intel: TableIntel,
  signatures: Signature[],
  pantry: PantryItem[],
  exclude?: Set<string>
): Course {
  const slotLabel = SLOT_LABELS[slot]

  const candidates: Candidate[] = signatures
    .filter(s => s.slot === slot)
    .map(s => ({
      sourceId: s.id,
      dishName: s.name,
      exclusions: scoreDish(s, intel),
    }))

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
    return a.dishName.localeCompare(b.dishName)
  })

  const winner = pool[0]
  return {
    slot,
    slotLabel,
    dishName: winner.dishName,
    origin: 'signature',
    sourceId: winner.sourceId,
    excludes: winner.exclusions,
  }
}

export function draftMenu(
  intel: TableIntel,
  signatures: Signature[],
  pantry: PantryItem[]
): Course[] {
  // Slots are drafted in order, excluding dishes already used by earlier
  // slots in this same menu — otherwise ties (e.g. no pantry item matching a
  // slot's keywords) resolve identically per slot and the same dish gets
  // picked for multiple courses.
  const used = new Set<string>()
  return SLOTS.map(slot => {
    const course = draftCourse(slot, intel, signatures, pantry, used)
    if (course.sourceId) used.add(course.sourceId)
    return course
  })
}

export type PersistedCourseLike = {
  slot: string
  dish_name: string
  dish_origin: string | null
  source: string | null
}

// Turns a persisted menu_courses row into a displayable Course, re-checking
// its source against the live signatures/pantry lists. A course only counts
// as "source deleted" when it was actually linked to a catalog entry (source
// is set) that entry is now gone — a null source (e.g. an AI-composed dish
// not tied to one specific pantry item) is not a deletion and must keep its
// dish_name.
export function deriveCourse(
  persisted: PersistedCourseLike,
  signatures: Signature[],
  pantry: PantryItem[],
  intel: TableIntel
): Course {
  const slot = persisted.slot as Slot
  const slotLabel = SLOT_LABELS[slot] ?? persisted.slot

  if (!persisted.dish_name || persisted.dish_origin === 'empty') {
    return {
      slot,
      slotLabel,
      dishName: '',
      origin: 'empty',
      sourceId: null,
      excludes: [],
    }
  }

  let sourceDish: Signature | PantryItem | undefined
  if (persisted.dish_origin === 'signature') {
    sourceDish = signatures.find(s => s.id === persisted.source)
  } else if (persisted.dish_origin === 'pantry-composed') {
    sourceDish = pantry.find(p => p.id === persisted.source)
  }

  const sourceDeleted =
    (persisted.dish_origin === 'signature' || persisted.dish_origin === 'pantry-composed')
    && !!persisted.source
    && !sourceDish

  return {
    slot,
    slotLabel,
    dishName: sourceDeleted ? '— source deleted, swap or lock —' : persisted.dish_name,
    origin: sourceDeleted ? 'empty' : ((persisted.dish_origin as CourseOrigin) ?? 'empty'),
    sourceId: persisted.source,
    excludes: sourceDish ? scoreDish(sourceDish, intel) : [],
  }
}

// AI-assisted menu generation lives in `./menu-ai` (server-only) so this file
// stays safe to import from client components.
