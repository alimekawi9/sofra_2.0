'use client'

import type { SupabaseClient, User } from '@supabase/supabase-js'

export type ClientAppUser = {
  authUser: User
  appUserId: string
}

/** Resolve a verified Supabase Auth user to Sofra's stable profile id. */
export async function getClientAppUser(supabase: SupabaseClient): Promise<ClientAppUser | null> {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (profileError || !profile) return null
  return { authUser: user, appUserId: profile.id }
}

export async function getCurrentAppUserId(supabase: SupabaseClient): Promise<string | null> {
  return (await getClientAppUser(supabase))?.appUserId ?? null
}
