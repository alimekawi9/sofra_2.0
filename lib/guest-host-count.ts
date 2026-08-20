export function guestHostLabel(guestCount: number, hostCount: number): string {
  const guestPart = `${guestCount} guest${guestCount === 1 ? '' : 's'}`
  const hostPart = `${hostCount} host${hostCount === 1 ? '' : 's'}`
  return `${guestPart} · ${hostPart}`
}

export function countHostsAmong(userIds: string[], hostUserIds: Set<string>): number {
  return userIds.filter((userId) => hostUserIds.has(userId)).length
}
