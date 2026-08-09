import { RECOMMENDATION_CONFIG } from '@/lib/recommendation/config'
import { calculateTargetDishCount, ingredientContextCeiling, preferenceFit, purchaseClass, requiredSatisfyingDishCount, roleBlueprint, roleCeilings } from '@/lib/recommendation/planning'

test('dynamic dish-count boundaries and zero-guest default', () => {
  expect([0,1,2,3,4,5,6,7,8,9,10,11,12,13].map(calculateTargetDishCount)).toEqual([4,3,3,4,4,5,5,6,6,7,7,8,8,9])
})
test('role blueprints and ceilings are deterministic', () => {
  expect(roleBlueprint(6)).toEqual({ starter: 2, main: 2, side: 1, dessert: 1 })
  expect(roleCeilings(6)).toEqual({ starter: 3, main: 4, side: 3, dessert: 1 })
})
test('preference fit uses 45/35/20 and satisfaction target is strictly over half', () => {
  expect(preferenceFit(1, 0, 0)).toBe(RECOMMENDATION_CONFIG.preferenceWeights.protein)
  expect(preferenceFit(0, 1, 0)).toBe(RECOMMENDATION_CONFIG.preferenceWeights.flavor)
  expect(preferenceFit(0, 0, 1)).toBe(RECOMMENDATION_CONFIG.preferenceWeights.adventurousness)
  expect([3,4,5,6,7,8,9].map(requiredSatisfyingDishCount)).toEqual([2,3,3,4,4,5,5])
})
test('ingredient context and purchasing limits match configuration', () => {
  expect([1,2,3,4].map(ingredientContextCeiling)).toEqual([14,20,26,28])
  expect(purchaseClass([])).toBe('ready-now')
  expect(purchaseClass([{ importance: 'supporting' }, { importance: 'optional' }])).toBe('minor-purchase')
  expect(purchaseClass([{ importance: 'core' }])).toBe('major-purchase')
  expect(purchaseClass([{ importance: 'core' }, { importance: 'core' }])).toBe('repair-required')
})
