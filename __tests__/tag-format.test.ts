import { formatTagLabel } from '@/lib/tag-format'

describe('formatTagLabel', () => {
  test.each([
    ['room_temperature', 'Room Temperature'],
    ['savory', 'Savory'],
    ['main', 'Main'],
    ['sauce_acid_dairy_or_condiment', 'Sauce Acid Dairy Or Condiment'],
    ['  repeated__ spaces  ', 'Repeated Spaces'],
  ])('formats %p for display as %p', (raw, display) => {
    expect(formatTagLabel(raw)).toBe(display)
    expect(raw).not.toBe(display)
  })
})
