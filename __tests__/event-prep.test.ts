import { buildEventPrepItems, daysUntilEvent } from '@/lib/event-prep'

const signals = {
  eventDate: '2026-09-20T19:00:00.000Z', tagline: null, customDetailCount: 0,
  venue: null, address: null, estimatedGuestCount: null, budgetAmount: null,
  menuDrafted: false, playlistStarted: false, photosUploaded: false, feedbackSubmitted: false,
}

describe('event prep alerts', () => {
  it('uses 14, 7, and 2 day thresholds for required work', () => {
    const weeks = buildEventPrepItems(signals, {}, new Date('2026-09-07T19:00:00.000Z'))
    expect(weeks.find((item) => item.key === 'venue')?.alerting).toBe(true)
    expect(weeks.find((item) => item.key === 'menu_drafted')?.alerting).toBe(false)
    const oneWeek = buildEventPrepItems(signals, {}, new Date('2026-09-14T19:00:00.000Z'))
    expect(oneWeek.find((item) => item.key === 'menu_drafted')?.alerting).toBe(true)
    expect(oneWeek.find((item) => item.key === 'seating_finalized')?.alerting).toBe(false)
    const dayOf = buildEventPrepItems(signals, {}, new Date('2026-09-19T19:00:00.000Z'))
    expect(dayOf.find((item) => item.key === 'seating_finalized')?.alerting).toBe(true)
  })

  it('never alerts for optional prep items, with feedback as the post-event exception', () => {
    const near = buildEventPrepItems(signals, {}, new Date('2026-09-19T19:00:00.000Z'))
    expect(near.filter((item) => !item.required).every((item) => !item.alerting)).toBe(true)
    const past = buildEventPrepItems(signals, {}, new Date('2026-09-21T19:00:00.000Z'))
    expect(past.filter((item) => item.key !== 'feedback').every((item) => !item.alerting)).toBe(true)
    expect(past.find((item) => item.key === 'feedback')?.alerting).toBe(true)
    expect(buildEventPrepItems({ ...signals, feedbackSubmitted: true }, {}, new Date('2026-09-21T19:00:00.000Z')).find((item) => item.key === 'feedback')?.alerting).toBe(false)
  })

  it('requires both estimates and both date/invite signals', () => {
    const items = buildEventPrepItems({ ...signals, venue: 'Garden', estimatedGuestCount: 10, budgetAmount: 500 }, { date_invites: { completed: true, note: '' } })
    expect(items.find((item) => item.key === 'guest_budget')?.completed).toBe(true)
    expect(items.find((item) => item.key === 'date_invites')?.completed).toBe(true)
  })

  it('does not calculate a countdown for an undecided date', () => {
    expect(daysUntilEvent('9999-12-31T12:00:00.000Z')).toBeNull()
  })
})
