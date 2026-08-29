import type { SeatingAttendee } from './event-attendees'

export const SEATING_ALGORITHM_VERSION = 'connections-v1'

export type SeatingSignal = {
  firstUserId: string
  secondUserId: string
  connectionStatus: 'accepted' | 'pending' | 'declined' | 'none'
  sharedPastCount: number
}

export type SeatPosition = {
  id: string
  side: 'head' | 'north' | 'south'
  index: number
  x: number
  y: number
}

export type SeatAssignment = { seatId: string; userId: string }
export type SeatingSpread = 'centered' | 'corners' | 'heads'
type LayoutScore = [number, number, number, number, number]

export function createSeatPositions(attendeeCount: number): SeatPosition[] {
  if (attendeeCount <= 0) return []
  const sideCount = Math.max(4, Math.ceil(attendeeCount / 2) + 1)
  const seats: SeatPosition[] = [
    { id: 'head-0', side: 'head', index: 0, x: 0, y: 0 },
    { id: 'head-1', side: 'head', index: 1, x: sideCount + 1, y: 0 },
  ]
  for (let index = 0; index < sideCount; index += 1) {
    const x = index + 1
    seats.push({ id: `north-${index}`, side: 'north', index, x, y: -1 })
    seats.push({ id: `south-${index}`, side: 'south', index, x, y: 1 })
  }
  return seats
}

export function seatingExportOrder(seats: SeatPosition[]): SeatPosition[] {
  const heads = seats.filter((seat) => seat.side === 'head').sort((a, b) => a.index - b.index)
  return [
    ...(heads[0] ? [heads[0]] : []),
    ...seats.filter((seat) => seat.side === 'north').sort((a, b) => a.index - b.index),
    ...(heads[1] ? [heads[1]] : []),
    ...seats.filter((seat) => seat.side === 'south').sort((a, b) => b.index - a.index),
  ]
}

function centeredIndices(slotCount: number, needed: number): number[] {
  if (needed <= 0) return []
  const start = Math.max(0, Math.floor((slotCount - needed) / 2))
  return Array.from({ length: needed }, (_, index) => start + index)
}

function cornerIndices(slotCount: number, needed: number): number[] {
  if (needed <= 0) return []
  if (needed === 1) return [0]
  return Array.from({ length: needed }, (_, index) =>
    Math.round(index * (slotCount - 1) / (needed - 1))
  )
}

export function seatsForSpread(
  seats: SeatPosition[],
  attendeeCount: number,
  spread: SeatingSpread
): SeatPosition[] {
  if (attendeeCount <= 0) return []
  const north = seats.filter((seat) => seat.side === 'north').sort((a, b) => a.index - b.index)
  const south = seats.filter((seat) => seat.side === 'south').sort((a, b) => a.index - b.index)
  const heads = seats.filter((seat) => seat.side === 'head').sort((a, b) => a.index - b.index)
  const useHeads = spread === 'heads' && attendeeCount >= 2
  const sideTotal = attendeeCount - (useHeads ? 2 : 0)
  const northCount = Math.ceil(sideTotal / 2)
  const southCount = Math.floor(sideTotal / 2)
  const indexPicker = spread === 'corners' ? cornerIndices : centeredIndices
  const selected = [
    ...indexPicker(north.length, northCount).map((index) => north[index]),
    ...indexPicker(south.length, southCount).map((index) => south[index]),
  ].filter((seat): seat is SeatPosition => Boolean(seat))
  if (useHeads) selected.push(...heads.slice(0, 2))
  if (attendeeCount === 1 && heads[0]) return [heads[0]]
  return selected.slice(0, attendeeCount)
}

export function inferSeatingSpread(
  assignments: SeatAssignment[],
  seats: SeatPosition[],
  attendeeCount: number
): SeatingSpread | 'custom' {
  const assigned = new Set(assignments.map((assignment) => assignment.seatId))
  for (const spread of ['centered', 'corners', 'heads'] as const) {
    const expected = seatsForSpread(seats, attendeeCount, spread)
    if (expected.length === assigned.size && expected.every((seat) => assigned.has(seat.id))) return spread
  }
  return 'custom'
}

