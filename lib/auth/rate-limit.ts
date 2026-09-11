import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

export async function consumeRateLimit(
  supabase: SupabaseClient,
  action: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('consume_api_rate_limit', {
    p_action: action,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  })
  // Fail closed: a missing/broken limiter must not silently expose paid APIs.
  return !error && data === true
}
