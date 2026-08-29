import type { SupabaseClient } from '@supabase/supabase-js'
import type { TasteProfile } from './intel'
import { normalizeProteinPreferences } from './protein-preferences'
import { fetchEventHostIds } from './event-access'

export type SeatingAttendee = TasteProfile & {
  userId: string
  rsvpStatus: 'going' | 'maybe' | 'host'
  isHost: boolean
}

export type EventTasteAttendee = TasteProfile & {
  userId: string
  rsvpStatus: 'going' | 'maybe'
}

type RsvpRow = {
  user_id: string
  status: 'going' | 'maybe'
  users: { name: string; photo_url: string | null } | null
}

type UserRow = { id: string; name: string; photo_url: string | null }
type ProfileRow = {
  user_id: string
  dietary: string[] | null
  avoid: string[] | null
  protein_anchor: string | null
  protein_preferences: string[] | null
  flavor_preference: string[] | null
  adventurousness: number | null
}

export async function fetchEventTasteAttendees(
  supabase: SupabaseClient,
  eventId: string
): Promise<EventTasteAttendee[]> {
  const { data: rsvpData, error: rsvpError } = await supabase
    .from('rsvps')
    .select('user_id,status,users(name,photo_url)')
    .eq('event_id', eventId)
    .in('status', ['going', 'maybe'])
  if (rsvpError) throw rsvpError

  const rsvps = (rsvpData ?? []) as unknown as RsvpRow[]
  const userIds = rsvps.map((row) => row.user_id)
  const { data: profiles, error: profilesError } = userIds.length
    ? await supabase.from('taste_profiles')
        .select('user_id,dietary,avoid,protein_anchor,protein_preferences,flavor_preference,adventurousness')
        .in('user_id', userIds)
    : { data: [] as ProfileRow[], error: null }
  if (profilesError) throw profilesError
  const profileByUser = new Map(((profiles ?? []) as ProfileRow[]).map((profile) => [profile.user_id, profile]))

  return rsvps.map((row) => {
    const profile = profileByUser.get(row.user_id)
    return {
      userId: row.user_id,
      name: row.users?.name ?? 'Guest',
      photoUrl: row.users?.photo_url ?? null,
      dietary: profile?.dietary ?? [],
      avoid: profile?.avoid ?? [],
      proteinAnchor: profile?.protein_anchor ?? null,
      proteinPreferences: normalizeProteinPreferences(profile?.protein_preferences, profile?.protein_anchor),
      flavorPreference: profile?.flavor_preference ?? [],
      adventurousness: profile?.adventurousness ?? 50,
      rsvpStatus: row.status,
    }
  })
}

export async function fetchEventAttendees(
  supabase: SupabaseClient,
  eventId: string,
  hostId: string,
  managerId: string
): Promise<SeatingAttendee[]> {
  const hostIds = await fetchEventHostIds(supabase, eventId, hostId)
  const [rsvpAttendees, { data: participationData, error: participationError }] = await Promise.all([
    fetchEventTasteAttendees(supabase, eventId),
    supabase.rpc('list_event_seating_participation', { p_event_id: eventId, p_manager_id: managerId }),
  ])
  if (participationError) throw participationError

  const participation = new Map(
    ((participationData ?? []) as Array<{ user_id: string; participating: boolean }>).map((row) => [String(row.user_id), Boolean(row.participating)])
  )
  const byUser = new Map(rsvpAttendees.map((attendee) => [attendee.userId, attendee]))
  const missingHostIds = Array.from(hostIds).filter((id) => !byUser.has(id))
  if (missingHostIds.length) {
    const { data: hostUsers, error: hostUsersError } = await supabase
      .from('users').select('id,name,photo_url').in('id', missingHostIds)
    if (hostUsersError) throw hostUsersError
    for (const user of (hostUsers ?? []) as UserRow[]) {
      byUser.set(user.id, {
        userId: user.id,
        name: user.name,
        photoUrl: user.photo_url,
        dietary: [],
        avoid: [],
        proteinAnchor: null,
        proteinPreferences: [],
        flavorPreference: [],
        adventurousness: 50,
        rsvpStatus: 'going',
      })
    }
  }

  const includedRows = Array.from(byUser.values()).filter((row) =>
    !hostIds.has(row.userId) || participation.get(row.userId) !== false
  )
  const missingProfileIds = includedRows
    .filter((row) => hostIds.has(row.userId) && !rsvpAttendees.some((attendee) => attendee.userId === row.userId))
    .map((row) => row.userId)
  const { data: profiles, error: profilesError } = missingProfileIds.length
    ? await supabase.from('taste_profiles')
        .select('user_id,dietary,avoid,protein_anchor,protein_preferences,flavor_preference,adventurousness')
        .in('user_id', missingProfileIds)
    : { data: [] as ProfileRow[], error: null }
  if (profilesError) throw profilesError
  const profileByUser = new Map(((profiles ?? []) as ProfileRow[]).map((profile) => [profile.user_id, profile]))

  return includedRows.map((row) => {
    const profile = profileByUser.get(row.userId)
    const wasRsvpAttendee = rsvpAttendees.some((attendee) => attendee.userId === row.userId)
    return {
      ...row,
      dietary: wasRsvpAttendee ? row.dietary : profile?.dietary ?? [],
      avoid: wasRsvpAttendee ? row.avoid : profile?.avoid ?? [],
      proteinAnchor: wasRsvpAttendee ? row.proteinAnchor : profile?.protein_anchor ?? null,
      proteinPreferences: wasRsvpAttendee
        ? row.proteinPreferences
        : normalizeProteinPreferences(profile?.protein_preferences, profile?.protein_anchor),
      flavorPreference: wasRsvpAttendee ? row.flavorPreference : profile?.flavor_preference ?? [],
      adventurousness: wasRsvpAttendee ? row.adventurousness : profile?.adventurousness ?? 50,
      rsvpStatus: wasRsvpAttendee ? row.rsvpStatus : 'host',
      isHost: hostIds.has(row.userId),
    }
  })
}
