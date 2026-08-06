import 'server-only'
import type { TableIntel } from './intel'
import { formatProteinPreferenceLabel } from './protein-preferences'
import {
  SLOTS,
  SLOT_LABELS,
  assignSubstitutions,
  draftCourse,
  draftMenu,
  nameMatchesSlot,
  scoreDish,
  scoreComposedDish,
  shortlistPantryForAI,
  shortlistSignaturesForAI,
  type Course,
  type PantryItem,
  type Signature,
  type Slot,
} from './menu'
import { callGeminiJson } from './gemini'

export type AIGenerationResult = {
  courses: Course[]
  aiFailed: boolean
  fallbackReason?: string
}

// The AI is only trusted to (a) name a dish, (b) tell us where it comes from
// (a signature id OR a set of pantry ids). Safety is derived from the
// referenced pantry/signature entries, not from any AI self-declaration.
type AIProposedCourse = {
  slot: Slot
  dish_name: string
  dish_origin: 'signature' | 'pantry-composed'
  signature_id?: string | null
  pantry_ids?: string[]
  reasoning?: string
}

type AIProposedMenu = {
  courses: AIProposedCourse[]
}

export function buildAIPrompt(
  intel: TableIntel,
  signatures: Signature[],
  pantry: PantryItem[]
): string {
  // Send only the top-K signatures + pantry items per slot rather than the
  // full catalog. On a large chef, the raw lists dominate prompt size and
  // correlate with Gemini timeouts; the shortlists are exactly the pools the
  // rule-based fallback would draw from, so we don't lose viable picks — see
  // shortlistSignaturesForAI / shortlistPantryForAI in ./menu.
  const shortSignatures = shortlistSignaturesForAI(signatures, intel, 3)
  const shortPantry = shortlistPantryForAI(pantry, intel, 5)

  const sigLines = shortSignatures.length
    ? shortSignatures.map(s => {
        const slot = s.slot ?? 'any'
        const tags = s.tags.length ? s.tags.join(', ') : 'none'
        const allergens = s.contains_allergens.length ? s.contains_allergens.join(', ') : 'none'
        return `- id=${s.id} | "${s.name}" | slot=${slot} | tags=[${tags}] | contains_allergens=[${allergens}]`
      }).join('\n')
    : '(none)'

  const pantryLines = shortPantry.length
    ? shortPantry.map(p => {
        const tags = p.tags.length ? p.tags.join(', ') : 'none'
        const allergens = p.contains_allergens.length ? p.contains_allergens.join(', ') : 'none'
        return `- id=${p.id} | "${p.name}" | tags=[${tags}] | contains_allergens=[${allergens}]`
      }).join('\n')
    : '(none)'

  // Split the hard limits so the AI understands: allergies (nuts, shellfish,
  // dairy, eggs, gluten, soy) are true physical-danger blocks — never
  // propose a dish containing them for the affected guest. Diet + taste
  // preferences (Vegetarian, Vegan, Pork, Mushrooms, etc.) are handled
  // downstream by per-guest substitutes — the AI should still pick a proper
  // Sea/Land dish for the table even if some vegetarians can't eat it, and
  // the system will plate them an alternate.
  const allergyLines = intel.hardLimits.filter(h => h.type === 'allergy').length
    ? intel.hardLimits
        .filter(h => h.type === 'allergy')
        .map(h => `- "${h.label}" affects: ${h.guests.join(', ')}`)
        .join('\n')
    : '(none)'

  const preferenceLines = intel.hardLimits.filter(h => h.type === 'diet').length
    ? intel.hardLimits
        .filter(h => h.type === 'diet')
        .map(h => `- "${h.label}" affects: ${h.guests.join(', ')}`)
        .join('\n')
    : '(none)'

  const dietMix = intel.dietMix.length
    ? intel.dietMix.map(d => `${d.label}=${d.count}`).join(', ')
    : 'none'

  const proteinAnchors = intel.proteinCounts.length
    ? intel.proteinCounts.map(d => `${formatProteinPreferenceLabel(d.label)}=${d.count}`).join(', ')
    : 'none'

  const flavorPrefs = intel.flavorCounts.length
    ? intel.flavorCounts.map(d => `${d.label}=${d.count}`).join(', ')
    : 'none'

  return `Compose a 5-course tasting menu. Slots, in order:
  start (To Start), sea (Main — Sea), land (Main — Land), green (Main — Green), finish (To Finish)

SIGNATURE DISHES (chef's picks, pre-filtered to strong slot matches — reuse where they fit):
${sigLines}

PANTRY (raw ingredients, pre-filtered to strong slot-anchor candidates + accents
— use to compose a NEW dish only if no signature above fits the slot; invent
evocative dish names, never "Chef's <ingredient>"):
${pantryLines}

GUEST INTEL:
- ${intel.guestCount} guest${intel.guestCount === 1 ? '' : 's'}
- Diet mix (soft): ${dietMix}
- Tonight's protein/base picks: ${proteinAnchors}
- Flavor preference split: ${flavorPrefs}
- Adventurousness: ${intel.avgAdventurousness}/100 (${intel.adventurousnessLabel})
- Brief: ${intel.brief}

ALLERGIES — hard block. Never propose a dish containing these for the affected
guest. Downstream verifies each course against the pantry's declared allergens
(chef's data is the source of truth, not your description) and rejects violations.
${allergyLines}

PREFERENCES — the system handles these with side-plated substitutes. Pick the
right dish for the WHOLE table regardless. Do NOT swap Sea to veg pasta or Land
to veg curry to appease vegetarians. Composed Sea MUST include a seafood
pantry item; composed Land MUST include a meat/poultry pantry item — otherwise
the course is rejected.
${preferenceLines}

Return ONE dish per slot. Fields per course:
- slot: "start"|"sea"|"land"|"green"|"finish"
- dish_name: plated name (exact signature name if reusing)
- dish_origin: "signature" | "pantry-composed"
- signature_id: id from the signature list (only when dish_origin="signature"; must match exactly)
- pantry_ids: array of ids from the pantry list (only when dish_origin="pantry-composed"; list
  EVERY component; invented or missing ids get the course rejected)
- reasoning: one short sentence (~140 chars) on why this fits.

Do NOT return self-declared safety fields (no contains_allergens, violates_diets, tags).

Return ONLY this JSON, no prose:
{
  "courses": [
    { "slot": "start", "dish_name": "...", "dish_origin": "...",
      "signature_id": "..."|null, "pantry_ids": [...]|null, "reasoning": "..." },
    ... (5 entries, in the order start, sea, land, green, finish)
  ]
}`
}

