import { eventIdFromNext, phoneLookupVariants, selectPhoneCandidate } from '@/lib/phone-identity'

describe('phone identity compatibility', () => {
  it('matches an international Egyptian number to legacy national formats', () => {
    expect(phoneLookupVariants('+201271199929')).toEqual(expect.arrayContaining([
      '+201271199929',
      '201271199929',
      '1271199929',
      '01271199929',
    ]))
  })

  it('extracts an event id from update and album return paths', () => {
    expect(eventIdFromNext('/events/event-1?entry=update')).toBe('event-1')
    expect(eventIdFromNext('/events/event-1/album?entry=update')).toBe('event-1')
    expect(eventIdFromNext('/profile')).toBeNull()
  })

  it('prefers the legacy-format account that already belongs to the event', () => {
    const candidates = [
      { id: 'new-account', phone: '+201271199929' },
      { id: 'member-account', phone: '1271199929' },
    ]
    expect(selectPhoneCandidate(candidates, '+201271199929', new Set(['member-account']))?.id)
      .toBe('member-account')
  })

  it('otherwise prefers the exact canonical account', () => {
    const candidates = [
      { id: 'legacy-account', phone: '1271199929' },
      { id: 'canonical-account', phone: '+201271199929' },
    ]
    expect(selectPhoneCandidate(candidates, '+201271199929', new Set())?.id)
      .toBe('canonical-account')
  })
})
