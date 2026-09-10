// Sofra doesn't store an explicit event end time (see docs/DECISION_LOG.md --
// only a single wall-clock start moment is captured), so calendar exports
// need a reasonable default event length.
const DEFAULT_DURATION_HOURS = 3

export type CalendarEventDetails = {
  title: string
  description?: string
  location?: string
  /**
   * The raw stored `event_date` value -- a "floating" wall-clock timestamp
   * (see lib/event-date.ts): its Y/M/D/H/M digits are the literal time
   * everyone should see, not a real UTC instant to convert per viewer. This
   * module treats it the same way `formatEventDate`/`formatEventTime` do,
   * by reading it back out with the UTC getters rather than local ones.
   */
  startIso: string
  durationHours?: number
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

// Renders a Date's UTC fields as a timestamp with no "Z"/offset suffix -- a
// "floating" local time in ICS/Google Calendar terms, matching how Sofra
// already treats event_date everywhere else: the same clock time for every
// viewer, never converted into their device's timezone.
function floatingStamp(date: Date): string {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`
}

function eventWindow(startIso: string, durationHours: number): { start: string; end: string } {
  const start = new Date(startIso)
  const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000)
  return { start: floatingStamp(start), end: floatingStamp(end) }
}

export function googleCalendarUrl(details: CalendarEventDetails): string {
  const { start, end } = eventWindow(details.startIso, details.durationHours ?? DEFAULT_DURATION_HOURS)
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: details.title,
    dates: `${start}/${end}`,
  })
  if (details.description) params.set('details', details.description)
  if (details.location) params.set('location', details.location)
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

function escapeIcsText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

// A minimal, unfolded RFC 5545 VEVENT -- sufficient for Sofra's short
// titles/venues, and readable by every major calendar client including
// Apple Calendar (its "Add to Apple Calendar" support is just opening a
// downloaded/data-URI .ics file; there's no separate Apple web API).
export function buildIcsFile(details: CalendarEventDetails): string {
  const { start, end } = eventWindow(details.startIso, details.durationHours ?? DEFAULT_DURATION_HOURS)
  const uid = `${start}-${Math.random().toString(36).slice(2)}@sofra`
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Sofra//Event//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${floatingStamp(new Date())}Z`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${escapeIcsText(details.title)}`,
    ...(details.description ? [`DESCRIPTION:${escapeIcsText(details.description)}`] : []),
    ...(details.location ? [`LOCATION:${escapeIcsText(details.location)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.join('\r\n')
}

export function icsDataUrl(details: CalendarEventDetails): string {
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(buildIcsFile(details))}`
}
