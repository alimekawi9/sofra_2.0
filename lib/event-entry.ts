export type EventEntryRole = 'host' | 'cohost' | 'chef' | 'guest'

export type EventEntryContext = {
  eventId: string
  userId: string
  hostId: string
  chefId?: string | null
  isCohost: boolean
  hasRsvp: boolean
}

export function eventEntryRole(context: EventEntryContext): EventEntryRole {
  if (context.userId === context.hostId) return 'host'
  if (context.isCohost) return 'cohost'
  if (context.chefId === context.userId) return 'chef'
  return 'guest'
}

/**
 * Resolves a canonical event link after identity and membership are known.
 * A null result means the viewer may remain on the event detail page.
 */
export function eventEntryDestination(context: EventEntryContext): string | null {
  const role = eventEntryRole(context)
  if (role === 'chef') return `/kitchen?from=${context.eventId}&delegate=1`
  if (role === 'host' || role === 'cohost' || context.hasRsvp) return null
  return `/events/${context.eventId}/rsvp`
}

export function rsvpEntryDestination(
  context: EventEntryContext,
  options: { editing: boolean; preferencesOnly: boolean }
): string | null {
  const role = eventEntryRole(context)
  if (role === 'chef') return `/kitchen?from=${context.eventId}&delegate=1`
  if (role === 'host' || role === 'cohost') {
    return options.preferencesOnly ? null : `/events/${context.eventId}`
  }
  if (context.hasRsvp && !options.editing) {
    return `/events/${context.eventId}`
  }
  return null
}

export function loginDestination(next: string): string {
  return `/login?invite=1&next=${encodeURIComponent(next)}`
}
