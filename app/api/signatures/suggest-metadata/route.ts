import { NextResponse } from 'next/server'
import { callGeminiJson } from '@/lib/gemini'
import { DISH_ROLES, isDishRole, withDishRole, withoutDishRoles } from '@/lib/dish-presets'
import { inferIngredientAllergens } from '@/lib/ingredient-safety'
import { KITCHEN_ALLERGENS, pantryTagsForPersistence, tagsForKitchenKind } from '@/lib/kitchen-tags'

type SuggestedMetadata = { tags?: unknown; allergens?: unknown }

export async function POST(request: Request) {
  let body: { name?: unknown; kind?: unknown }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const kind = body.kind === 'signature' || body.kind === 'pantry' ? body.kind : null
  if (!name || name.length > 160 || !kind) {
    return NextResponse.json({ error: 'Provide a valid item name and metadata type.' }, { status: 400 })
  }

  const allowedTags = tagsForKitchenKind(kind)
  const schema = {
    type: 'object',
    properties: {
      tags: { type: 'array', items: { type: 'string', enum: allowedTags }, minItems: kind === 'signature' ? 2 : 1, maxItems: 8 },
      allergens: { type: 'array', items: { type: 'string', enum: [...KITCHEN_ALLERGENS] }, maxItems: 6 },
    },
    required: ['tags', 'allergens'],
    additionalProperties: false,
  }
  const roleInstruction = kind === 'signature'
    ? `Choose exactly one role from: ${DISH_ROLES.join(', ')}. Also choose at least one descriptive label.`
    : 'This is a raw pantry ingredient. Never assign a dish role.'
  const prompt = `Classify the kitchen item named "${name}" for a cooking and menu-planning application.
${roleInstruction}
Always commit to your single best reasonable guess for every relevant label, even if the name is unfamiliar, vague, or ambiguous -- a human reviews every suggestion afterward and can correct it, so an imperfect guess is far more useful than no guess at all. Only choose from the exact provided label lists. Do not invent ingredients, preparation methods, or claims the name doesn't support, but never simply omit a label out of caution. Allergens are cautious suggestions for the user to review, not a safety guarantee. Return only the requested structured JSON.`

  try {
    const result = await callGeminiJson<SuggestedMetadata>(prompt, schema)
    const tagSet = new Set(allowedTags)
    let tags = Array.isArray(result.tags)
      ? Array.from(new Set(result.tags.filter((tag): tag is string => typeof tag === 'string' && tagSet.has(tag))))
      : []
    if (kind === 'signature') {
      const role = tags.find(isDishRole) ?? 'flex'
      const descriptive = withoutDishRoles(tags)
      // The prompt asks the model to always commit to a guess, but this never trusts that blindly -- if it
      // still returns nothing usable, fall back to one safe, neutral descriptive tag so the response is
      // never empty (submitKitchen's own validation already requires at least one descriptive tag).
      tags = withDishRole(descriptive.length > 0 ? descriptive : ['savory'], role)
    } else {
      const pantryTags = pantryTagsForPersistence(tags)
      tags = pantryTags.length > 0 ? pantryTags : ['savory']
    }
    const allergenSet = new Set<string>(KITCHEN_ALLERGENS)
    const modelAllergens = Array.isArray(result.allergens)
      ? result.allergens.filter((allergen): allergen is string => typeof allergen === 'string' && allergenSet.has(allergen))
      : []
    const allergens = Array.from(new Set([...modelAllergens, ...inferIngredientAllergens(name)]))
      .filter(allergen => allergenSet.has(allergen))
    return NextResponse.json({ tags, allergens })
  } catch (error) {
    console.error('[kitchen-metadata] suggestion failed', error)
    return NextResponse.json({ error: 'Suggestions are temporarily unavailable. Choose tags manually or try again.' }, { status: 503 })
  }
}
