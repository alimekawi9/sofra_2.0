import 'server-only'
import type { TableIntel } from './intel'
import {
  SLOTS,
  SLOT_LABELS,
  draftCourse,
  draftMenu,
  scoreDish,
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

type AIProposedCourse = {
  slot: Slot
  dish_name: string
  dish_origin: 'signature' | 'pantry-composed'
  signature_id?: string | null
  pantry_id?: string | null
  contains_allergens?: string[]
  tags?: string[]
  reasoning?: string
}

type AIProposedMenu = {
  courses: AIProposedCourse[]
}

function buildAIPrompt(
  intel: TableIntel,
  signatures: Signature[],
  pantry: PantryItem[]
): string {
  const sigLines = signatures.length
    ? signatures.map(s => {
        const slot = s.slot ?? 'any'
        const tags = s.tags.length ? s.tags.join(', ') : 'none'
        const allergens = s.contains_allergens.length ? s.contains_allergens.join(', ') : 'none'
        return `- id=${s.id} | "${s.name}" | slot=${slot} | tags=[${tags}] | contains_allergens=[${allergens}]`
      }).join('\n')
    : '(none)'

  const pantryLines = pantry.length
    ? pantry.map(p => `- id=${p.id} | ${p.name}`).join('\n')
    : '(none)'

  const hardLimitLines = intel.hardLimits.length
    ? intel.hardLimits.map(h =>
        `- ${h.type.toUpperCase()} "${h.label}" affects: ${h.guests.join(', ')}`
      ).join('\n')
    : '(none)'

  const dietMix = intel.dietMix.length
    ? intel.dietMix.map(d => `${d.label}=${d.count}`).join(', ')
    : 'none'

  const drinks = intel.drinksCounts.length
    ? intel.drinksCounts.map(d => `${d.label}=${d.count}`).join(', ')
    : 'none'

  return `You are helping a chef compose a 5-course tasting menu for a private dinner.

Fill exactly these slots, in this order:
  1. start   — "To Start"
  2. sea     — "Main — Sea"
  3. land    — "Main — Land"
  4. green   — "Main — Green"
  5. finish  — "To Finish"

CHEF'S SIGNATURE DISHES (reuse where they fit; each has a preferred slot):
${sigLines}

THIS WEEK'S PANTRY (raw ingredients — use these to compose NEW dishes that feel
like the chef's own style, not generic placeholders. Never name a composed dish
"Chef's <ingredient>" — invent a real, evocative dish name):
${pantryLines}

GUEST INTEL:
- ${intel.guestCount} guest${intel.guestCount === 1 ? '' : 's'}
- Diet mix (soft, informational): ${dietMix}
- Drinks split: ${drinks}
- Table adventurousness: ${intel.avgAdventurousness}/100 (${intel.adventurousnessLabel})
- Brief: ${intel.brief}

HARD LIMITS — NON-NEGOTIABLE. Any course that would harm a guest is rejected
downstream and replaced. Do not propose a course that contains a listed allergen
or violates a strict diet (Vegetarian / Vegan / Halal / Kosher) for the affected
guests. Hard limits:
${hardLimitLines}

TASK:
Propose one dish per slot. Decide for yourself how many slots reuse a signature
vs. compose something new from the pantry; aim for a menu that feels cohesive
with the chef's signature style.

For each course you MUST return:
- slot: one of "start" | "sea" | "land" | "green" | "finish"
- dish_name: the plated name (for signatures, use the exact signature name)
- dish_origin: "signature" if reusing a signature, "pantry-composed" if new
- signature_id: the id from the list above (only when dish_origin is "signature")
- pantry_id: the id of the main pantry item used (only when dish_origin is "pantry-composed")
- contains_allergens: array of allergens this dish contains (use these exact
  labels if applicable: ${['Nuts','Shellfish','Pork','Eggs','Cilantro','Mushrooms','Dairy','Gluten'].join(', ')}).
  For a signature dish, echo its declared allergens. Be thorough — this list
  drives the safety check.
- tags: array of dietary tags this dish satisfies (e.g. "Vegetarian", "Vegan",
  "Halal", "Kosher", "Gluten-free"). For a signature dish, echo its tags.
- reasoning: one short sentence (max ~140 chars) on why this dish fits this
  table (guest preferences, diet mix, adventurousness).

Return ONLY a JSON object of this exact shape, no prose:
{
  "courses": [
    { "slot": "start", "dish_name": "...", "dish_origin": "signature" | "pantry-composed",
      "signature_id": "..." | null, "pantry_id": "..." | null,
      "contains_allergens": ["..."], "tags": ["..."], "reasoning": "..." },
    ... (5 entries, one per slot, in the order start, sea, land, green, finish)
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

function toCheckableDish(
  proposed: AIProposedCourse,
  signatures: Signature[]
): Signature {
  if (proposed.dish_origin === 'signature' && proposed.signature_id) {
    const found = signatures.find(s => s.id === proposed.signature_id)
    if (found) return found
  }
  return {
    id: proposed.pantry_id ?? proposed.signature_id ?? `ai-${proposed.slot}`,
    name: proposed.dish_name,
    tags: Array.isArray(proposed.tags) ? proposed.tags : [],
    contains_allergens: Array.isArray(proposed.contains_allergens) ? proposed.contains_allergens : [],
    slot: proposed.slot,
  }
}

function aiCourseToCourse(
  proposed: AIProposedCourse,
  signatures: Signature[],
  intel: TableIntel
): Course {
  const checkable = toCheckableDish(proposed, signatures)
  const excludes = scoreDish(checkable, intel)
  const sourceId =
    proposed.dish_origin === 'signature'
      ? proposed.signature_id ?? null
      : proposed.pantry_id ?? null
  return {
    slot: proposed.slot,
    slotLabel: SLOT_LABELS[proposed.slot],
    dishName: proposed.dish_name,
    origin: proposed.dish_origin,
    sourceId,
    excludes,
    reasoning: proposed.reasoning,
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
    return {
      courses: draftMenu(intel, signatures, pantry),
      aiFailed: true,
      fallbackReason: 'AI response did not match expected shape',
    }
  }

  const bySlot = new Map<Slot, AIProposedCourse>()
  for (const c of raw.courses) {
    if (SLOTS.includes(c.slot)) bySlot.set(c.slot, c)
  }

  const courses: Course[] = SLOTS.map(slot => {
    const proposed = bySlot.get(slot)
    if (!proposed) {
      return draftCourse(slot, intel, signatures, pantry)
    }

    const candidate = aiCourseToCourse(proposed, signatures, intel)

    const hardLimitGuests = new Set(intel.hardLimits.flatMap(h => h.guests))
    const violatesHardLimit = candidate.excludes.some(e => hardLimitGuests.has(e.guest))

    if (violatesHardLimit) {
      const exclude = candidate.sourceId ? new Set([candidate.sourceId]) : undefined
      const safe = draftCourse(slot, intel, signatures, pantry, exclude)
      return {
        ...safe,
        reasoning: `AI pick "${candidate.dishName}" rejected: unsafe for ${
          candidate.excludes.map(e => `${e.guest} (${e.reason})`).join(', ')
        }. Replaced with rule-based pick.`,
      }
    }

    return candidate
  })

  return { courses, aiFailed: false }
}
