import type { SupabaseClient } from '@supabase/supabase-js'

export type EventAccessRequestStatus = 'pending' | 'accepted' | 'rejected'

export type PendingEventAccessRequest = {
  id: string
  userId: string
  name: string
  photoUrl: string | null
  createdAt: string
}

export async function getEventAccessRequestStatus(
  supabase: SupabaseClient,
  eventId: string,
  userId: string
): Promise<{ status: EventAccessRequestStatus | null; error: string | null }> {
  const { data, error } = await supabase.rpc('get_event_access_request_status', {
    p_event_id: eventId,
    p_user_id: userId,
  })
  if (error) return { status: null, error: error.message }
  return data === 'pending' || data === 'accepted' || data === 'rejected'
    ? { status: data, error: null }
    : { status: null, error: null }
}

export async function listPendingEventAccessRequests(
  supabase: SupabaseClient,
  eventId: string,
  reviewerId: string
): Promise<{ requests: PendingEventAccessRequest[]; error: string | null }> {
  const { data, error } = await supabase.rpc('list_pending_event_access_requests', {
    p_event_id: eventId,
    p_reviewer_id: reviewerId,
  })
  if (error) return { requests: [], error: error.message }
  return {
    requests: (data ?? []).map((row: Record<string, unknown>) => ({
      id: String(row.request_id),
      userId: String(row.user_id),
      name: String(row.requester_name || 'Guest'),
      photoUrl: typeof row.requester_photo_url === 'string' ? row.requester_photo_url : null,
      createdAt: String(row.created_at),
    })),
    error: null,
  }
}

export async function listManagedEventAccessRequestCounts(
  supabase: SupabaseClient,
  reviewerId: string
): Promise<{ counts: Map<string, number>; error: string | null }> {
  const { data, error } = await supabase.rpc('list_managed_event_access_request_counts', {
    p_reviewer_id: reviewerId,
  })
  if (error) return { counts: new Map(), error: error.message }
  const counts = new Map<string, number>()
  for (const row of data ?? []) counts.set(String(row.event_id), Math.max(0, Number(row.pending_count) || 0))
  return { counts, error: null }
}

export async function requestEventAccess(
  supabase: SupabaseClient,
  eventId: string,
  userId: string
): Promise<{ status: EventAccessRequestStatus | 'member' | null; error: string | null }> {
  const { data, error } = await supabase.rpc('request_event_access', {
    p_event_id: eventId,
    p_user_id: userId,
  })
  if (error) return { status: null, error: error.message }
  const status = typeof data === 'string' ? data : null
  if (status === 'pending' || status === 'accepted' || status === 'rejected' || status === 'member') {
    return { status, error: null }
  }
  return { status: null, error: 'Unexpected access-request response' }
}

export async function respondToEventAccessRequest(
  supabase: SupabaseClient,
  requestId: string,
  reviewerId: string,
  accept: boolean
): Promise<{ ok: boolean; error: string | null }> {
  const { data, error } = await supabase.rpc('respond_to_event_access_request', {
    p_request_id: requestId,
    p_reviewer_id: reviewerId,
    p_accept: accept,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: data === true, error: data === true ? null : 'Request is no longer pending' }
}
