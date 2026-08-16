type SupabaseLike = { from: (table: string) => any }

export async function isEventManager(supabase: SupabaseLike, eventId: string, userId: string, hostId: string) {
  if (userId === hostId) return true
  const { data } = await supabase.from('event_cohosts').select('user_id').eq('event_id', eventId).eq('user_id', userId).maybeSingle()
  return Boolean(data)
}
