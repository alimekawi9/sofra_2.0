import type { TableIntel } from './intel'
import { dishRoleByName } from './dish-presets'
import { proteinPreferenceWeightedScore } from './protein-preferences'
import { normalizeDishScoringData } from './dish-scoring'
import { inferIngredientAllergens, reconcileDishDietaryClaims } from './ingredient-safety'

export type Slot = 'starter' | 'main' | 'side' | 'dessert'
// 'fallback' — last-resort signature that still had exclusions but was picked
// so the slot wouldn't render empty. Displays with a warning band.
export type CourseOrigin = 'signature' | 'pantry-composed' | 'fallback' | 'empty'

export type Signature = {
  id: string
  name: string
  tags: string[]
  contains_allergens: string[]
  slot: Slot | null
  novelty_score?: number | null
  is_substantial?: boolean | null
}

export type PantryItem = {
  id: string
  name: string
  tags: string[]
  contains_allergens: string[]
  novelty_score?: number | null
  is_substantial?: boolean | null
}

// An exclusion the main dish can't avoid — either a true allergy (physical
// danger, hard block) or a preference (dietary or taste — kept out of the
// main dish but plated a substitute).
export type ExclusionKind = 'allergy' | 'preference'

export type Exclusion = {
  guest: string
  reason: string
  kind: ExclusionKind
}

// One substitute plated on the side for a subset of the table. Same shape as
// Course but scoped to a group of guests.
export type Substitution = {
  guests: string[]
  dishName: string
  origin: 'signature' | 'pantry-composed'
  sourceId: string | null
}

export type Course = {
  slot: Slot
  slotLabel: string
  dishName: string
  origin: CourseOrigin
  sourceId: string | null
  excludes: Exclusion[]
  // Per-guest substitutes for guests in `excludes`. Guests grouped by shared
  // substitute dish. Guests hit by an allergy still appear in `excludes` but
  // may not receive a substitute if the pool has nothing safer for them —
  // that's still visible to the chef as a "no substitute available" state.
  substitutions?: Substitution[]
  // For pantry-composed dishes, the pantry item ids that make up the dish.
  // Needed so `deriveCourse` can re-score composed dishes on page reload —
  // without them, source=null pantry-composed rows would return excludes=[]
  // and silently look safe for the whole table.
  componentIds?: string[]
  // Populated only for AI-generated courses; explains why the model picked this dish.
  reasoning?: string
}

export const SLOTS: Slot[] = ['starter', 'main', 'side', 'dessert']

export const SLOT_LABELS: Record<Slot, string> = {
  starter: 'To Start',
  main: 'Mains',
  side: 'On the Side',
  dessert: 'To Finish',
}

export function broadRoleForSlot(slot: string): 'starter'|'main'|'side'|'dessert'|'flex' {
  if (slot === 'start' || slot === 'starter') return 'starter'
  if (slot === 'sea' || slot === 'land' || slot === 'main') return 'main'
  if (slot === 'green' || slot === 'side') return 'side'
  if (slot === 'finish' || slot === 'dessert') return 'dessert'
  return 'flex'
}

export function displayRoleLabel(slot: string): string {
  return broadRoleForSlot(slot).toUpperCase()
}

export function normalizeSlot(slot: string): Slot {
  const role = broadRoleForSlot(slot)
  return role === 'flex' ? 'main' : role
}

