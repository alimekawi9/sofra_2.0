import {
  createSeatPositions,
  inferSeatingSpread,
  recommendSeating,
  scoreSeatingLayout,
  seatingRecommendationExplanation,
  seatingExportOrder,
  seatsForSpread,
  swapSeatAssignments,
  type SeatingSignal,
} from '@/lib/seating'
import type { SeatingAttendee } from '@/lib/event-attendees'

function attendee(userId: string, overrides: Partial<SeatingAttendee> = {}): SeatingAttendee {
  return {
    userId,
    name: userId,
    photoUrl: null,
    dietary: [],
    avoid: [],
    proteinAnchor: null,
    proteinPreferences: [],
    flavorPreference: [],
    adventurousness: 50,
    rsvpStatus: 'going',
    isHost: false,
    ...overrides,
  }
}

it('creates two head drop targets and extra side positions for flexible spreading', () => {
  const seats = createSeatPositions(4)
  expect(seats).toHaveLength(10)
  expect(seats.filter((seat) => seat.side === 'head')).toHaveLength(2)
  expect(seats.filter((seat) => seat.side === 'north')).toHaveLength(4)
  expect(seats.filter((seat) => seat.side === 'south')).toHaveLength(4)
})

it('orders an export clockwise from the first head through the second head', () => {
  const order = seatingExportOrder(createSeatPositions(5))
  expect(order.map((seat) => seat.id)).toEqual([
    'head-0',
    'north-0', 'north-1', 'north-2', 'north-3',
    'head-1',
    'south-3', 'south-2', 'south-1', 'south-0',
  ])
})

it('supports centered, corner, and two-head spread presets', () => {
  const seats = createSeatPositions(4)
  expect(seatsForSpread(seats, 4, 'centered').map((seat) => seat.id)).toEqual([
    'north-1', 'north-2', 'south-1', 'south-2',
  ])
  expect(seatsForSpread(seats, 4, 'corners').map((seat) => seat.id)).toEqual([
    'north-0', 'north-3', 'south-0', 'south-3',
  ])
  const withHeads = seatsForSpread(seats, 4, 'heads')
  expect(withHeads.filter((seat) => seat.side === 'head')).toHaveLength(2)
})

it('prioritizes accepted adjacency, then pending and shared-history proximity', () => {
  const attendees = ['A', 'B', 'C', 'D', 'E', 'F'].map((id) => attendee(id))
  const signals: SeatingSignal[] = [
    { firstUserId: 'A', secondUserId: 'B', connectionStatus: 'accepted', sharedPastCount: 2 },
    { firstUserId: 'C', secondUserId: 'D', connectionStatus: 'pending', sharedPastCount: 1 },
    { firstUserId: 'E', secondUserId: 'F', connectionStatus: 'none', sharedPastCount: 3 },
  ]
  const recommendation = recommendSeating(attendees, signals)
  const score = scoreSeatingLayout(recommendation.assignments, recommendation.seats, attendees, signals)
  expect(score[0]).toBe(1)
  expect(score[1]).toBeGreaterThan(0)
  expect(score[2]).toBeGreaterThan(0)
})

it('swaps two occupied seats without changing the attendee set', () => {
  const original = [{ seatId: 'north-0', userId: 'A' }, { seatId: 'south-0', userId: 'B' }]
  expect(swapSeatAssignments(original, 'north-0', 'south-0')).toEqual([
    { seatId: 'south-0', userId: 'A' },
    { seatId: 'north-0', userId: 'B' },
  ])
})

it('moves a guest into an empty head position and leaves their prior spot open', () => {
  const original = [{ seatId: 'north-1', userId: 'A' }, { seatId: 'south-1', userId: 'B' }]
  const moved = swapSeatAssignments(original, 'north-1', 'head-1')
  expect(moved).toEqual([
    { seatId: 'head-1', userId: 'A' },
    { seatId: 'south-1', userId: 'B' },
  ])
  expect(inferSeatingSpread(moved, createSeatPositions(2), 2)).toBe('custom')
})

it('keeps large parties readable by providing movable positions without fabricating guests', () => {
  const attendees = Array.from({ length: 12 }, (_, index) => attendee(String(index)))
  const recommendation = recommendSeating(attendees, [], 'heads')
  expect(recommendation.assignments).toHaveLength(12)
  expect(new Set(recommendation.assignments.map((assignment) => assignment.userId)).size).toBe(12)
  expect(recommendation.seats.length).toBeGreaterThan(recommendation.assignments.length)
})

it('explains the signals that materially shaped the recommendation', () => {
  const attendees = [attendee('A'), attendee('B')]
  const signals: SeatingSignal[] = [
    { firstUserId: 'A', secondUserId: 'B', connectionStatus: 'accepted', sharedPastCount: 1 },
  ]
  const seats = createSeatPositions(2)
  expect(seatingRecommendationExplanation(
    [{ seatId: 'north-1', userId: 'A' }, { seatId: 'north-2', userId: 'B' }],
    seats,
    attendees,
    signals
  )).toContain('accepted connections')
})
