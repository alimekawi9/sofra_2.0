import {
  canAccessEventUpdate,
  eventEntryDestination,
  eventEntryRole,
  loginDestination,
  rsvpEntryDestination,
  type EventEntryContext,
} from '@/lib/event-entry'

const guest: EventEntryContext = {
  eventId: 'event-1',
  userId: 'guest-1',
  hostId: 'host-1',
  chefId: 'chef-1',
  isCohost: false,
  hasRsvp: false,
}

describe('event entry routing', () => {
  it('sends a new ordinary guest to RSVP', () => {
    expect(eventEntryDestination(guest)).toBe('/events/event-1/rsvp')
  })

  it('allows update links only for existing event members', () => {
    expect(canAccessEventUpdate(guest)).toBe(false)
    expect(canAccessEventUpdate({ ...guest, hasRsvp: true })).toBe(true)
    expect(canAccessEventUpdate({ ...guest, userId: 'host-1' })).toBe(true)
    expect(canAccessEventUpdate({ ...guest, isCohost: true })).toBe(true)
    expect(canAccessEventUpdate({ ...guest, userId: 'chef-1' })).toBe(true)
  })

  it('keeps a returning RSVP guest on event details', () => {
    expect(eventEntryDestination({ ...guest, hasRsvp: true })).toBeNull()
    expect(rsvpEntryDestination({ ...guest, hasRsvp: true }, { editing: false, preferencesOnly: false }))
      .toBe('/events/event-1')
  })

  it('allows an existing guest to enter RSVP only through the explicit edit action', () => {
    expect(rsvpEntryDestination({ ...guest, hasRsvp: true }, { editing: true, preferencesOnly: false })).toBeNull()
  })

  it.each([
    [{ ...guest, userId: 'host-1' }, 'host'],
    [{ ...guest, isCohost: true }, 'cohost'],
    [{ ...guest, userId: 'chef-1' }, 'chef'],
  ] as const)('recognizes event role without relying on RSVP (%s)', (context, role) => {
    expect(eventEntryRole(context)).toBe(role)
  })

  it('never sends hosts or co-hosts into RSVP', () => {
    expect(rsvpEntryDestination({ ...guest, userId: 'host-1' }, { editing: false, preferencesOnly: false }))
      .toBe('/events/event-1')
    expect(rsvpEntryDestination({ ...guest, isCohost: true }, { editing: false, preferencesOnly: false }))
      .toBe('/events/event-1')
  })

  it('routes the assigned chef directly to delegated Kitchen', () => {
    expect(eventEntryDestination({ ...guest, userId: 'chef-1' })).toBe('/kitchen?from=event-1&delegate=1')
    expect(rsvpEntryDestination({ ...guest, userId: 'chef-1' }, { editing: false, preferencesOnly: false }))
      .toBe('/kitchen?from=event-1&delegate=1')
  })

  it('preserves the complete internal destination through login', () => {
    expect(loginDestination('/events/event-1/cohost?token=abc&claim=1'))
      .toBe('/login?invite=1&next=%2Fevents%2Fevent-1%2Fcohost%3Ftoken%3Dabc%26claim%3D1')
  })
})
