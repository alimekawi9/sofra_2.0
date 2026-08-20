export function guestHostLabel(guestCount: number, hostCount: number): string {
  const guestPart = `${guestCount} guest${guestCount === 1 ? '' : 's'}`
  const hostPart = `${hostCount} host${hostCount === 1 ? '' : 's'}`
  return `${guestPart} · ${hostPart}`
}

// Every known host (the original host plus any accepted co-host) counts as
// "at the table" regardless of whether they happen to have their own RSVP
// row -- matching the Around this Sofra roster, which shows every co-host
// with a Host badge even if they never RSVP'd. A guest/host split based only
// on the rsvps table would silently drop an un-RSVP'd co-host entirely.
export function guestHostBreakdown(rsvpUserIds: string[], hostUserIds: Set<string>): { guests: number; hosts: number } {
  const attendeeIds = new Set([...rsvpUserIds, ...hostUserIds])
  const hosts = hostUserIds.size
  return { guests: attendeeIds.size - hosts, hosts }
}
