import { DISH_ROLES, withoutDishRoles } from './dish-presets'

export type TagGroup = { label: string; tags: readonly string[] }

export const DESCRIPTIVE_TAG_GROUPS: readonly TagGroup[] = [
  { label: 'Diet', tags: ['veg', 'vegan', 'pescatarian', 'no pork', 'meat', 'seafood'] },
  { label: 'Protein', tags: ['beef', 'lamb', 'chicken', 'turkey', 'pork', 'duck', 'fish', 'shellfish', 'egg', 'dairy', 'legume', 'tofu', 'mushroom', 'grain', 'pasta', 'vegetable', 'fruit', 'mixed', 'none'] },
  { label: 'Texture', tags: ['crunchy', 'tender', 'chewy', 'juicy', 'silky', 'flaky', 'firm', 'mild', 'bitter', 'savory', 'herbal', 'crispy', 'soft', 'creamy'] },
  { label: 'Cooking Method', tags: ['braised', 'baked', 'steamed', 'boiled', 'seared', 'smoked', 'stewed', 'pickled', 'raw', 'grilled', 'roasted', 'fried'] },
  { label: 'Temperature', tags: ['chilled', 'hot', 'cold', 'room_temperature'] },
  { label: 'Flavor', tags: ['fresh', 'rich', 'spicy', 'sweet', 'smoky', 'acidic', 'earthy', 'umami'] },
]

export const SIGNATURE_TAG_GROUPS: readonly TagGroup[] = [
  { label: 'Role', tags: DISH_ROLES },
  ...DESCRIPTIVE_TAG_GROUPS,
]

// This is intentionally a separate exported configuration, not a UI filter.
export const PANTRY_TAG_GROUPS: readonly TagGroup[] = DESCRIPTIVE_TAG_GROUPS

export const KITCHEN_ALLERGENS = ['nuts', 'shellfish', 'dairy', 'gluten', 'eggs', 'soy', 'pork', 'mushrooms', 'cilantro', 'sesame', 'mustard', 'celery', 'sulfites', 'lupin', 'molluscs'] as const

export type KitchenMetadataKind = 'signature' | 'pantry'

export function tagsForKitchenKind(kind: KitchenMetadataKind): string[] {
  const groups = kind === 'signature' ? SIGNATURE_TAG_GROUPS : PANTRY_TAG_GROUPS
  return Array.from(new Set(groups.flatMap(group => [...group.tags])))
}

/** Boundary sanitizer used for pantry load, create, and update payloads. */
export function pantryTagsForPersistence(tags: readonly string[]): string[] {
  return withoutDishRoles(tags)
}
