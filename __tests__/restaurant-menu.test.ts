import { buildIntel, type TasteProfile } from '@/lib/intel'
import { parseRestaurantMenuFileDataUrl, restaurantProposalNeedsReview, sanitizeRestaurantMenuExtraction, scoreConfirmedRestaurantDish } from '@/lib/restaurant-menu'

const guest = (name: string, overrides: Partial<TasteProfile> = {}): TasteProfile => ({
  name,
  dietary: [],
  avoid: [],
  proteinPreferences: [],
  flavorPreference: [],
  adventurousness: 50,
  ...overrides,
})

describe('restaurant menu extraction boundary', () => {
  it('accepts PDF data URLs as a bounded restaurant-menu source', () => {
    expect(parseRestaurantMenuFileDataUrl('data:application/pdf;base64,JVBERi0xLjQ='))
      .toEqual({ mimeType: 'application/pdf', data: 'JVBERi0xLjQ=', sourceType: 'pdf' })
    expect(parseRestaurantMenuFileDataUrl('data:text/plain;base64,SGVsbG8=')).toBeNull()
  })

  it('keeps only canonical metadata and deduplicates dish names', () => {
    const result = sanitizeRestaurantMenuExtraction({ dishes: [
      { name: 'Lamb Kofta', source_text: 'lamb, parsley', role: 'main', tags: ['lamb', 'grilled', 'invented', 'starter'], allergens: ['gluten', 'invented'], confidence: 0.95, uncertainties: [] },
      { name: ' lamb kofta ', role: 'side', tags: [] },
      { name: '', role: 'main' },
    ] })
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ name: 'Lamb Kofta', suggestedRole: 'starter' })
    expect(result[0].suggestedTags).toEqual(expect.arrayContaining(['lamb', 'grilled', 'starter']))
    expect(result[0].suggestedTags).not.toContain('invented')
    expect(result[0].suggestedAllergens).toEqual(['gluten'])
    expect(restaurantProposalNeedsReview(result[0])).toBe(false)
  })

  it('requires confirmation only for low-confidence or explicitly uncertain proposals', () => {
    expect(restaurantProposalNeedsReview({ confidence: 0.92, uncertainties: [] })).toBe(false)
    expect(restaurantProposalNeedsReview({ confidence: 0.89, uncertainties: [] })).toBe(true)
    expect(restaurantProposalNeedsReview({ confidence: 0.99, uncertainties: ['Could be a side'] })).toBe(true)
  })

  it('does not score an unconfirmed proposal', () => {
    const guests = [guest('A')]
    expect(scoreConfirmedRestaurantDish({ id: '1', name: 'Soup', role: 'starter', tags: ['veg'], contains_allergens: [], review_status: 'unconfirmed' }, buildIntel(guests), guests)).toBeNull()
  })

  it('scores a confirmed dish through existing safety logic', () => {
    const guests = [guest('A', { avoid: ['nuts'] }), guest('B')]
    const result = scoreConfirmedRestaurantDish({ id: '1', name: 'Almond Cream', role: 'dessert', tags: ['veg', 'dairy'], contains_allergens: ['nuts'], review_status: 'confirmed' }, buildIntel(guests), guests)
    expect(result?.guestCount).toBe(2)
    expect(result?.safeGuestCount).toBe(1)
    expect(result?.exclusions[0]).toMatchObject({ guest: 'A', reason: 'contains nuts' })
  })

  it('scores a high-confidence auto-confirmed dish through the same deterministic logic', () => {
    const guests = [guest('A')]
    expect(scoreConfirmedRestaurantDish({ id: '1', name: 'Tomato Salad', role: 'starter', tags: ['vegetable'], contains_allergens: [], review_status: 'auto_confirmed' }, buildIntel(guests), guests)).not.toBeNull()
  })
})
