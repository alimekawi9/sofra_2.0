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

export async function fetchMutuals(supabase: SupabaseClient, userId: string): Promise<PublicUserSummary[]> {
  const eventIds = await fetchUserEventIds(supabase, userId)
  if (eventIds.length === 0) return []

  const [rsvps, hosts, cohosts] = await Promise.all([
    supabase.from('rsvps').select('user_id').in('event_id', eventIds).in('status', ['going', 'maybe']),
    supabase.from('events').select('host_id').in('id', eventIds),
    supabase.from('event_cohosts').select('user_id').in('event_id', eventIds),
  ])
  if (rsvps.error) throw rsvps.error
  if (hosts.error) throw hosts.error
  if (cohosts.error) throw cohosts.error

  const participantIds = Array.from(new Set([
    ...((rsvps.data ?? []) as Array<{ user_id: string }>).map((row) => row.user_id),
    ...((hosts.data ?? []) as Array<{ host_id: string }>).map((row) => row.host_id),
    ...((cohosts.data ?? []) as Array<{ user_id: string }>).map((row) => row.user_id),
  ].filter((id) => id !== userId)))
  if (participantIds.length === 0) return []

  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id,name,photo_url')
    .in('id', participantIds)
  if (usersError) throw usersError
  return ((users ?? []) as Array<{ id: string; name: string; photo_url: string | null }>).map((user) => ({
    id: user.id,
    name: user.name,
    photoUrl: user.photo_url,
  }))
}

export async function areMutuals(supabase: SupabaseClient, viewerId: string, profileUserId: string): Promise<boolean> {
  if (viewerId === profileUserId) return true
  const [viewerEventIds, profileEventIds] = await Promise.all([
    fetchUserEventIds(supabase, viewerId),
    fetchUserEventIds(supabase, profileUserId),
  ])
  const viewerEvents = new Set(viewerEventIds)
  return profileEventIds.some((eventId) => viewerEvents.has(eventId))
}