function isAIProposedMenu(x: unknown): x is AIProposedMenu {
  if (!x || typeof x !== 'object') return false
  const obj = x as { courses?: unknown }
  if (!Array.isArray(obj.courses)) return false
  return obj.courses.every(c => {
    if (!c || typeof c !== 'object') return false
    const cc = c as Record<string, unknown>
    return typeof cc.slot === 'string'
      && typeof cc.dish_name === 'string'
      && (cc.dish_origin === 'signature' || cc.dish_origin === 'pantry-composed')
  })
}

type VerifiedCourse =
  | { unverifiable: false; course: Course }
  | { unverifiable: true; reason: string }

// Turns an AI proposal into a Course by resolving its declared source
// (signature_id OR pantry_ids) against the real catalog and computing
// exclusions from that. If the source doesn't resolve — signature_id missing
// from signatures, or any pantry_id missing from pantry — the proposal is
// unverifiable and gets rejected the same way an unsafe dish would.
function verifyAndScore(
  proposed: AIProposedCourse,
  signatures: Signature[],
  pantry: PantryItem[],
  intel: TableIntel
): VerifiedCourse {
  if (proposed.dish_origin === 'signature') {
    const sig = proposed.signature_id
      ? signatures.find(s => s.id === proposed.signature_id)
      : undefined
    if (!sig) {
      return {
        unverifiable: true,
        reason: `signature_id "${proposed.signature_id ?? '<missing>'}" not in catalog`,
      }
    }
    return {
      unverifiable: false,
      course: {
        slot: proposed.slot,
        slotLabel: SLOT_LABELS[proposed.slot],
        dishName: proposed.dish_name,
        origin: 'signature',
        sourceId: sig.id,
        excludes: scoreDish(sig, intel),
        reasoning: proposed.reasoning,
      },
    }
  }

  // pantry-composed
  const ids = proposed.pantry_ids ?? []
  if (ids.length === 0) {
    return { unverifiable: true, reason: 'composed dish with no pantry_ids' }
  }
  const resolved: PantryItem[] = []
  const missing: string[] = []
  for (const id of ids) {
    const item = pantry.find(p => p.id === id)
    if (item) resolved.push(item)
    else missing.push(id)
  }
  if (missing.length > 0) {
    return {
      unverifiable: true,
      reason: `pantry_ids not in catalog: ${missing.join(', ')}`,
    }
  }

  // Sea/Land are category-strict slots: a "Main — Sea" composed only of
  // Miso Paste + Orzo + Bell Peppers is misleading even if it verifies safe.
  // Require at least one component whose tag ('seafood' / 'meat') or name
  // matches the slot's keywords. If nothing plausible, reject as
  // unverifiable so the caller either falls back to a rule-based pick or
  // leaves the slot honestly empty.
  if (proposed.slot === 'sea' || proposed.slot === 'land') {
    const needTag = proposed.slot === 'sea' ? 'seafood' : 'meat'
    const slotOk = resolved.some(item => {
      const hasTag = item.tags.some(t => t.toLowerCase() === needTag)
      return hasTag || nameMatchesSlot(item.name, proposed.slot)
    })
    if (!slotOk) {
      return {
        unverifiable: true,
        reason:
          `composed dish for slot "${proposed.slot}" has no ` +
          `${proposed.slot === 'sea' ? 'seafood/fish' : 'meat/poultry'} component ` +
          `(components: ${resolved.map(r => r.name).join(', ')})`,
      }
    }
  }

  return {
    unverifiable: false,
    course: {
      slot: proposed.slot,
      slotLabel: SLOT_LABELS[proposed.slot],
      dishName: proposed.dish_name,
      origin: 'pantry-composed',
      // Composed dishes intentionally have no single canonical source; the
      // menu-page display + deriveCourse both accept null source for
      // pantry-composed origin and use componentIds for exclusion scoring.
      sourceId: null,
      excludes: scoreComposedDish(resolved, intel),
      componentIds: resolved.map(r => r.id),
      reasoning: proposed.reasoning,
    },
  }
}

