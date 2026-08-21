export function newMenuResponseCount(currentResponseCount: number, generatedGuestCount: number | null): number {
  if (generatedGuestCount === null) return 0
  return Math.max(0, currentResponseCount - generatedGuestCount)
}

export function menuResponseLabel(count: number): string {
  return `${count} guest${count === 1 ? ' has' : 's have'} responded`
}

export const MIN_RECOMMENDED_GUEST_RESPONSES = 3

export function hasEnoughGuestResponses(count: number): boolean {
  return count >= MIN_RECOMMENDED_GUEST_RESPONSES
}

export function menuResponseGuidance(count: number): string {
  return hasEnoughGuestResponses(count)
    ? 'Enough guests have responded. Feel free to generate now.'
    : 'For a more accurate draft, wait for a few more guests to answer.'
}

export function shouldShowMenuExport(courseCount: number): boolean {
  return courseCount > 0
}

export function newMenuResponseLabel(count: number): string {
  return `${count} new guest${count === 1 ? ' has' : 's have'} responded since this menu was generated.`
}
