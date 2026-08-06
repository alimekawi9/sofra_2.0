import { createClient } from '@supabase/supabase-js'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

type RsvpRow = {
  user_id: string
  status: string
  users: { name: string } | null
}

type ProfileRow = {
  user_id: string
  dietary: string[]
  avoid: string[]
  protein_anchor: string | null
  flavor_preference: string[]
  adventurousness: number
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function parseEnv(text: string): Record<string, string> {
  return Object.fromEntries(
    text.split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const separator = line.indexOf('=')
        return [line.slice(0, separator), line.slice(separator + 1)]
      })
  )
}

async function main() {
  const env = parseEnv(await readFile(resolve(root, '.env.local'), 'utf8'))
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Missing Supabase URL or read credential')

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id, title')
    .ilike('title', '%Demo%')
    .maybeSingle()
  if (eventError) throw new Error(`Demo event query failed: ${eventError.message}`)
  if (!event) throw new Error('Demo event not found')

  const { data: rawRsvps, error: rsvpError } = await supabase
    .from('rsvps')
    .select('user_id, status, users(name)')
    .eq('event_id', event.id)
    .in('status', ['going', 'maybe'])
  if (rsvpError) throw new Error(`RSVP query failed: ${rsvpError.message}`)
  const rsvps = (rawRsvps ?? []) as unknown as RsvpRow[]

  let { data: rawProfiles, error: profileError } = await supabase
    .from('taste_profiles')
    .select('user_id, dietary, avoid, protein_anchor, flavor_preference, adventurousness')
    .in('user_id', rsvps.map((rsvp) => rsvp.user_id))
  const preferenceColumnsPresent = !profileError
  let schemaError: string | null = null
  if (profileError) {
    schemaError = profileError.message
    const legacyResult = await supabase
      .from('taste_profiles')
      .select('user_id, dietary, avoid, adventurousness')
      .in('user_id', rsvps.map((rsvp) => rsvp.user_id))
    if (legacyResult.error) {
      throw new Error(`Legacy taste profile query failed: ${legacyResult.error.message}`)
    }
    rawProfiles = legacyResult.data as typeof rawProfiles
  }
  const profiles = ((rawProfiles ?? []) as unknown as ProfileRow[]).map((profile) => ({
    ...profile,
    protein_anchor: preferenceColumnsPresent ? profile.protein_anchor : null,
    flavor_preference: preferenceColumnsPresent ? profile.flavor_preference : [],
  }))

  const guests = rsvps.map((rsvp) => {
    const profile = profiles.find((candidate) => candidate.user_id === rsvp.user_id)
    return {
      name: rsvp.users?.name ?? 'Unknown',
      status: rsvp.status,
      profile_row_present: Boolean(profile),
      dietary: profile?.dietary ?? null,
      protein_anchor: profile?.protein_anchor ?? null,
      flavor_preference: profile?.flavor_preference ?? null,
      adventurousness: profile?.adventurousness ?? null,
      hard_limits: profile
        ? { dietary: profile.dietary, avoid: profile.avoid }
        : null,
    }
  })

  console.log(JSON.stringify({
    read_only: true,
    supabase_project_host: new URL(url).host,
    schema: {
      preference_columns_present: preferenceColumnsPresent,
      diagnostic_error: schemaError,
    },
    event: { title: event.title, guest_count: guests.length },
    guests,
    coverage: {
      profile_rows: guests.filter((guest) => guest.profile_row_present).length,
      dietary_nonempty: guests.filter((guest) => (guest.dietary?.length ?? 0) > 0).length,
      protein_nonnull: guests.filter((guest) => Boolean(guest.protein_anchor)).length,
      flavor_nonempty: guests.filter((guest) => (guest.flavor_preference?.length ?? 0) > 0).length,
      adventurousness_nonnull: guests.filter((guest) => guest.adventurousness !== null).length,
      hard_limits_nonempty: guests.filter((guest) =>
        ((guest.hard_limits?.dietary.length ?? 0) + (guest.hard_limits?.avoid.length ?? 0)) > 0
      ).length,
    },
  }, null, 2))
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
