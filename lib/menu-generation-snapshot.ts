export function newMenuResponseCount(currentResponseCount: number, generatedGuestCount: number | null): number {
  if (generatedGuestCount === null) return 0
  return Math.max(0, currentResponseCount - generatedGuestCount)
}

export function menuResponseLabel(count: number): string {
  return `${count} guest${count === 1 ? ' has' : 's have'} responded`
}

export function newMenuResponseLabel(count: number): string {
  return `${count} new guest${count === 1 ? ' has' : 's have'} responded since this menu was generated.`
}
