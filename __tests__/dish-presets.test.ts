import { canonicalDishName, dishPresetKey } from '@/lib/dish-presets'

describe('preset identity', () => {
  test('normalizes only case, surrounding space, and repeated whitespace', () => {
    expect(canonicalDishName('  Baba   GANOUSH ')).toBe('baba ganoush')
    expect(canonicalDishName('Baba Ganoush with Lamb')).not.toBe(canonicalDishName('Baba Ganoush'))
  })

  test('uses cuisine and canonical name for a stable key', () => {
    expect(dishPresetKey({ cuisine: 'Levantine', name: ' Baba  Ganoush ' })).toBe('Levantine::baba ganoush')
  })
})