function pairKey(first: string, second: string): string {
  return first < second ? `${first}:${second}` : `${second}:${first}`
}

function jaccard(first: string[] | undefined, second: string[] | undefined, ignored: string[] = []): number {
  const ignoredSet = new Set(ignored)
  const a = new Set((first ?? []).filter((value) => !ignoredSet.has(value)))
  const b = new Set((second ?? []).filter((value) => !ignoredSet.has(value)))
  if (!a.size || !b.size) return 0
  const intersection = Array.from(a).filter((value) => b.has(value)).length
  return intersection / new Set([...Array.from(a), ...Array.from(b)]).size
}

export function tasteAffinity(first: SeatingAttendee, second: SeatingAttendee): number {
  const protein = jaccard(first.proteinPreferences, second.proteinPreferences, ['no_preference'])
  const flavor = jaccard(first.flavorPreference, second.flavorPreference)
  const adventurous = 1 - Math.min(100, Math.abs(first.adventurousness - second.adventurousness)) / 100
  return protein * 0.45 + flavor * 0.35 + adventurous * 0.2
}

export function dietaryServiceAffinity(first: SeatingAttendee, second: SeatingAttendee): number {
  return jaccard(
    [...first.dietary, ...first.avoid],
    [...second.dietary, ...second.avoid]
  )
}

function adjacent(first: SeatPosition, second: SeatPosition): boolean {
  if (first.side === 'head' || second.side === 'head') {
    return Math.abs(first.x - second.x) === 1
  }
  if (first.side === second.side) return Math.abs(first.index - second.index) === 1
  return first.x === second.x
}

function proximity(first: SeatPosition, second: SeatPosition): number {
  if (adjacent(first, second)) return 1
  const distance = Math.abs(first.x - second.x) + Math.abs(first.y - second.y)
  return distance <= 3 ? 0.4 : 0
}

function compareScore(first: LayoutScore, second: LayoutScore): number {
  for (let index = 0; index < first.length; index += 1) {
    const difference = first[index] - second[index]
    if (Math.abs(difference) > 0.000001) return difference > 0 ? 1 : -1
  }
  return 0
}

export function scoreSeatingLayout(
  assignments: SeatAssignment[],
  seats: SeatPosition[],
  attendees: SeatingAttendee[],
  signals: SeatingSignal[]
): LayoutScore {
  const seatById = new Map(seats.map((seat) => [seat.id, seat]))
  const attendeeById = new Map(attendees.map((attendee) => [attendee.userId, attendee]))
  const signalByPair = new Map(signals.map((signal) => [pairKey(signal.firstUserId, signal.secondUserId), signal]))
  let accepted = 0
  let pending = 0
  let sharedPast = 0
  let taste = 0
  let dietary = 0
  for (let firstIndex = 0; firstIndex < assignments.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < assignments.length; secondIndex += 1) {
      const first = assignments[firstIndex]
      const second = assignments[secondIndex]
      const firstSeat = seatById.get(first.seatId)
      const secondSeat = seatById.get(second.seatId)
      const firstAttendee = attendeeById.get(first.userId)
      const secondAttendee = attendeeById.get(second.userId)
      if (!firstSeat || !secondSeat || !firstAttendee || !secondAttendee) continue
      const near = proximity(firstSeat, secondSeat)
      if (near <= 0) continue
      const signal = signalByPair.get(pairKey(first.userId, second.userId))
      if (signal?.connectionStatus === 'accepted' && adjacent(firstSeat, secondSeat)) accepted += 1
      if (signal?.connectionStatus === 'pending') pending += near
      sharedPast += Math.min(3, signal?.sharedPastCount ?? 0) * near
      taste += tasteAffinity(firstAttendee, secondAttendee) * near
      dietary += dietaryServiceAffinity(firstAttendee, secondAttendee) * near
    }
  }
  return [accepted, pending, sharedPast, taste, dietary]
}

