import type { SupabaseClient } from '@supabase/supabase-js'
import type { SeatAssignment, SeatingSignal } from './seating'

export type SavedSeatingLayout = {
  assignments: SeatAssignment[]
  algorithmVersion: string
  manuallyModified: boolean
  version: number
  updatedAt: string
}

export async function fetchSeatingSignals(
  supabase: SupabaseClient,
  eventId: string,
  managerId: string
): Promise<SeatingSignal[]> {
  const { data, error } = await supabase.rpc('get_event_seating_signals', {
    p_event_id: eventId,
    p_manager_id: managerId,
  })
  if (error) throw error
  return (data ?? []).map((row: Record<string, unknown>) => ({
    firstUserId: String(row.first_user_id),
    secondUserId: String(row.second_user_id),
    connectionStatus: row.connection_status === 'accepted' || row.connection_status === 'pending' || row.connection_status === 'declined'
      ? row.connection_status
      : 'none',
    sharedPastCount: Math.max(0, Number(row.shared_past_count) || 0),
  }))
}

export async function fetchSavedSeatingLayout(
  supabase: SupabaseClient,
  eventId: string,
  managerId: string
): Promise<SavedSeatingLayout | null> {
  const { data, error } = await supabase.rpc('get_event_seating_layout', {
    p_event_id: eventId,
    p_manager_id: managerId,
  })
  if (error) throw error
  const row = (data ?? [])[0] as Record<string, unknown> | undefined
  if (!row) return null
  const assignments = Array.isArray(row.assignments)
    ? row.assignments.filter((assignment): assignment is SeatAssignment =>
        Boolean(assignment) && typeof assignment === 'object'
          && typeof (assignment as SeatAssignment).seatId === 'string'
          && typeof (assignment as SeatAssignment).userId === 'string'
      )
    : []
  return {
    assignments,
    algorithmVersion: String(row.algorithm_version || ''),
    manuallyModified: Boolean(row.manually_modified),
    version: Math.max(1, Number(row.version) || 1),
    updatedAt: String(row.updated_at),
  }
}

export async function saveSeatingLayout(
  supabase: SupabaseClient,
  eventId: string,
  managerId: string,
  assignments: SeatAssignment[],
  expectedVersion: number,
  manuallyModified: boolean
): Promise<number> {
  const { data, error } = await supabase.rpc('save_event_seating_layout', {
    p_event_id: eventId,
    p_manager_id: managerId,
    p_assignments: assignments,
    p_expected_version: expectedVersion,
    p_manually_modified: manuallyModified,
  })
  if (error) throw error
  const version = Number(data)
  if (version === -2) throw new Error('The attendee list changed. Refresh the seating plan.')
  if (version === -3) throw new Error('Another host changed this layout. Refresh before saving again.')
  if (version < 1) throw new Error('You do not have permission to save this layout.')
  return version
}

export async function setHostSeatingParticipation(
  supabase: SupabaseClient,
  eventId: string,
  userId: string,
  participating: boolean
): Promise<boolean> {
  const { data, error } = await supabase.rpc('set_event_seating_participation', {
    p_event_id: eventId,
    p_user_id: userId,
    p_participating: participating,
  })
  if (error) throw error
  return data === true
}
