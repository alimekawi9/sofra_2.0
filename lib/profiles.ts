import type { SupabaseClient } from '@supabase/supabase-js'
import { formatEventDate } from './event-date'

export type ProfileHistoryRow = {
  id: string
  status: string
  events: {
    id: string
    title: string
    event_date: string
    venue: string | null
  } | null
}

export type ProfileHistoryEntry = {
  id: string
  title: string
  date: string
  went: 'Going' | 'Went'
}

type EventMembershipRow = { event_id: string }
type HostedEventRow = { id: string }
type HistoryEventRow = { id: string; title: string; event_date: string; venue: string | null }

async function fetchUserEventIds(supabase: SupabaseClient, userId: string): Promise<string[]> {
  const [rsvps, hosted, cohosted] = await Promise.all([
    supabase.from('rsvps').select('event_id').eq('user_id', userId).in('status', ['going', 'maybe']),
    supabase.from('events').select('id').eq('host_id', userId),
    supabase.from('event_cohosts').select('event_id').eq('user_id', userId),
  ])

  if (rsvps.error) throw rsvps.error
  if (hosted.error) throw hosted.error
  if (cohosted.error) throw cohosted.error

  return Array.from(new Set([
    ...((rsvps.data ?? []) as EventMembershipRow[]).map((row) => row.event_id),
    ...((hosted.data ?? []) as HostedEventRow[]).map((row) => row.id),
    ...((cohosted.data ?? []) as EventMembershipRow[]).map((row) => row.event_id),
  ]))
}

function formatShort(iso: string): string {
  return formatEventDate(iso, { month: 'short', day: 'numeric' })
}

export function transformProfileHistory(rows: ProfileHistoryRow[], now = Date.now()): ProfileHistoryEntry[] {
  return rows
    .filter((row) => row.events !== null && (row.status === 'going' || row.status === 'maybe'))
    .map((row) => {
      const event = row.events!
      return {
        id: event.id,
        title: event.title,
        date: `${formatShort(event.event_date)}${event.venue ? ` at ${event.venue}` : ''}`,
        went: new Date(event.event_date).getTime() < now ? 'Went' as const : 'Going' as const,
      }
    })
    .sort((a, b) => (a.went === b.went ? 0 : a.went === 'Going' ? -1 : 1))
}

export async function fetchProfileHistory(supabase: SupabaseClient, userId: string): Promise<ProfileHistoryEntry[]> {
  const eventIds = await fetchUserEventIds(supabase, userId)
  if (eventIds.length === 0) return []

  const { data, error } = await supabase
    .from('events')
    .select('id,title,event_date,venue')
    .in('id', eventIds)
  if (error) throw error
  return transformProfileHistory(((data ?? []) as HistoryEventRow[]).map((event) => ({
    id: event.id,
    status: 'going',
    events: event,
  })))
}