export function recommendSeating(
  attendees: SeatingAttendee[],
  signals: SeatingSignal[],
  spread: SeatingSpread = 'centered'
): { seats: SeatPosition[]; assignments: SeatAssignment[] } {
  const seats = createSeatPositions(attendees.length)
  if (!seats.length) return { seats, assignments: [] }
  const availableSeats = seatsForSpread(seats, attendees.length, spread)
  const acceptedDegree = new Map<string, number>()
  for (const signal of signals) {
    if (signal.connectionStatus !== 'accepted') continue
    acceptedDegree.set(signal.firstUserId, (acceptedDegree.get(signal.firstUserId) ?? 0) + 1)
    acceptedDegree.set(signal.secondUserId, (acceptedDegree.get(signal.secondUserId) ?? 0) + 1)
  }
  const orderedAttendees = [...attendees].sort((first, second) =>
    (acceptedDegree.get(second.userId) ?? 0) - (acceptedDegree.get(first.userId) ?? 0)
      || first.name.localeCompare(second.name)
      || first.userId.localeCompare(second.userId)
  )
  const orderedSeats = [...availableSeats].sort((first, second) => {
    const firstDegree = availableSeats.filter((seat) => seat.id !== first.id && adjacent(first, seat)).length
    const secondDegree = availableSeats.filter((seat) => seat.id !== second.id && adjacent(second, seat)).length
    return secondDegree - firstDegree || first.id.localeCompare(second.id)
  })
  let assignments = orderedAttendees.map((attendee, index) => ({
    userId: attendee.userId,
    seatId: orderedSeats[index].id,
  }))
  let score = scoreSeatingLayout(assignments, seats, attendees, signals)
  let improved = true
  let passes = 0
  while (improved && passes < attendees.length * 3) {
    improved = false
    passes += 1
    for (let first = 0; first < assignments.length; first += 1) {
      for (let second = first + 1; second < assignments.length; second += 1) {
        const candidate = assignments.map((assignment) => ({ ...assignment }))
        const seatId = candidate[first].seatId
        candidate[first].seatId = candidate[second].seatId
        candidate[second].seatId = seatId
        const candidateScore = scoreSeatingLayout(candidate, seats, attendees, signals)
        if (compareScore(candidateScore, score) > 0) {
          assignments = candidate
          score = candidateScore
          improved = true
        }
      }
    }
  }
  return { seats, assignments }
}

export function seatingRecommendationExplanation(
  assignments: SeatAssignment[],
  seats: SeatPosition[],
  attendees: SeatingAttendee[],
  signals: SeatingSignal[]
): string {
  const score = scoreSeatingLayout(assignments, seats, attendees, signals)
  const reasons: string[] = []
  if (score[0] > 0) reasons.push('keeps accepted connections beside one another')
  if (score[1] > 0) reasons.push('gently considers emerging connections')
  if (score[2] > 0) reasons.push('keeps familiar tablemates nearby')
  if (score[3] > 0.25) reasons.push('uses shared food preferences to settle the remaining seats')
  if (!reasons.length) return 'This recommendation spreads the table evenly and leaves every position open for you to adjust.'
  const finalReason = reasons.pop()
  return `This recommendation ${reasons.length ? `${reasons.join(', ')}, and ` : ''}${finalReason}.`
}

export function swapSeatAssignments(
  assignments: SeatAssignment[],
  sourceSeatId: string,
  destinationSeatId: string
): SeatAssignment[] {
  if (sourceSeatId === destinationSeatId) return assignments
  const source = assignments.find((assignment) => assignment.seatId === sourceSeatId)
  const destination = assignments.find((assignment) => assignment.seatId === destinationSeatId)
  if (!source) return assignments
  if (!destination) {
    return assignments.map((assignment) =>
      assignment.seatId === sourceSeatId ? { ...assignment, seatId: destinationSeatId } : assignment
    )
  }
  return assignments.map((assignment) => {
    if (assignment.seatId === sourceSeatId) return { ...assignment, seatId: destinationSeatId }
    if (assignment.seatId === destinationSeatId) return { ...assignment, seatId: sourceSeatId }
    return assignment
  })
}
