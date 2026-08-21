export const UNDECIDED_EVENT_DATE = '9999-12-31T12:00:00.000Z'

const EVENT_DATE_INPUT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/

export function isEventDateUndecided(value: string | null | undefined): boolean {
  return value === UNDECIDED_EVENT_DATE || Boolean(value?.startsWith('9999-12-31'))
}

export function eventDateForStorage(value: string): string {
  if (value === 'undecided') return UNDECIDED_EVENT_DATE

  const match = value.match(EVENT_DATE_INPUT_PATTERN)
  if (!match) throw new Error('Invalid event date')

  // Event dates are deliberately "floating" wall-clock values. A host who
  // enters 7:00 PM means 7:00 PM for everyone viewing the invitation, not an
  // instant that should be converted into each guest's device timezone.
  return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:00.000Z`
}

export function eventDateForInput(value: string): string {
  if (isEventDateUndecided(value)) return 'undecided'
  const match = value.match(EVENT_DATE_INPUT_PATTERN)
  return match ? `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}` : ''
}

export function formatEventDate(
  value: string,
  options: Intl.DateTimeFormatOptions = {}
): string {
  return new Date(value).toLocaleDateString('en-US', { ...options, timeZone: 'UTC' })
}

export function formatEventTime(
  value: string,
  options: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' }
): string {
  return new Date(value).toLocaleTimeString('en-US', { ...options, timeZone: 'UTC' })
}