export async function generateMenuWithAI(
  intel: TableIntel,
  signatures: Signature[],
  pantry: PantryItem[]
): Promise<AIGenerationResult> {
  let raw: unknown
  try {
    raw = await callGeminiJson(buildAIPrompt(intel, signatures, pantry))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      courses: draftMenu(intel, signatures, pantry),
      aiFailed: true,
      fallbackReason: msg,
    }
  }

  if (!isAIProposedMenu(raw)) {
    console.error('[menu-ai] AI response did not match expected shape, raw response:', JSON.stringify(raw))
    return {
      courses: draftMenu(intel, signatures, pantry),
      aiFailed: true,
      fallbackReason: 'AI response did not match expected shape',
    }
  }

  const bySlot = new Map<Slot, AIProposedCourse>()
  for (const c of raw.courses) {
    if (!SLOTS.includes(c.slot)) continue
    if (!c.dish_name || !c.dish_name.trim()) {
      console.error(
        `[menu-ai] AI proposed course for slot "${c.slot}" with an empty dish_name, ` +
        'falling back to rule-based draft for this slot. Raw course:',
        JSON.stringify(c)
      )
      continue
    }
    bySlot.set(c.slot, c)
  }

  // Track dish names used across earlier slots so we can dedup across the
  // whole 5-course menu — signature ids OR composed dish names — regardless
  // of which path produced them. The rule-based fallback also honors this
  // via its own `used` set below.
  const usedNames = new Set<string>()
  const usedSourceIds = new Set<string>()

  // Attach per-guest substitutions and update the used-id + used-name sets
  // to include substitute dishes (so later slots don't reuse a signature
  // already plated as an alt on an earlier course, and later composed dishes
  // can't accidentally reuse a substitute name).
  const attachSubs = (course: Course): Course => {
    if (course.origin === 'empty' || course.excludes.length === 0) return course
    const subs = assignSubstitutions(course, intel, signatures, usedSourceIds, usedNames)
    for (const s of subs) {
      if (s.sourceId) usedSourceIds.add(s.sourceId)
      if (s.dishName) usedNames.add(s.dishName.toLowerCase())
    }
    return subs.length > 0 ? { ...course, substitutions: subs } : course
  }

  const courses: Course[] = SLOTS.map(slot => {
    const proposed = bySlot.get(slot)

    // Helper: fall back to rule-based, avoiding any dish already used in
    // this menu. Returns the final Course (possibly `empty`).
    const fallback = (reasonSuffix: string): Course => {
      const safe = draftCourse(slot, intel, signatures, pantry, usedSourceIds)
      const reasoning = proposed
        ? `AI pick "${proposed.dish_name}" rejected: ${reasonSuffix}. Replaced with rule-based pick.`
        : undefined
      return reasoning ? { ...safe, reasoning } : safe
    }

    if (!proposed) {
      const safe = draftCourse(slot, intel, signatures, pantry, usedSourceIds)
      if (safe.sourceId) usedSourceIds.add(safe.sourceId)
      if (safe.dishName) usedNames.add(safe.dishName.toLowerCase())
      return attachSubs(safe)
    }

    const verified = verifyAndScore(proposed, signatures, pantry, intel)
    if (verified.unverifiable) {
      const course = fallback(`unverifiable (${verified.reason})`)
      if (course.sourceId) usedSourceIds.add(course.sourceId)
      if (course.dishName) usedNames.add(course.dishName.toLowerCase())
      return attachSubs(course)
    }

    const candidate = verified.course
    // Only true allergies (kind='allergy' — nuts, shellfish, dairy, eggs,
    // gluten, soy — physical-danger stakes) hard-block the AI's proposal.
    // Preferences (strict diets, taste-based avoids like Pork/Cilantro/
    // Mushrooms) are handled downstream by per-guest substitutions, so they
    // are not a rejection reason — the dish still gets picked for the table.
    const allergyExcludes = candidate.excludes.filter(e => e.kind === 'allergy')

    if (allergyExcludes.length > 0) {
      const course = fallback(
        `unsafe (allergy) for ${allergyExcludes.map(e => `${e.guest} (${e.reason})`).join(', ')}`
      )
      if (course.sourceId) usedSourceIds.add(course.sourceId)
      if (course.dishName) usedNames.add(course.dishName.toLowerCase())
      return attachSubs(course)
    }

    // Dedup across the whole menu, regardless of source path (AI or rule).
    // AI can repeat a signature id across slots OR reuse the same composed
    // dish name; both collapse to "already used" and get replaced.
    const nameKey = candidate.dishName.toLowerCase()
    const alreadyUsed =
      (candidate.sourceId && usedSourceIds.has(candidate.sourceId)) ||
      usedNames.has(nameKey)

    if (alreadyUsed) {
      const course = fallback(`duplicate of an earlier slot ("${candidate.dishName}")`)
      if (course.sourceId) usedSourceIds.add(course.sourceId)
      if (course.dishName) usedNames.add(course.dishName.toLowerCase())
      return attachSubs(course)
    }

    if (candidate.sourceId) usedSourceIds.add(candidate.sourceId)
    usedNames.add(nameKey)
    return attachSubs(candidate)
  })

  return { courses, aiFailed: false }
}