// Coarse name-based routing so pantry fallbacks pick something plausible for
// the slot (fish for Sea, meat for Land, etc.) instead of the first item
// alphabetically. Not exhaustive — a miss just means the item won't be
// preferred, and the sort falls back to alphabetical.
export const SLOT_KEYWORDS: Record<Slot, string[]> = {
  starter: [
    'bread', 'sourdough', 'focaccia', 'cracker', 'olive', 'labneh', 'yogurt',
    'feta', 'burrata', 'ricotta', 'cured', 'prosciutto', 'jamon', 'salami',
    'tartare', 'crudo', 'ceviche', 'soup', 'broth', 'dip', 'hummus', 'baba',
    'muhammara', 'mezze',
  ],
  main: [
    'fish', 'salmon', 'tuna', 'cod', 'bass', 'trout', 'mackerel', 'sardine',
    'anchovy', 'halibut', 'sole', 'monkfish', 'bream', 'turbot', 'sea ',
    'shrimp', 'prawn', 'crab', 'lobster', 'clam', 'mussel', 'oyster', 'scallop',
    'octopus', 'squid', 'calamari', 'urchin', 'uni', 'roe', 'caviar', 'seafood',
    'beef', 'steak', 'lamb', 'pork', 'chicken', 'duck', 'poultry', 'veal',
    'venison', 'rabbit', 'quail', 'pigeon', 'turkey', 'sausage', 'chorizo',
    'bacon', 'meat', 'game', 'kofta', 'kebab', 'shawarma',
  ],
  side: [
    'spinach', 'kale', 'chard', 'arugula', 'watercress', 'lettuce', 'courgette',
    'zucchini', 'aubergine', 'eggplant', 'pepper', 'tomato', 'carrot', 'beet',
    'onion', 'shallot', 'leek', 'fennel', 'artichoke', 'asparagus', 'broccoli',
    'cauliflower', 'cabbage', 'squash', 'pumpkin', 'mushroom', 'truffle', 'pea',
    'bean', 'lentil', 'chickpea', 'rice', 'risotto', 'pasta', 'polenta',
    'quinoa', 'farro', 'barley', 'greens', 'vegetable', 'vegetables', 'herb',
    'tofu',
  ],
  dessert: [
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
  starter: 6,
  main: 4,
  side: 6,
  dessert: 8,
}

// calculateTargetDishCount (lib/recommendation/planning.ts) already scales
// dish COUNT with guest count, up to its cap of 9 dishes at guestCount=13
// (2 + ceil(g/2) >= 9 first at g=13). Below that point guest-count growth is
// already absorbed by having more dishes per role, so the static per-slot
// yield holds. Beyond it, dish count can't grow any further, so each dish's
// batch size has to pick up the slack instead. This constant is deliberately
// NOT imported from the recommendation module (menu.ts stays a dependency
// of that module, not the reverse) -- it's the guest count at which that
// formula's own math caps out, restated here.
const PORTION_SCALING_REFERENCE_GUESTS = 13
// Sanity bound so a data glitch (or a genuinely huge party) never renders an
// absurd batch number -- SLOT_PORTIONS stays a baseline reference, not
// something guestCount multiplies without limit.
const PORTION_SCALING_MAX_MULTIPLIER = 4

// Deliberately says "bellies" rather than "serves" — this is a raw cooking
// quantity (how much to prep), not a guest-safety count. Keeping the wording
// disjoint from the table-fit safety label avoids the two being read as
// answers to the same question.
//
// guestCount is optional and purely cosmetic -- this function never affects
// which or how many dishes exist (that's calculateTargetDishCount's job
// alone; see lib/recommendation/planning.ts). Omitting it (or passing a
// count at/under the reference above) returns the original static baseline
// unchanged, so every existing caller keeps working exactly as before.
export function portionGuidance(slot: Slot, guestCount?: number): string {
  const baseline = SLOT_PORTIONS[slot]
  if (!guestCount || guestCount <= PORTION_SCALING_REFERENCE_GUESTS) {
    return `Enough for ~${baseline} bellies`
  }
  const ratio = Math.min(PORTION_SCALING_MAX_MULTIPLIER, guestCount / PORTION_SCALING_REFERENCE_GUESTS)
  const scaled = Math.max(baseline, Math.round(baseline * ratio))
  return `Enough for ~${scaled} bellies`
}

// True allergies — physical-danger stakes. These hard-block a dish from being
// picked at all (the guest cannot receive a plated substitute of the SAME
// dish; the whole main is off-limits for the whole table if we can't route
// around them, so they get an alternative). Everything not in this set (Pork
// as religious preference, Cilantro/Mushrooms as taste, and all strict diets)
// is a substitution case: majority-preferred dish is still selected for the
// table, minority gets a labeled substitute.
export const TRUE_ALLERGENS = new Set(['nuts', 'shellfish', 'dairy', 'eggs', 'gluten', 'soy'])

function isTrueAllergy(label: string): boolean {
  return TRUE_ALLERGENS.has(label.toLowerCase())
}

// A strict-diet hard limit's label ("Vegetarian" | "Vegan" | "No pork"
// | "Kosher") is satisfied by any of these signature-tag values. Two things
// to know:
//   1. "veg" is the shorthand the seed data (lib/dish-presets.ts) uses for
//      vegetarian — literal-equal checks miss it and reject every vegetarian
//      signature.
//   2. Vegan ⊂ Vegetarian, and vegan/vegetarian food has no pork / meat at
//      all, so it satisfies "no pork" and Kosher as well. Chef can tag
//      "no pork" explicitly on a non-vegetarian dish they know is safe (e.g.
//      a beef or chicken dish). "no pork" used to also mean "no alcohol",
//      which is why plain vegetarian dishes were deliberately excluded (a
//      "veg" dish can still contain wine) — that pairing was dropped, so
//      this is now purely about pork and a "veg" dish qualifies too.
const DIET_SATISFIED_BY: Record<string, Set<string>> = {
  vegetarian:          new Set(['vegetarian', 'veg', 'vegan']),
  vegan:               new Set(['vegan']),
  'no pork':           new Set(['no pork', 'vegan', 'veg', 'vegetarian']),
  kosher:              new Set(['kosher', 'vegan']),
  'gluten-free':       new Set(['gluten-free']),
  'no dairy':          new Set(['no dairy', 'vegan']),
  pescatarian:         new Set(['pescatarian', 'seafood', 'veg', 'vegan']),
}

// Infer a slot when the chef didn't set one (which is currently every
// signature — the DB column exists but no UI writes it, so every row is NULL).
// Tag-based mapping first (most reliable when the chef tagged 'meat',
// 'seafood', 'dessert', 'veg'/'vegan'), then name-keyword match, else null.
// Callers persist the inferred slot back to the DB on first read so it's
// stable across generations. Returns null only when nothing plausible fits —
// caller then treats the signature as slot-agnostic (last-resort tier).
//
// 'side'/'starter' is checked before any course-type tag: a dish can be
// tagged 'meat' or 'veg' for diet/allergen matching (it IS a meat dish, it
// IS vegetarian-safe) while still not being a standalone main — Mac and
// Cheese is 'veg' but a side, Gyoza is 'meat' but a starter. Those dishes
// route to 'start' so "Main — Land" / "Main — Green" only ever draw from
// genuine mains.
export function inferSlot(name: string, tags: string[]): Slot | null {
  const tagset = new Set(tags.map(t => t.toLowerCase()))
  if (tagset.has('starter')) return 'starter'
  if (tagset.has('side')) return 'side'
  // Preset-name fallback: legacy DB rows (added before the role tag existed)
  // still lack 'side'/'starter' in their stored tags. Consulting the preset
  // list by name keeps Mac and Cheese / Greek Salad / Tzatziki / Gyoza / etc.
  // out of Main — Land/Sea/Green without needing to backfill every row.
  const presetRole = dishRoleByName(name)
  if (presetRole === 'main') return 'main'
  if (presetRole === 'side' || presetRole === 'starter') return presetRole
  if (tagset.has('dessert')) return 'dessert'
  if (tagset.has('main') || tagset.has('seafood') || tagset.has('meat')) return 'main'
  // veg/vegan without any of the above → green main; refined below by name match
  const isVeg = tagset.has('veg') || tagset.has('vegan') || tagset.has('vegetarian')

  // Score against every slot's keyword list, pick the best.
  const scores: Record<Slot, number> = { starter: 0, main: 0, side: 0, dessert: 0 }
  const n = name.toLowerCase()
  for (const slot of SLOTS) {
    for (const k of SLOT_KEYWORDS[slot]) {
      if (n.includes(k)) scores[slot] += 1
    }
  }
  const best = SLOTS.reduce<{ slot: Slot; score: number } | null>(
    (acc, s) => (!acc || scores[s] > acc.score ? { slot: s, score: scores[s] } : acc),
    null
  )
  if (best && best.score > 0) return best.slot

  if (isVeg) return 'main'
  return null
}

// Return every signature with a resolved slot: the stored one if present,
// otherwise the inferred one. Signatures where nothing can be inferred keep
// null — they still enter the last-resort pool but never win a normal slot.
export function withInferredSlots(signatures: Signature[]): Signature[] {
  return signatures.map(s => (s.slot ? s : { ...s, slot: inferSlot(s.name, s.tags) }))
}

// Nicer phrasing than the generic `not ${tag}` for diet labels that don't
// read well negated ("not no pork").
const DIET_VIOLATION_REASON: Record<string, string> = {
  'no pork': 'contains pork',
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
  const scoring = normalizeDishScoringData(dish)
  const seen = new Set<string>()
  const result: Exclusion[] = []

  // Both signatures and pantry items now carry declared tags + allergens,
  // so the diet check and declared-allergen check are identical. The only
  // pantry-specific behavior is the extra name-substring fallback for
  // allergens: chef may add "Pistachios" to the pantry without remembering
  // to tag "nuts", and we don't want the safety net to miss that.
  const isSignature = 'slot' in dish

  for (const allergen of scoring.allergens) {
    const limit = intel.hardLimits.find(
      h => h.type === 'allergy' && h.label.toLowerCase() === allergen.toLowerCase()
    )
    if (!limit) continue
    const kind: ExclusionKind = isTrueAllergy(allergen) ? 'allergy' : 'preference'
    for (const guestName of limit.guests) {
      if (seen.has(guestName)) continue
      seen.add(guestName)
      result.push({ guest: guestName, reason: `contains ${allergen.toLowerCase()}`, kind })
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
      const kind: ExclusionKind = isTrueAllergy(limit.label) ? 'allergy' : 'preference'
      for (const guestName of limit.guests) {
        if (seen.has(guestName)) continue
        seen.add(guestName)
        result.push({ guest: guestName, reason: `may contain ${labelLC}`, kind })
      }
    }
  }

  // Strict diets are always preferences, not allergies — they're a labeled-
  // substitute case, never a hard block.
  for (const limit of intel.hardLimits.filter(h => h.type === 'diet')) {
    const tag = limit.label.toLowerCase()
    if (dishSatisfiesDiet(scoring.dietary, tag)) continue
    for (const guestName of limit.guests) {
      if (seen.has(guestName)) continue
      seen.add(guestName)
      result.push({ guest: guestName, reason: dietViolationReason(limit.label), kind: 'preference' })
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
export function scoreComposedDish(items: PantryItem[], intel: TableIntel, metadata?: PersistedCourseLike['scoring_metadata']): Exclusion[] {
  if (items.length === 0) return []
  const metadataTags = metadata ? [
    ...(metadata.proteinBase ?? []), ...(metadata.flavors ?? []), ...(metadata.textures ?? []),
    ...(metadata.techniques ?? []), ...(metadata.temperature ?? []), ...(metadata.richness ?? []),
    ...(metadata.dietary ?? []),
  ] : []
  const ingredientNames = [...items.map(item => item.name), ...(metadata?.missingIngredients ?? []).map(item => item.name)]
  const inferredAllergens = ingredientNames.flatMap(inferIngredientAllergens)
  const dietary = reconcileDishDietaryClaims(metadata?.dietary ?? [], ingredientNames, items.flatMap(item => item.tags))
  const composite: Signature = {
    id: 'composed', name: items.map(item => item.name).join(' '), slot: null,
    tags: Array.from(new Set([...items.flatMap(item => item.tags), ...metadataTags, ...dietary])),
    contains_allergens: Array.from(new Set([...items.flatMap(item => item.contains_allergens), ...(metadata?.allergens ?? []), ...inferredAllergens])),
    novelty_score: metadata?.noveltyScore ?? null,
    is_substantial: metadata?.substantial ?? null,
  }
  return scoreDish(composite, intel)
}

type Candidate = {
  sourceId: string
  dishName: string
  exclusions: Exclusion[]
  // Split so we can prefer dishes that avoid true allergies more strongly
  // than dishes that merely dodge preferences (which have substitutes).
  allergyExcludes: number
  preferenceExcludes: number
  // How well the dish matches soft table signals (dominant dietMix,
  // adventurousness). Higher = better.
  tableFit: number
  // For tie-breaking / last-resort ranking.
  slotAffinity: number
}

function countByKind(exclusions: Exclusion[], kind: ExclusionKind): number {
  return exclusions.filter(e => e.kind === kind).length
}

// Table-fit heuristic: rewards dishes whose tags satisfy soft dietary
// signals (Pescatarian, Halal, No dairy expressed informationally, etc.)
// that DIDN'T rise to a strict/substitute limit. Also nudges by
// adventurousness proxy — adventurous tables get a small bonus for less
// mainstream flavor tags. Rough by design: real preference-fit tuning
// happens in the AI path via the prompt.
function tagsSatisfyLabel(dishTags: string[], label: string): boolean {
  const t = new Set(dishTags.map(x => x.toLowerCase()))
  const l = label.toLowerCase()
  switch (l) {
    case 'pescatarian':  return t.has('seafood') || t.has('veg') || t.has('vegan') || t.has('pescatarian')
    // "no pork" no longer implies alcohol-free (that pairing was dropped),
    // so it can't stand in for halal on its own anymore — only an explicit
    // vegan/veg/halal tag counts.
    case 'halal':        return t.has('vegan') || t.has('veg') || t.has('halal')
    case 'gluten-free':  return t.has('gluten-free')
    case 'no dairy':     return t.has('no dairy') || t.has('vegan')
    default:             return t.has(l)
  }
}

function tableFitScore(dish: Signature | PantryItem, intel: TableIntel): number {
  // With no guests, we have nothing to fit to — every candidate scores 0
  // so the sort falls through to slotAffinity + alphabetical. This is what
  // the tiebreak tests exercise.
  if (intel.guestCount === 0) return 0

  let score = 0
  const scoring = normalizeDishScoringData(dish)
  // Soft dietary preferences — a bonus each time a guest's soft signal is
  // satisfied. Uses raw counts (a dominant Pescatarian mix matters more).
  for (const { label, count } of intel.dietMix) {
    if (tagsSatisfyLabel(scoring.dietary, label)) score += count
  }
  // Protein/base fit retains the configured 45% weight. Each guest earns at
  // most one match per dish even when they selected two options.
  score += proteinPreferenceWeightedScore(intel.proteinPreferencesByGuest, scoring.proteinBases)
  const flavorAliases:Record<string,string[]>={
    'bright & sour':['acidic','fresh'],
    'plain & clean':['fresh'],
    'sweet-savoury':['sweet','umami'],
    herby:['fresh'],
    saucy:['rich'],
  }
  for(const {label,count} of intel.flavorCounts){
    const key=label.toLowerCase(),acceptable=flavorAliases[key]??[key]
    if(acceptable.some(value=>scoring.flavors.includes(value)))score+=count
  }
  // Prefer explicit saved novelty. Legacy rows retain the prior conservative
  // name heuristic until they are enriched; unknown is not fabricated.
  const name = dish.name.toLowerCase()
  const bold = /truffle|uni|urchin|offal|foie|liver|marrow|tartare|crudo|ceviche|kimchi|miso|harissa|labneh|freekeh/
  const comfort = /pasta|bread|soup|potato|rice|risotto|pizza|cheese|butter/
  if(scoring.noveltyScore!==null){
    const alignment=1-Math.abs(intel.avgAdventurousness/100-scoring.noveltyScore)
    if(alignment>=.7)score+=1
  }else{
    if (intel.avgAdventurousness >= 60 && bold.test(name)) score += 1
    if (intel.avgAdventurousness < 40 && comfort.test(name)) score += 1
  }
  return score
}

// Higher = better match. 3 for stored slot match, 2 for tag-inferred slot
// match, 1 for name-keyword match, 0 otherwise. Used as tiebreaker inside a
// slot AND as the primary ranking for last-resort widening.
function slotAffinity(sig: Signature, slot: Slot): number {
  if (sig.slot === slot) return 3
  const inferred = inferSlot(sig.name, sig.tags)
  if (inferred === slot) return 2
  if (nameMatchesSlot(sig.name, slot)) return 1
  return 0
}

// Rule-based drafting can only offer chef-curated signatures as named dishes:
// it has no way to invent a coherent name for a raw pantry ingredient the way
// the AI path does (see the "never name a composed dish 'Chef's <ingredient>'"
// instruction in lib/menu-ai.ts's prompt). Presenting a raw pantry item as
// "Chef's Apricots" misrepresents an un-composed ingredient as a finished
// dish, so pantry items are not eligible candidates here — an honest empty
// slot is preferable to a fabricated name. Pantry-composed dishes still reach
// the menu, just only via the AI path, which supplies a real dish_name.
//
// This function guarantees NEVER returning `origin: 'empty'` while any
// signature exists outside the `exclude` set. Three tiers:
//   1. Stored/inferred slot match with zero preference exclusions
//   2. Stored/inferred slot match with fewest preference exclusions
//   3. Last-resort — any signature not in exclude, ranked by slot affinity
//      first (so a "sea" slot still gets fish-y signatures), then by fewest
//      exclusions. Marked with origin 'fallback' so the UI can flag it.
export function draftCourse(
  slot: Slot,
  intel: TableIntel,
  signatures: Signature[],
  pantry: PantryItem[],
  exclude?: Set<string>
): Course {
  const slotLabel = SLOT_LABELS[slot]

  const withSlots = withInferredSlots(signatures)
  const availableSigs = exclude ? withSlots.filter(s => !exclude.has(s.id)) : withSlots

  if (availableSigs.length === 0) {
    return { slot, slotLabel, dishName: '', origin: 'empty', sourceId: null, excludes: [] }
  }

  const toCandidate = (s: Signature): Candidate => {
    const exclusions = scoreDish(s, intel)
    return {
      sourceId: s.id,
      dishName: s.name,
      exclusions,
      allergyExcludes: countByKind(exclusions, 'allergy'),
      preferenceExcludes: countByKind(exclusions, 'preference'),
      tableFit: tableFitScore(s, intel),
      slotAffinity: slotAffinity(s, slot),
    }
  }

  const inSlot = availableSigs
    .filter(s => s.slot === slot)
    .map(toCandidate)

  const pickBestFromPool = (pool: Candidate[], origin: 'signature' | 'fallback'): Course => {
    pool.sort((a, b) => {
      // Allergies first (physical danger — even the substitute may share the
      // allergen), then table-fit (best match for the whole table's soft
      // preferences), then preferences (substitutes handle these cleanly),
      // then slot affinity, then alphabetical for stable output.
      if (a.allergyExcludes !== b.allergyExcludes) return a.allergyExcludes - b.allergyExcludes
      if (a.tableFit !== b.tableFit) return b.tableFit - a.tableFit
      if (a.preferenceExcludes !== b.preferenceExcludes) return a.preferenceExcludes - b.preferenceExcludes
      if (a.slotAffinity !== b.slotAffinity) return b.slotAffinity - a.slotAffinity
      return a.dishName.localeCompare(b.dishName)
    })
    const winner = pool[0]
    return {
      slot,
      slotLabel,
      dishName: winner.dishName,
      origin,
      sourceId: winner.sourceId,
      excludes: winner.exclusions,
    }
  }

  if (inSlot.length > 0) return pickBestFromPool(inSlot, 'signature')

  // Tier 3 — last-resort: no signature is slotted here (stored or inferred),
  // widen to every available signature ranked by slot affinity.
  const fallbackPool = availableSigs
    .map(toCandidate)
    .filter(c => c.slotAffinity > 0)

  // Sea and Land are category-strict: showing "Ratatouille" under "Main —
  // Sea" is worse than showing an empty slot the chef can fill themselves.
  // An honest empty is better than a misleading fill. Start/Green/Finish
  // stay permissive since "any veg" plausibly fits any of those.
  const finalPool = fallbackPool.length > 0
    ? fallbackPool
    : availableSigs.map(toCandidate)

  return pickBestFromPool(finalPool, 'fallback')
}

// For each guest excluded from the main course, find the best available
// substitute signature — a dish that doesn't exclude them (same reason). The
// pool is: signatures NOT already used by this menu OR the main dish itself,
// preferring same-slot > any-slot with matching slot affinity. Guests
// excluded for the same reason (e.g. three vegetarians) share one substitute.
//
// Note: an allergy exclusion (nuts, shellfish, etc.) is not a "the majority
// still eats the dish" case — the substitution shows up as an alt too, since
// nut-allergic Sam still needs something plated. Only the semantic label
// differs (in the UI, allergy gets red framing; preference gets amber).
export function assignSubstitutions(
  main: Course,
  intel: TableIntel,
  signatures: Signature[],
  usedInMenu: Set<string>,
  usedNames?: Set<string>,
): Substitution[] {
  if (main.excludes.length === 0) return []

  // Group excluded guests by their exclusion reason so we only pick one
  // substitute per shared constraint.
  const byReason = new Map<string, string[]>()
  for (const e of main.excludes) {
    const existing = byReason.get(e.reason) ?? []
    existing.push(e.guest)
    byReason.set(e.reason, existing)
  }

  const withSlots = withInferredSlots(signatures)
  const busyIds = new Set<string>(usedInMenu)
  if (main.sourceId) busyIds.add(main.sourceId)
  // Track used lowercased names too — a signature substitute could otherwise
  // duplicate the name of an AI-composed main from an earlier slot (which
  // has no sourceId to dedup against).
  const busyNames = new Set<string>(usedNames ?? [])
  if (main.dishName) busyNames.add(main.dishName.toLowerCase())

  const subs: Substitution[] = []
  const reasonGroups = Array.from(byReason.values())
  for (const guests of reasonGroups) {
    // A dish is a valid substitute for THIS group iff it does not exclude
    // any guest in the group. Pick the best one by slot affinity + fewest
    // total exclusions for the whole table (so we don't rescue one group at
    // the cost of many other guests).
    const pool = withSlots
      .filter(s => !busyIds.has(s.id) && !busyNames.has(s.name.toLowerCase()))
      .map(s => {
        const exclusions = scoreDish(s, intel)
        const excludesAnyOfGroup = exclusions.some(e => guests.includes(e.guest))
        return {
          sig: s,
          exclusions,
          excludesAnyOfGroup,
          affinity: slotAffinity(s, main.slot),
        }
      })
      .filter(x => !x.excludesAnyOfGroup)

    if (pool.length === 0) continue

    pool.sort((a, b) => {
      if (a.affinity !== b.affinity) return b.affinity - a.affinity
      if (a.exclusions.length !== b.exclusions.length) return a.exclusions.length - b.exclusions.length
      return a.sig.name.localeCompare(b.sig.name)
    })

    const winner = pool[0].sig
    busyIds.add(winner.id) // don't reuse the same substitute for two groups
    busyNames.add(winner.name.toLowerCase())
    subs.push({
      guests,
      dishName: winner.name,
      origin: 'signature',
      sourceId: winner.id,
    })
  }

  return subs
}

export function draftMenu(
  intel: TableIntel,
  signatures: Signature[],
  pantry: PantryItem[]
): Course[] {
  // Slots are drafted in order, excluding dishes already used by earlier
  // slots in this same menu — otherwise ties (e.g. no pantry item matching a
  // slot's keywords) resolve identically per slot and the same dish gets
  // picked for multiple courses. Track both ids AND lowercased names so
  // substitutes can't collide with an earlier composed main whose sourceId
  // is null.
  const used = new Set<string>()
  const usedNames = new Set<string>()
  const withSlots = withInferredSlots(signatures)
  return SLOTS.map(slot => {
    const course = draftCourse(slot, intel, withSlots, pantry, used)
    if (course.sourceId) used.add(course.sourceId)
    if (course.dishName) usedNames.add(course.dishName.toLowerCase())
    const substitutions = assignSubstitutions(course, intel, withSlots, used, usedNames)
    for (const s of substitutions) {
      if (s.sourceId) used.add(s.sourceId)
      if (s.dishName) usedNames.add(s.dishName.toLowerCase())
    }
    return substitutions.length > 0 ? { ...course, substitutions } : course
  })
}

export type PersistedCourseLike = {
  slot: string
  dish_name: string
  dish_origin: string | null
  source: string | null
  // For pantry-composed dishes, the pantry item ids the AI used to compose
  // the dish. Enables `deriveCourse` to re-score composed dishes on page
  // reload — without this the row's `source` is null and excludes come back
  // empty (silent 9/9). Optional for backward compatibility with rows
  // written before the schema gained `component_ids`.
  component_ids?: string[] | null
  scoring_metadata?: {
    proteinBase?: string[]
    flavors?: string[]
    textures?: string[]
    techniques?: string[]
    temperature?: string[]
    richness?: string[]
    dietary?: string[]
    allergens?: string[]
    noveltyScore?: number | null
    substantial?: boolean
    missingIngredients?: { name: string; importance: string }[]
  } | null
}

// Turns a persisted menu_courses row into a displayable Course, re-checking
// its source against the live signatures/pantry lists. A course only counts
// as "source deleted" when it was actually linked to a catalog entry (source
// is set) that entry is now gone — a null source (e.g. an AI-composed dish
// not tied to one specific pantry item) is not a deletion and must keep its
// dish_name.
//
// The `usedInMenu` / `usedNames` params are how `deriveMenu` (below) threads
// cross-course dedup state through per-course substitute selection. Callers
// deriving a single course in isolation can omit them and get the same
// behavior as before.
export function deriveCourse(
  persisted: PersistedCourseLike,
  signatures: Signature[],
  pantry: PantryItem[],
  intel: TableIntel,
  usedInMenu?: Set<string>,
  usedNames?: Set<string>,
): Course {
  const slot = normalizeSlot(persisted.slot)
  const slotLabel = SLOT_LABELS[slot]

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

  // 'fallback' persists as 'signature' since the DB check constraint predates
  // this variant. It's a display-only distinction re-derived here when the
  // stored source can't cover the slot in a preferred tier — but for now,
  // treat any signature/fallback origin as looking up in signatures.
  const isSignatureLike =
    persisted.dish_origin === 'signature' || persisted.dish_origin === 'fallback'

  let excludes: Exclusion[] = []
  let sourceDeleted = false
  let componentIds: string[] | undefined

  if (isSignatureLike) {
    const sig = signatures.find(s => s.id === persisted.source)
    if (!sig && persisted.source) sourceDeleted = true
    else if (sig) excludes = scoreDish(sig, intel)
  } else if (persisted.dish_origin === 'pantry-composed') {
    // Prefer component_ids (composed from N pantry items) — that's the
    // source of truth for exclusion computation. Fall back to legacy single
    // `source` for older rows written before component_ids existed.
    const compIds = persisted.component_ids ?? null
    if (compIds && compIds.length > 0) {
      const resolved: PantryItem[] = []
      const missing: string[] = []
      for (const id of compIds) {
        const item = pantry.find(p => p.id === id)
        if (item) resolved.push(item)
        else missing.push(id)
      }
      if (missing.length > 0 && resolved.length === 0) sourceDeleted = true
      else {
        componentIds = compIds
        excludes = scoreComposedDish(resolved, intel, persisted.scoring_metadata)
      }
    } else if (persisted.source) {
      const item = pantry.find(p => p.id === persisted.source)
      if (!item) sourceDeleted = true
      else excludes = scoreDish(item, intel)
    }
    // else: pre-migration row with source=null and no component_ids — leave
    // excludes empty (matches prior behavior for backward compat).
  }

  const course: Course = {
    slot,
    slotLabel,
    dishName: sourceDeleted ? 'Source deleted with swap or lock' : persisted.dish_name,
    origin: sourceDeleted ? 'empty' : ((persisted.dish_origin as CourseOrigin) ?? 'empty'),
    sourceId: persisted.source,
    excludes,
    ...(componentIds ? { componentIds } : {}),
  }

  if (course.origin === 'empty' || excludes.length === 0) return course

  const substitutions = assignSubstitutions(
    course,
    intel,
    signatures,
    usedInMenu ?? new Set(course.sourceId ? [course.sourceId] : []),
    usedNames,
  )
  return substitutions.length > 0 ? { ...course, substitutions } : course
}

// Cross-course dedup wrapper around deriveCourse. Threads a shared
// used-ids + used-names set through each course's substitute selection so a
// signature that's already the main for slot A can't be handed back as a
// substitute for slot B. Also excludes substitute names from being reused.
// Call this once per menu render instead of `.map(deriveCourse)`.
export function deriveMenu(
  persisted: PersistedCourseLike[],
  signatures: Signature[],
  pantry: PantryItem[],
  intel: TableIntel,
): Course[] {
  const usedIds = new Set<string>()
  const usedNames = new Set<string>()
  return persisted.map(p => {
    const course = deriveCourse(p, signatures, pantry, intel, usedIds, usedNames)
    if (course.sourceId) usedIds.add(course.sourceId)
    if (course.dishName) usedNames.add(course.dishName.toLowerCase())
    for (const s of course.substitutions ?? []) {
      if (s.sourceId) usedIds.add(s.sourceId)
      if (s.dishName) usedNames.add(s.dishName.toLowerCase())
    }
    return course
  })
}

// Pantry items don't have a stored slot — infer strength via declared tags
// (seafood/meat/veg/vegan/dessert/side/starter) first, then fall back to the
// slot's name-keyword list. Rough by design: this is a ranking heuristic for
// prompt trimming, not a placement decision.
function pantrySlotAffinity(item: PantryItem, slot: Slot): number {
  const tagset = new Set(item.tags.map(t => t.toLowerCase()))
  if (slot === 'main' && (tagset.has('seafood') || tagset.has('meat') || tagset.has('main'))) return 3
  if (slot === 'side' && (tagset.has('side') || tagset.has('veg') || tagset.has('vegan') || tagset.has('vegetarian'))) return 2
  if (slot === 'dessert' && tagset.has('dessert')) return 3
  if (slot === 'starter' && tagset.has('starter')) return 2
  if (nameMatchesSlot(item.name, slot)) return 1
  return 0
}

// Top-K pantry items per slot, unioned into one deduped list. Same intent as
// shortlistSignaturesForAI: a large weekly pantry inflates the AI prompt
// without helping the model — a composed dish only uses 3-6 components, so
// the shortlist just has to include enough strong per-slot anchors (fish for
// sea, meat for land, etc.) plus accents that ranked well by name-keyword or
// alphabetical fallback. Items with affinity=0 for every slot (e.g. Miso
// paste, plain oils) can still make the list if there's room within perSlot
// via the alphabetical tail. `perSlot` defaults to 5 — smaller than the
// signature default (3) because pantry items compose in groups, so the AI
// needs a slightly larger palette per slot.
export function shortlistPantryForAI(
  pantry: PantryItem[],
  intel: TableIntel,
  perSlot: number = 5,
): PantryItem[] {
  const seen = new Set<string>()
  const out: PantryItem[] = []
  for (const slot of SLOTS) {
    const scored = pantry.map(p => {
      const exclusions = scoreDish(p, intel)
      return {
        item: p,
        allergies: exclusions.filter(e => e.kind === 'allergy').length,
        affinity: pantrySlotAffinity(p, slot),
        fit: tableFitScore(p, intel),
      }
    })
    scored.sort((a, b) => {
      if (a.allergies !== b.allergies) return a.allergies - b.allergies
      if (a.affinity !== b.affinity) return b.affinity - a.affinity
      if (a.fit !== b.fit) return b.fit - a.fit
      return a.item.name.localeCompare(b.item.name)
    })
    for (const s of scored.slice(0, perSlot)) {
      if (seen.has(s.item.id)) continue
      seen.add(s.item.id)
      out.push(s.item)
    }
  }
  return out
}

// Top-K signatures per slot, unioned across all 5 slots into one deduped list.
// Used to trim the AI prompt: sending the entire signature catalog on a large
// chef inflates prompt size (and Gemini latency) without changing outcomes,
// since the model only picks 5 dishes anyway. The rank within each slot uses
// the same deterministic scoring the rule-based path uses (fewest allergies,
// then slot affinity, then tableFit, then alphabetical) so the shortlist is
// exactly the pool the fallback would draw from — the AI can only pick worse
// candidates by ignoring the shortlist, not better ones it would have found
// in the full catalog. `perSlot` defaults to 3; higher gives the AI more room
// to be creative, lower trims the prompt more aggressively.
export function shortlistSignaturesForAI(
  signatures: Signature[],
  intel: TableIntel,
  perSlot: number = 3,
): Signature[] {
  const withSlots = withInferredSlots(signatures)
  const seen = new Set<string>()
  const out: Signature[] = []
  for (const slot of SLOTS) {
    const scored = withSlots.map(s => {
      const exclusions = scoreDish(s, intel)
      return {
        sig: s,
        allergies: exclusions.filter(e => e.kind === 'allergy').length,
        affinity: slotAffinity(s, slot),
        fit: tableFitScore(s, intel),
      }
    })
    scored.sort((a, b) => {
      if (a.allergies !== b.allergies) return a.allergies - b.allergies
      if (a.affinity !== b.affinity) return b.affinity - a.affinity
      if (a.fit !== b.fit) return b.fit - a.fit
      return a.sig.name.localeCompare(b.sig.name)
    })
    for (const item of scored.slice(0, perSlot)) {
      if (seen.has(item.sig.id)) continue
      seen.add(item.sig.id)
      out.push(item.sig)
    }
  }
  return out
}

// AI-assisted menu generation lives in `./menu-ai` (server-only) so this file
// stays safe to import from client components.
