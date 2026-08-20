import { guestHostLabel, countHostsAmong } from '@/lib/guest-host-count'

describe('guestHostLabel', () => {
  it('pluralizes both parts', () => {
    expect(guestHostLabel(3, 2)).toBe('3 guests · 2 hosts')
  })

  it('uses singular guest and host when each count is 1', () => {
    expect(guestHostLabel(1, 1)).toBe('1 guest · 1 host')
  })

  it('handles zero guests', () => {
    expect(guestHostLabel(0, 1)).toBe('0 guests · 1 host')
  })
})

describe('countHostsAmong', () => {
  it('counts how many of the given user ids are hosts', () => {
    const hostIds = new Set(['host-1', 'cohost-1'])
    expect(countHostsAmong(['host-1', 'cohost-1', 'guest-1', 'guest-2'], hostIds)).toBe(2)
  })

  it('returns 0 when none of the user ids are hosts', () => {
    expect(countHostsAmong(['guest-1', 'guest-2'], new Set(['host-1']))).toBe(0)
  })
})
