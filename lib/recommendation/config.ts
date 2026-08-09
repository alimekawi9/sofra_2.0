export const RECOMMENDATION_CONFIG = {
  allergy: { largeGroupCutoff: 8 },
  dishCount: { minimum: 3, maximum: 9 },
  roleTargets: { starter: 0.25, main: 0.40, side: 0.25, dessert: 0.10 },
  roleCeilings: { starter: 0.35, main: 0.55, side: 0.35, dessertAbsolute: 1 },
  preferenceWeights: { protein: 0.45, flavor: 0.35, adventurousness: 0.20 },
  satisfaction: { dishThreshold: 0.60, strongDishThreshold: 0.75, menuAverageTarget: 0.65, menuAverageWarning: 0.50 },
  signatureWeights: { tableFit: 0.45, satisfactionRate: 0.25, dietaryReach: 0.15, underservedContribution: 0.15 },
  selectionWeights: { baseStrength: 0.75, roleNeed: 0.15, diversityContribution: 0.10 },
  signatureThresholds: { strong: 0.70, conditional: 0.58, underservedOverride: 0.60 },
  ingredientWeights: { gapFit: 0.40, unsatisfiedDinerFit: 0.30, menuCompatibility: 0.20, categoryVariety: 0.10 },
  ingredientRetrieval: { relevanceThreshold: 0.55, maximumContext: 28, mmrRelevanceWeight: 0.80, mmrDiversityWeight: 0.20 },
  repetition: { dominantFlavorWarning: 0.50, richDishWarning: 0.50, sameTechniqueWarning: 0.50, sameProteinWarning: 0.50, majorityPreferenceOverride: 0.65, duplicateCoreIngredientOverlap: 0.70, maximumSameCoreIngredient: 2 },
  purchasing: { minorMaximumMissing: 2, majorMaximumMissing: 3, maximumCoreMissing: 1, maximumUniqueMissingPerMenu: 4 },
  insufficientData: { minimumRelevantIngredientsWithoutSignatures: 4 },
  latency: { modelDeadlineMs: 8000, totalTargetMs: 10000 },
} as const

export type DishRole = 'starter' | 'main' | 'side' | 'dessert' | 'flex'
