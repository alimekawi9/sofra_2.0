import { DISH_ROLES, isDishRole, type DishRole, withDishRole, withoutDishRoles } from './dish-presets'
import { inferIngredientAllergens } from './ingredient-safety'
import type { TasteProfile, TableIntel } from './intel'
import { KITCHEN_ALLERGENS, tagsForKitchenKind } from './kitchen-tags'
import { scoreDish, type Exclusion, type Signature } from './menu'
import { dinerDishFit } from './recommendation/pipeline'

export type RestaurantMenuStatus = 'review' | 'confirmed' | 'failed'
export type RestaurantDishReviewStatus = 'unconfirmed' | 'auto_confirmed' | 'confirmed' | 'excluded'
export type RestaurantMenuSourceType = 'text' | 'image' | 'pdf'

export const MAX_RESTAURANT_MENU_FILE_BYTES = 5 * 1024 * 1024

export type RestaurantMenuInlineFile = {
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf'
  data: string
  sourceType: Exclude<RestaurantMenuSourceType, 'text'>
}

export type RestaurantDishProposal = {
  name: string
  sourceText: string
  suggestedRole: DishRole
  suggestedTags: string[]
  suggestedAllergens: string[]
  confidence: number
  uncertainties: string[]
}

export type RestaurantMenuDish = {
  id: string
  restaurant_menu_id: string
  source_order: number
  source_text: string
  name: string
  ai_suggested_role: DishRole
  ai_suggested_tags: string[]
  ai_suggested_allergens: string[]
  ai_confidence: number
  ai_uncertainties: string[]
  role: DishRole
  tags: string[]
  contains_allergens: string[]
  review_status: RestaurantDishReviewStatus
  reviewed_by: string | null
  reviewed_at: string | null
}

export type RestaurantMenu = {
  id: string
  event_id: string
  created_by: string
  restaurant_name: string
  source_type: RestaurantMenuSourceType
  raw_menu_text: string | null
  status: RestaurantMenuStatus
  created_at: string
  confirmed_at: string | null
  dishes: RestaurantMenuDish[]
}

const allowedTagSet = new Set(tagsForKitchenKind('signature'))
const allowedAllergenSet = new Set<string>(KITCHEN_ALLERGENS)

/** Validates browser data URLs before bytes are passed to Gemini. */
export function parseRestaurantMenuFileDataUrl(value: unknown): RestaurantMenuInlineFile | null {
  if (typeof value !== 'string') return null
  const match = value.match(/^data:(image\/(?:jpeg|png|webp)|application\/pdf);base64,([A-Za-z0-9+/=]+)$/)
  if (!match) return null
  const padding = match[2].endsWith('==') ? 2 : match[2].endsWith('=') ? 1 : 0
  const byteLength = Math.floor(match[2].length * 3 / 4) - padding
  if (byteLength <= 0 || byteLength > MAX_RESTAURANT_MENU_FILE_BYTES) return null
  const mimeType = match[1] as RestaurantMenuInlineFile['mimeType']
  return { mimeType, data: match[2], sourceType: mimeType === 'application/pdf' ? 'pdf' : 'image' }
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
    : []
}

export const RESTAURANT_AUTO_CONFIRM_CONFIDENCE = 0.9

export function restaurantProposalNeedsReview(proposal: Pick<RestaurantDishProposal, 'confidence' | 'uncertainties'>): boolean {
  return proposal.confidence < RESTAURANT_AUTO_CONFIRM_CONFIDENCE || proposal.uncertainties.length > 0
}

/**
 * Treat model output as an untrusted proposal. Only canonical Sofra values
 * survive this boundary; duplicate names and incomplete rows are discarded.
 */
export function sanitizeRestaurantMenuExtraction(value: unknown): RestaurantDishProposal[] {
  const root = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const rows = Array.isArray(root.dishes) ? root.dishes : []
  const seen = new Set<string>()
  const proposals: RestaurantDishProposal[] = []

  for (const raw of rows) {
    if (!raw || typeof raw !== 'object') continue
    const row = raw as Record<string, unknown>
    const name = typeof row.name === 'string' ? row.name.trim().replace(/\s+/g, ' ') : ''
    const key = name.toLocaleLowerCase('en-US')
    if (!name || name.length > 160 || seen.has(key)) continue

    const hasSourceText = typeof row.source_text === 'string' && Boolean(row.source_text.trim())
    const sourceText = hasSourceText ? String(row.source_text).trim().slice(0, 500) : name
    const requestedRole = typeof row.role === 'string' && isDishRole(row.role) ? row.role : 'flex'
    const tags = Array.from(new Set(strings(row.tags).filter((tag) => allowedTagSet.has(tag))))
    const role = tags.find(isDishRole) ?? requestedRole
    const descriptiveTags = withoutDishRoles(tags)
    const proposedAllergens = strings(row.allergens).filter((allergen) => allowedAllergenSet.has(allergen))
    const inferredAllergens = inferIngredientAllergens(`${name} ${sourceText}`)
      .filter((allergen) => allowedAllergenSet.has(allergen))
    const rawConfidence = typeof row.confidence === 'number' && Number.isFinite(row.confidence) ? row.confidence : 0
    const confidence = Math.max(0, Math.min(1, rawConfidence))
    const uncertainties = Array.from(new Set([
      ...strings(row.uncertainties).map((item) => item.slice(0, 180)),
      ...(!hasSourceText ? ['No supporting menu description was returned.'] : []),
    ])).slice(0, 5)

    seen.add(key)
    proposals.push({
      name,
      sourceText,
      suggestedRole: DISH_ROLES.includes(role) ? role : 'flex',
      suggestedTags: withDishRole(descriptiveTags, role),
      suggestedAllergens: Array.from(new Set([...proposedAllergens, ...inferredAllergens])),
      confidence,
      uncertainties,
    })
  }

  return proposals.slice(0, 80)
}

export function restaurantDishToSignature(dish: Pick<RestaurantMenuDish, 'id' | 'name' | 'role' | 'tags' | 'contains_allergens'>): Signature {
  return {
    id: dish.id,
    name: dish.name,
    tags: withDishRole(dish.tags.filter((tag) => allowedTagSet.has(tag)), dish.role),
    contains_allergens: dish.contains_allergens.filter((allergen) => allowedAllergenSet.has(allergen)),
    slot: dish.role === 'flex' ? null : dish.role,
    novelty_score: null,
    is_substantial: dish.role === 'main',
  }
}

export type RestaurantDishScore = {
  exclusions: Exclusion[]
  safeGuestCount: number
  guestCount: number
  averagePreferenceFit: number
}

/** Uses the existing safety and 45/35/20 preference scorer without ranking. */
export function scoreConfirmedRestaurantDish(
  dish: Pick<RestaurantMenuDish, 'id' | 'name' | 'role' | 'tags' | 'contains_allergens' | 'review_status'>,
  intel: TableIntel,
  guests: TasteProfile[]
): RestaurantDishScore | null {
  if (dish.review_status !== 'confirmed' && dish.review_status !== 'auto_confirmed') return null
  const signature = restaurantDishToSignature(dish)
  const exclusions = scoreDish(signature, intel)
  const fits = guests.map((guest) => dinerDishFit(guest, signature, guests.length))
  return {
    exclusions,
    safeGuestCount: fits.filter((fit) => fit.eligibility === 1).length,
    guestCount: guests.length,
    averagePreferenceFit: fits.length ? fits.reduce((sum, fit) => sum + fit.q, 0) / fits.length : 0,
  }
}
