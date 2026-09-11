import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

export type AuthenticatedAppUser = {
  authUserId: string
  appUserId: string
}

/** Resolve the signed-in Supabase identity to Sofra's legacy profile id. */
export async function requireAppUser(
  supabase: SupabaseClient,
): Promise<AuthenticatedAppUser | null> {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null

  const { data: profile } = await supabase
    .from('users')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!profile) return null
  return { authUserId: user.id, appUserId: profile.id }
}

export async function getOptionalAppUser(
  supabase: SupabaseClient,
): Promise<AuthenticatedAppUser | null> {
  return requireAppUser(supabase)
}
