import type { SupabaseClient } from '@supabase/supabase-js'

export async function isEventManager(supabase: SupabaseClient, eventId: string, userId: string, hostId: string) {
  if (userId === hostId) return true
  const { data } = await supabase.from('event_cohosts').select('user_id').eq('event_id', eventId).eq('user_id', userId).maybeSingle()
  return Boolean(data)
}

// The complete set of user ids who manage this event: the original host plus
// every accepted co-host. Distinct from isEventManager, which only checks one
// specific user.
export async function fetchEventHostIds(supabase: SupabaseClient, eventId: string, hostId: string): Promise<Set<string>> {
  const { data } = await supabase.from('event_cohosts').select('user_id').eq('event_id', eventId)
  const cohostIds = (data ?? []).map((row) => (row as { user_id: string }).user_id)
  return new Set([hostId, ...cohostIds])
}
