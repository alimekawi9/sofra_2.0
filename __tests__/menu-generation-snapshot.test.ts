import { hasEnoughGuestResponses, menuResponseGuidance, menuResponseLabel, newMenuResponseCount, newMenuResponseLabel, shouldShowMenuExport } from '@/lib/menu-generation-snapshot'

describe('menu generation RSVP snapshots', () => {
  it('reports three new responses after generating for five guests', () => {
    expect(newMenuResponseCount(8, 5)).toBe(3)
  })

  it('never invents a comparison for legacy menus without a snapshot', () => {
    expect(newMenuResponseCount(8, null)).toBe(0)
  })

  it('does not report negative changes', () => {
    expect(newMenuResponseCount(4, 5)).toBe(0)
  })

  it('uses denominator-free response copy', () => {
    expect(menuResponseLabel(0)).toBe('0 guests have responded')
    expect(menuResponseLabel(1)).toBe('1 guest has responded')
    expect(menuResponseLabel(5)).toBe('5 guests have responded')
  })

  it('recommends waiting below three guest responses', () => {
    expect(hasEnoughGuestResponses(2)).toBe(false)
    expect(menuResponseGuidance(2)).toContain('more accurate draft')
    expect(hasEnoughGuestResponses(3)).toBe(true)
    expect(menuResponseGuidance(3)).toContain('Feel free to generate now')
  })

  it('uses correct singular and plural regeneration copy', () => {
    expect(newMenuResponseLabel(1)).toBe('1 new guest has responded since this menu was generated.')
    expect(newMenuResponseLabel(3)).toBe('3 new guests have responded since this menu was generated.')
  })

  it('only exposes menu export after a draft exists', () => {
    expect(shouldShowMenuExport(0)).toBe(false)
    expect(shouldShowMenuExport(1)).toBe(true)
  })
})
