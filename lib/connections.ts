import type { SupabaseClient } from '@supabase/supabase-js'

export type ConnectionStatus = 'not_eligible' | 'eligible' | 'pending' | 'accepted' | 'cooldown'
export type ConnectionDirection = 'none' | 'incoming' | 'outgoing'

export type ConnectionContext = {
  requestId: string | null
  status: ConnectionStatus
  direction: ConnectionDirection
  originatingEventId: string | null
  originatingEventTitle: string | null
  retryAfter: string | null
}

export type PendingConnectionRequest = {
  id: string
  requesterId: string
  requesterName: string
  requesterPhotoUrl: string | null
  originatingEventId: string
  originatingEventTitle: string | null
  createdAt: string
}

export function isConnectionSchemaUnavailable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { code?: unknown; message?: unknown }
  return candidate.code === 'PGRST202'
    || (typeof candidate.message === 'string' && candidate.message.includes('get_connection_context') && candidate.message.includes('schema cache'))
}

function connectionContextFromRow(row: Record<string, unknown> | null): ConnectionContext {
  const rawStatus = row?.connection_status
  const rawDirection = row?.direction
  return {
    requestId: typeof row?.request_id === 'string' ? row.request_id : null,
    status: rawStatus === 'eligible' || rawStatus === 'pending' || rawStatus === 'accepted' || rawStatus === 'cooldown'
      ? rawStatus
      : 'not_eligible',
    direction: rawDirection === 'incoming' || rawDirection === 'outgoing' ? rawDirection : 'none',
    originatingEventId: typeof row?.originating_event_id === 'string' ? row.originating_event_id : null,
    originatingEventTitle: typeof row?.originating_event_title === 'string' ? row.originating_event_title : null,
    retryAfter: typeof row?.retry_after === 'string' ? row.retry_after : null,
  }
}

export async function getConnectionContext(
  supabase: SupabaseClient,
  viewerId: string,
  profileUserId: string
): Promise<ConnectionContext> {
  const { data, error } = await supabase.rpc('get_connection_context', {
    p_viewer_id: viewerId,
    p_profile_user_id: profileUserId,
  })
  if (error) throw error
  return connectionContextFromRow(((data ?? [])[0] ?? null) as Record<string, unknown> | null)
}

export async function requestConnection(
  supabase: SupabaseClient,
  requesterId: string,
  recipientId: string,
  originatingEventId?: string | null
): Promise<ConnectionStatus> {
  const { data, error } = await supabase.rpc('request_connection', {
    p_requester_id: requesterId,
    p_recipient_id: recipientId,
    p_originating_event_id: originatingEventId ?? null,
  })
  if (error) throw error
  if (data === 'pending' || data === 'accepted' || data === 'cooldown' || data === 'not_eligible') return data
  return 'not_eligible'
}

export async function respondToConnectionRequest(
  supabase: SupabaseClient,
  requestId: string,
  recipientId: string,
  accept: boolean
): Promise<boolean> {
  const { data, error } = await supabase.rpc('respond_to_connection_request', {
    p_request_id: requestId,
    p_recipient_id: recipientId,
    p_accept: accept,
  })
  if (error) throw error
  return data === true
}

export async function listPendingConnectionRequests(
  supabase: SupabaseClient,
  recipientId: string
): Promise<PendingConnectionRequest[]> {
  const { data, error } = await supabase.rpc('list_pending_connection_requests', {
    p_recipient_id: recipientId,
  })
  if (error) throw error
  return (data ?? []).map((raw: Record<string, unknown>) => ({
    id: String(raw.request_id),
    requesterId: String(raw.requester_id),
    requesterName: String(raw.requester_name || 'Guest'),
    requesterPhotoUrl: typeof raw.requester_photo_url === 'string' ? raw.requester_photo_url : null,
    originatingEventId: String(raw.originating_event_id),
    originatingEventTitle: typeof raw.originating_event_title === 'string' ? raw.originating_event_title : null,
    createdAt: String(raw.created_at),
  }))
}

export async function areConnected(
  supabase: SupabaseClient,
  firstUserId: string,
  secondUserId: string
): Promise<boolean> {
  if (firstUserId === secondUserId) return true
  const { data, error } = await supabase.rpc('are_connected', {
    p_first_user_id: firstUserId,
    p_second_user_id: secondUserId,
  })
  if (error) throw error
  return data === true
}
