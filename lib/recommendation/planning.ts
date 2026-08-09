import { RECOMMENDATION_CONFIG, type DishRole } from './config'

export function calculateTargetDishCount(guestCount: number): number {
  if (guestCount <= 0) return 4
  return Math.min(RECOMMENDATION_CONFIG.dishCount.maximum, Math.max(
    RECOMMENDATION_CONFIG.dishCount.minimum,
    2 + Math.ceil(guestCount / 2),
  ))
}

const BLUEPRINTS: Record<number, Partial<Record<DishRole, number>>> = {
  3: { starter: 1, main: 1, side: 1 },
  4: { starter: 1, main: 2, side: 1 },
  5: { starter: 1, main: 2, side: 1, dessert: 1 },
  6: { starter: 2, main: 2, side: 1, dessert: 1 },
  7: { starter: 2, main: 3, side: 1, dessert: 1 },
  8: { starter: 2, main: 3, side: 2, dessert: 1 },
  9: { starter: 2, main: 4, side: 2, dessert: 1 },
}

export function roleBlueprint(targetDishCount: number): Partial<Record<DishRole, number>> {
  return { ...BLUEPRINTS[Math.min(9, Math.max(3, targetDishCount))] }
}

export function roleCeilings(targetDishCount: number): Record<'starter' | 'main' | 'side' | 'dessert', number> {
  const c = RECOMMENDATION_CONFIG.roleCeilings
  return {
    starter: Math.max(1, Math.ceil(c.starter * targetDishCount)),
    main: Math.max(1, Math.ceil(c.main * targetDishCount)),
    side: Math.max(1, Math.ceil(c.side * targetDishCount)),
    dessert: c.dessertAbsolute,
  }
}

export const requiredSatisfyingDishCount = (n: number) => Math.floor(n / 2) + 1
export const requiredSubstantialDishCount = (n: number) => n <= 4 ? 1 : 2
export const ingredientContextCeiling = (missing: number) => Math.min(28, 8 + 6 * Math.max(0, missing))

export function preferenceFit(protein: number, flavor: number, adventurousness: number): number {
  const w = RECOMMENDATION_CONFIG.preferenceWeights
  return Math.max(0, Math.min(1, w.protein * protein + w.flavor * flavor + w.adventurousness * adventurousness))
}

export function purchaseClass(missing: Array<{ importance: 'core' | 'supporting' | 'optional' }>): 'ready-now' | 'minor-purchase' | 'major-purchase' | 'repair-required' {
  const core = missing.filter((item) => item.importance === 'core').length
  if (missing.length === 0) return 'ready-now'
  if (core > 1 || missing.length > RECOMMENDATION_CONFIG.purchasing.majorMaximumMissing) return 'repair-required'
  if (core === 1 || missing.length === RECOMMENDATION_CONFIG.purchasing.majorMaximumMissing) return 'major-purchase'
  return 'minor-purchase'
}
