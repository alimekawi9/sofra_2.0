import { buildIcsFile, googleCalendarUrl, icsDataUrl } from '@/lib/calendar'

const START = '2026-08-01T19:00:00.000Z'

describe('calendar export', () => {
  it('builds a Google Calendar link using the floating wall-clock time, not a converted UTC instant', () => {
    const url = googleCalendarUrl({ title: "Sunday's Table", startIso: START })
    const params = new URL(url).searchParams
    expect(params.get('action')).toBe('TEMPLATE')
    expect(params.get('text')).toBe("Sunday's Table")
    // 7:00 PM start, default 3-hour duration -> 10:00 PM end, no timezone suffix.
    expect(params.get('dates')).toBe('20260801T190000/20260801T220000')
  })

  it('includes optional description and location when provided', () => {
    const url = googleCalendarUrl({ title: 'Dinner', startIso: START, description: 'Bring an appetite', location: '123 Main St' })
    const params = new URL(url).searchParams
    expect(params.get('details')).toBe('Bring an appetite')
    expect(params.get('location')).toBe('123 Main St')
  })

  it('omits description/location from the URL when absent', () => {
    const url = googleCalendarUrl({ title: 'Dinner', startIso: START })
    const params = new URL(url).searchParams
    expect(params.has('details')).toBe(false)
    expect(params.has('location')).toBe(false)
  })

  it('respects a custom duration', () => {
    const url = googleCalendarUrl({ title: 'Dinner', startIso: START, durationHours: 1 })
    expect(new URL(url).searchParams.get('dates')).toBe('20260801T190000/20260801T200000')
  })

  it('rolls the end time over midnight correctly', () => {
    const url = googleCalendarUrl({ title: 'Late Night', startIso: '2026-08-01T23:00:00.000Z', durationHours: 3 })
    expect(new URL(url).searchParams.get('dates')).toBe('20260801T230000/20260802T020000')
  })

  it('builds a valid, floating-time .ics VEVENT', () => {
    const ics = buildIcsFile({ title: "Sunday's Table", startIso: START, description: 'Bring an appetite', location: '123 Main St' })
    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('BEGIN:VEVENT')
    expect(ics).toContain('DTSTART:20260801T190000')
    expect(ics).toContain('DTEND:20260801T220000')
    expect(ics).toContain("SUMMARY:Sunday's Table")
    expect(ics).toContain('DESCRIPTION:Bring an appetite')
    expect(ics).toContain('LOCATION:123 Main St')
    expect(ics).toContain('END:VEVENT')
    expect(ics).toContain('END:VCALENDAR')
    // DTSTART/DTEND must never carry a timezone suffix -- that would let
    // calendar clients convert them per-viewer, defeating the floating-time
    // intent every other event-date consumer in this app already relies on.
    expect(ics).not.toMatch(/DTSTART:\d{8}T\d{6}Z/)
    expect(ics).not.toMatch(/DTEND:\d{8}T\d{6}Z/)
  })

  it('escapes ICS special characters in text fields', () => {
    const ics = buildIcsFile({ title: 'Dinner; Drinks, Dessert\nand more', startIso: START })
    expect(ics).toContain('SUMMARY:Dinner\\; Drinks\\, Dessert\\nand more')
  })

  it('omits DESCRIPTION/LOCATION lines when absent', () => {
    const ics = buildIcsFile({ title: 'Dinner', startIso: START })
    expect(ics).not.toContain('DESCRIPTION:')
    expect(ics).not.toContain('LOCATION:')
  })

  it('produces a downloadable data: URI containing the same calendar text', () => {
    const url = icsDataUrl({ title: 'Dinner', startIso: START })
    expect(url.startsWith('data:text/calendar;charset=utf-8,')).toBe(true)
    expect(decodeURIComponent(url.slice(url.indexOf(',') + 1))).toContain('SUMMARY:Dinner')
  })
})
