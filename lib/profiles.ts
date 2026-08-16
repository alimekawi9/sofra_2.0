import type { SupabaseClient } from '@supabase/supabase-js'

export type PublicUserSummary = {
  id: string
  name: string
  photoUrl: string | null
}

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

function formatShort(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
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
  const { data, error } = await supabase
    .from('rsvps')
    .select('id,status,events(id,title,event_date,venue)')
    .eq('user_id', userId)
  if (error) throw error
  return transformProfileHistory((data ?? []) as unknown as ProfileHistoryRow[])
}

export async function fetchMutuals(supabase: SupabaseClient, userId: string): Promise<PublicUserSummary[]> {
  const { data: attendance, error: attendanceError } = await supabase
    .from('rsvps')
    .select('event_id')
    .eq('user_id', userId)
    .in('status', ['going', 'maybe'])
  if (attendanceError) throw attendanceError

  const eventIds = Array.from(new Set((attendance ?? []).map((row) => row.event_id)))
  if (eventIds.length === 0) return []

  const { data: shared, error: sharedError } = await supabase
    .from('rsvps')
    .select('user_id,users(id,name,photo_url)')
    .in('event_id', eventIds)
    .in('status', ['going', 'maybe'])
  if (sharedError) throw sharedError

  const mutuals = new Map<string, PublicUserSummary>()
  for (const row of (shared ?? []) as unknown as Array<{
    user_id: string
    users: { id: string; name: string; photo_url: string | null } | null
  }>) {
    if (row.user_id === userId || !row.users) continue
    mutuals.set(row.user_id, {
      id: row.users.id,
      name: row.users.name,
      photoUrl: row.users.photo_url,
    })
  }
  return Array.from(mutuals.values())
}

export async function areMutuals(supabase: SupabaseClient, viewerId: string, profileUserId: string): Promise<boolean> {
  if (viewerId === profileUserId) return true
  const mutuals = await fetchMutuals(supabase, viewerId)
  return mutuals.some((user) => user.id === profileUserId)
}
