import {
  DISH_ROLES,
  dishRoleFromTags,
  isDishRole,
  withDishRole,
} from '@/lib/dish-presets'
import {
  PANTRY_TAG_GROUPS,
  SIGNATURE_TAG_GROUPS,
  pantryTagsForPersistence,
} from '@/lib/kitchen-tags'

describe('dish roles', () => {
  test('uses the canonical role set including main', () => {
    expect(DISH_ROLES).toEqual(['starter', 'main', 'side', 'dessert', 'flex'])
    expect(isDishRole('main')).toBe(true)
    expect(dishRoleFromTags(['savory', 'main'])).toBe('main')
  })

  test('selecting main preserves raw tags and replaces another role', () => {
    expect(withDishRole(['starter', 'room_temperature'], 'main')).toEqual([
      'room_temperature',
      'main',
    ])
  })

  test('signature configuration exposes main', () => {
    expect(SIGNATURE_TAG_GROUPS.find((group) => group.label === 'Role')?.tags)
      .toContain('main')
  })
})

describe('pantry role removal', () => {
  test('pantry picker configuration contains no role group or role values', () => {
    expect(PANTRY_TAG_GROUPS.some((group) => group.label === 'Role')).toBe(false)
    expect(PANTRY_TAG_GROUPS.flatMap((group) => group.tags).some(isDishRole)).toBe(false)
  })

  test('create and update payload boundaries remove legacy roles', () => {
    const rawState = ['savory', 'room_temperature', 'main']
    const createTags = pantryTagsForPersistence(rawState)
    const updateTags = pantryTagsForPersistence(rawState)

    expect(createTags).toEqual(['savory', 'room_temperature'])
    expect(updateTags).toEqual(['savory', 'room_temperature'])
    expect(rawState).toEqual(['savory', 'room_temperature', 'main'])
  })
})
