import type { SupabaseClient } from '@supabase/supabase-js'

export type EventTimelineItem = {
  id: string
  title: string
  time: string
  position: number
}

const EVENT_TIME_PATTERN = /T(\d{2}):(\d{2})/
const CLOCK_PATTERN = /^(\d{2}):(\d{2})$/

export function eventStartClock(eventDate: string): string {
  const match = eventDate.match(EVENT_TIME_PATTERN)
  return match ? `${match[1]}:${match[2]}` : '18:00'
}

export function addClockMinutes(clock: string, minutes: number): string {
  const match = clock.match(CLOCK_PATTERN)
  if (!match) return clock
  const total = (Number(match[1]) * 60 + Number(match[2]) + minutes + 1440) % 1440
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export function defaultEventTimeline(eventDate: string): EventTimelineItem[] {
  const start = eventStartClock(eventDate)
  return [
    { id: 'default-drinks', title: 'Drinks & guests arrive', time: start, position: 0 },
    { id: 'default-starters', title: 'Starters', time: addClockMinutes(start, 30), position: 1 },
    { id: 'default-mains', title: 'Mains + sides', time: addClockMinutes(start, 75), position: 2 },
    { id: 'default-dessert', title: 'Dessert', time: addClockMinutes(start, 120), position: 3 },
  ]
}

export function sortEventTimeline(items: EventTimelineItem[]): EventTimelineItem[] {
  return [...items].sort((a, b) => a.time.localeCompare(b.time) || a.position - b.position || a.id.localeCompare(b.id))
    .map((item, position) => ({ ...item, position }))
}

export function formatTimelineClock(clock: string): string {
  const match = clock.match(CLOCK_PATTERN)
  if (!match) return clock
  const hour = Number(match[1])
  const minute = match[2]
  return `${hour % 12 || 12}:${minute} ${hour < 12 ? 'AM' : 'PM'}`
}

export async function fetchEventTimeline(supabase: SupabaseClient, eventId: string, managerId: string) {
  const { data, error } = await supabase.rpc('get_event_timeline', { p_event_id: eventId, p_manager_id: managerId })
  if (error) return { items: [] as EventTimelineItem[], error: error.message }
  if (!Array.isArray(data)) return { items: [] as EventTimelineItem[], error: data === null ? 'Not authorized' : null }
  const items = data.flatMap((row: unknown, index: number) => {
    if (!row || typeof row !== 'object') return []
    const candidate = row as Record<string, unknown>
    if (typeof candidate.id !== 'string' || typeof candidate.title !== 'string' || typeof candidate.time !== 'string') return []
    return [{ id: candidate.id, title: candidate.title, time: candidate.time.slice(0, 5), position: typeof candidate.position === 'number' ? candidate.position : index }]
  })
  return { items: sortEventTimeline(items), error: null }
}

export async function saveEventTimeline(supabase: SupabaseClient, eventId: string, managerId: string, items: EventTimelineItem[]) {
  const normalized = sortEventTimeline(items).map(({ title, time }) => ({ title: title.trim(), time }))
  const { data, error } = await supabase.rpc('save_event_timeline', {
    p_event_id: eventId,
    p_manager_id: managerId,
    p_items: normalized,
  })
  return { ok: !error && data === true, error: error?.message ?? null }
}
