import {
  eventDateForInput,
  eventDateForStorage,
  formatEventDate,
  formatEventTime,
  UNDECIDED_EVENT_DATE,
} from '@/lib/event-date'

describe('floating event dates', () => {
  it('stores a datetime-local value without applying the device timezone', () => {
    expect(eventDateForStorage('2026-08-01T19:00')).toBe('2026-08-01T19:00:00.000Z')
  })

  it('restores the exact wall-clock value for editing', () => {
    expect(eventDateForInput('2026-08-01T19:00:00.000Z')).toBe('2026-08-01T19:00')
  })

  it('formats the stored wall-clock date and time in UTC to prevent guest-device conversion', () => {
    const value = '2026-08-01T19:00:00.000Z'
    expect(formatEventDate(value, { month: 'long', day: 'numeric', year: 'numeric' })).toBe('August 1, 2026')
    expect(formatEventTime(value)).toBe('7:00 PM')
  })

  it('preserves the undecided sentinel', () => {
    expect(eventDateForStorage('undecided')).toBe(UNDECIDED_EVENT_DATE)
    expect(eventDateForInput(UNDECIDED_EVENT_DATE)).toBe('undecided')
  })
})
