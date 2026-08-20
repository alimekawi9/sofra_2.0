import { guestHostLabel, guestHostBreakdown } from '@/lib/guest-host-count'

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

describe('guestHostBreakdown', () => {
  it('counts a host among the RSVPs as a host, not a guest', () => {
    const hostIds = new Set(['host-1'])
    expect(guestHostBreakdown(['host-1', 'guest-1', 'guest-2'], hostIds)).toEqual({ guests: 2, hosts: 1 })
  })

  it('still counts a co-host who never submitted an RSVP row, matching the Around this Sofra roster', () => {
    const hostIds = new Set(['host-1', 'cohost-1'])
    // cohost-1 has no RSVP row at all here.
    expect(guestHostBreakdown(['host-1', 'guest-1', 'guest-2', 'guest-3'], hostIds)).toEqual({ guests: 3, hosts: 2 })
  })

  it('does not double count a co-host who also has an RSVP row', () => {
    const hostIds = new Set(['host-1', 'cohost-1'])
    expect(guestHostBreakdown(['host-1', 'cohost-1', 'guest-1'], hostIds)).toEqual({ guests: 1, hosts: 2 })
  })

  it('handles no RSVPs at all beyond the hosts themselves', () => {
    const hostIds = new Set(['host-1', 'cohost-1'])
    expect(guestHostBreakdown(['host-1'], hostIds)).toEqual({ guests: 0, hosts: 2 })
  })
})
