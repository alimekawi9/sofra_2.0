export const UNDECIDED_EVENT_DATE = '9999-12-31T12:00:00.000Z'

export function isEventDateUndecided(value: string | null | undefined): boolean {
  return value === UNDECIDED_EVENT_DATE || Boolean(value?.startsWith('9999-12-31'))
}

export function eventDateForStorage(value: string): string {
  return value === 'undecided' ? UNDECIDED_EVENT_DATE : new Date(value).toISOString()
}
