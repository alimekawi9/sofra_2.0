type DishIdentityInput = {
  name: string
  usedAvailableIngredients: string[]
  missingIngredients: { name: string; importance: 'core' | 'supporting' | 'optional' }[]
}

export type DishSimilarity = { duplicate: boolean; reason?: string }

const MODIFIERS = new Set([
  'and', 'with', 'of', 'the', 'a', 'an', 'style', 'inspired',
  'smoky', 'smoked', 'marinated', 'roasted', 'grilled', 'braised', 'baked',
  'fried', 'seared', 'steamed', 'boiled', 'stewed', 'pickled', 'charred',
  'crispy', 'creamy', 'silky', 'tender', 'fresh', 'rich', 'spicy', 'sweet',
  'bright', 'earthy', 'savory', 'herbal', 'warm', 'chilled', 'hot', 'cold',
])

// These identify a dish's substantive starch/form rather than a broad protein
// category. Repeating one normally reads as the same dish even when the LLM
// changes its seasoning adjectives (for example, two kinds of polenta).
const DISTINCTIVE_BASES = new Set([
  'polenta', 'risotto', 'couscous', 'orzo', 'gnocchi', 'lasagna', 'ravioli',
  'spaghetti', 'linguine', 'tagliatelle', 'noodle', 'pasta', 'rice', 'pilaf',
  'quinoa', 'bulgur', 'farro', 'barley', 'potato', 'bread', 'flatbread',
  'focaccia', 'tart', 'galette', 'pizza', 'hummus', 'falafel', 'tabbouleh',
])

const GENERIC_INGREDIENTS = new Set([
  'salt', 'pepper', 'oil', 'olive oil', 'water', 'garlic', 'onion', 'lemon',
  'lime', 'herb', 'herbs', 'spice', 'spices',
])

function stem(value: string): string {
  if (value.endsWith('ies') && value.length > 4) return `${value.slice(0, -3)}y`
  if (value.endsWith('oes') && value.length > 4) return value.slice(0, -2)
  if (value.endsWith('s') && !value.endsWith('ss') && value.length > 3) return value.slice(0, -1)
  return value
}

function words(value: string): string[] {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean).map(stem)
}

function normalizedPhrase(value: string): string {
  return words(value).join(' ')
}

function nameTerms(value: string): Set<string> {
  return new Set(words(value).filter(word => !MODIFIERS.has(word)))
}

function meaningfulIngredients(dish: DishIdentityInput): Set<string> {
  const values = [
    ...dish.usedAvailableIngredients,
    ...dish.missingIngredients.filter(item => item.importance === 'core').map(item => item.name),
  ]
  return new Set(values.map(normalizedPhrase).filter(value => value && !GENERIC_INGREDIENTS.has(value)))
}

function intersection<T>(a: Set<T>, b: Set<T>): T[] {
  return Array.from(a).filter(value => b.has(value))
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0
  const shared = intersection(a, b).length
  return shared / (a.size + b.size - shared)
}

export function compareDishIdentity(a: DishIdentityInput, b: DishIdentityInput): DishSimilarity {
  const normalizedA = normalizedPhrase(a.name)
  const normalizedB = normalizedPhrase(b.name)
  if (normalizedA === normalizedB) return { duplicate: true, reason: `same dish name: ${normalizedA}` }

  const termsA = nameTerms(a.name)
  const termsB = nameTerms(b.name)
  const sharedDistinctiveBase = intersection(termsA, termsB).find(term => DISTINCTIVE_BASES.has(term))
  if (sharedDistinctiveBase) return { duplicate: true, reason: `shared core dish: ${sharedDistinctiveBase}` }

  const sharedNameTerms = intersection(termsA, termsB)
  const overlapCoefficient = termsA.size && termsB.size
    ? sharedNameTerms.length / Math.min(termsA.size, termsB.size)
    : 0
  if (sharedNameTerms.length >= 2 && overlapCoefficient >= 0.75) {
    return { duplicate: true, reason: `highly similar dish concept: ${sharedNameTerms.join(', ')}` }
  }

  const ingredientsA = meaningfulIngredients(a)
  const ingredientsB = meaningfulIngredients(b)
  const ingredientOverlap = jaccard(ingredientsA, ingredientsB)
  if (intersection(ingredientsA, ingredientsB).length > 0 && ingredientOverlap >= 0.70) {
    return { duplicate: true, reason: `overlapping core ingredients (${Math.round(ingredientOverlap * 100)}%)` }
  }

  return { duplicate: false }
}
