import { addClockMinutes, defaultEventTimeline, eventStartClock, formatTimelineClock, sortEventTimeline } from '@/lib/event-timeline'

describe('event timeline', () => {
  it('uses the static event wall-clock time', () => {
    expect(eventStartClock('2026-09-13T18:00:00.000Z')).toBe('18:00')
    expect(defaultEventTimeline('2026-09-13T18:00:00.000Z').map((item) => item.time)).toEqual(['18:00', '18:30', '19:15', '20:00'])
  })

  it('wraps offsets after midnight', () => {
    expect(addClockMinutes('23:30', 75)).toBe('00:45')
  })

  it('sorts entries chronologically and formats display time', () => {
    const sorted = sortEventTimeline([
      { id: 'b', title: 'Dessert', time: '20:00', position: 0 },
      { id: 'a', title: 'Drinks', time: '18:00', position: 1 },
    ])
    expect(sorted.map((item) => item.title)).toEqual(['Drinks', 'Dessert'])
    expect(formatTimelineClock('18:00')).toBe('6:00 PM')
  })
})
