import type { SupabaseClient } from '@supabase/supabase-js'

export type EventUpdateNoticeKind = 'date' | 'time' | 'location' | 'photos'

export type PendingEventUpdateNotice = {
  kinds: EventUpdateNoticeKind[]
  changedAt: string
}

function noticeKinds(value: unknown): EventUpdateNoticeKind[] {
  if (!Array.isArray(value)) return []
  return value.filter((kind): kind is EventUpdateNoticeKind =>
    kind === 'date' || kind === 'time' || kind === 'location' || kind === 'photos'
  )
}

export async function recordEventUpdateNotice(
  supabase: SupabaseClient,
  eventId: string,
  actorId: string,
  kind: EventUpdateNoticeKind
): Promise<{ ok: boolean; error: string | null }> {
  if (typeof supabase.rpc !== 'function') return { ok: false, error: 'Update notices are unavailable' }
  const { data, error } = await supabase.rpc('record_event_update_notice', {
    p_event_id: eventId,
    p_actor_id: actorId,
    p_kind: kind,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: data === true, error: data === true ? null : 'Update notice was not recorded' }
}

export async function getPendingEventUpdateNotice(
  supabase: SupabaseClient,
  eventId: string,
  managerId: string
): Promise<{ notice: PendingEventUpdateNotice | null; error: string | null }> {
  if (typeof supabase.rpc !== 'function') return { notice: null, error: null }
  const { data, error } = await supabase.rpc('get_pending_event_update_notice', {
    p_event_id: eventId,
    p_manager_id: managerId,
  })
  if (error) return { notice: null, error: error.message }
  const row = Array.isArray(data) ? data[0] : null
  if (!row || typeof row !== 'object') return { notice: null, error: null }
  const kinds = noticeKinds((row as Record<string, unknown>).notice_kinds)
  const changedAt = (row as Record<string, unknown>).changed_at
  return kinds.length > 0 && typeof changedAt === 'string'
    ? { notice: { kinds, changedAt }, error: null }
    : { notice: null, error: null }
}

export async function dismissEventUpdateNotice(
  supabase: SupabaseClient,
  eventId: string,
  managerId: string
): Promise<{ ok: boolean; error: string | null }> {
  if (typeof supabase.rpc !== 'function') return { ok: false, error: 'Update notices are unavailable' }
  const { data, error } = await supabase.rpc('dismiss_event_update_notice', {
    p_event_id: eventId,
    p_manager_id: managerId,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: data === true, error: data === true ? null : 'Update notice was not dismissed' }
}
