// One-time seed script: creates a demo host, a demo event, 8 demo guests
// with realistic taste profiles, and RSVPs for all 9 people. Safe to run
// more than once — every write is guarded by a check for an existing row.
//
// Usage: node scripts/seed-demo-event.mjs
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '..', '.env.local')
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
    .map(l => {
      const i = l.indexOf('=')
      return [l.slice(0, i), l.slice(i + 1)]
    })
)

const url = env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const HOST = { name: 'Demo Host', phone: '+10000000001' }

const EVENT = {
  title: "Layla's Long Table — Demo",
  tagline: 'A dinner for the ones who show up hungry.',
  venue: 'Krasi — Meze & Wine',
  address: '48 Gloucester St, Boston',
  dress_code: 'Smart casual',
  theme: 'ember',
}

// Phone suffixes 02-09, assigned in this order per the spec.
const GUESTS = [
  { name: 'Omar', phone: '+10000000002', dietary: [], avoid: ['Pork'], drinks: ['Cocktails'], adventurousness: 85 },
  { name: 'Nadia', phone: '+10000000003', dietary: ['Vegetarian'], avoid: ['Nuts'], drinks: ['Wine'], adventurousness: 55 },
  { name: 'Sam', phone: '+10000000004', dietary: [], avoid: ['Nuts'], drinks: ['Beer'], adventurousness: 40 },
  { name: 'Yara', phone: '+10000000005', dietary: [], avoid: ['Shellfish'], drinks: ['Wine'], adventurousness: 75 },
  { name: 'Tarek', phone: '+10000000006', dietary: ['No pork/alcohol'], avoid: [], drinks: ['Cocktails'], adventurousness: 90 },
  { name: 'Mona', phone: '+10000000007', dietary: ['Vegetarian'], avoid: ['Mushrooms'], drinks: ['Alcohol-free'], adventurousness: 35 },
  { name: 'Dana', phone: '+10000000008', dietary: [], avoid: ['Nuts'], drinks: ['Wine'], adventurousness: 60 },
  { name: 'Priya', phone: '+10000000009', dietary: ['Vegetarian'], avoid: [], drinks: ['Wine'], adventurousness: 65 },
]

async function ensureUser(name, phone) {
  const { data: existing, error: selErr } = await supabase
    .from('users')
    .select('id')
    .eq('phone', phone)
    .maybeSingle()
  if (selErr) throw new Error(`select users(${phone}) failed: ${selErr.message}`)
  if (existing) return { id: existing.id, created: false }

  const id = randomUUID()
  const { error: insErr } = await supabase.from('users').insert({ id, name, phone })
  if (insErr) throw new Error(`insert users(${phone}) failed: ${insErr.message}`)
  return { id, created: true }
}

async function ensureTasteProfile(userId, profile) {
  const { error } = await supabase
    .from('taste_profiles')
    .upsert(
      {
        user_id: userId,
        dietary: profile.dietary,
        avoid: profile.avoid,
        drinks: profile.drinks,
        adventurousness: profile.adventurousness,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )
  if (error) throw new Error(`upsert taste_profiles(${userId}) failed: ${error.message}`)
}

async function ensureEvent(hostId) {
  const { data: existing, error: selErr } = await supabase
    .from('events')
    .select('id')
    .eq('host_id', hostId)
    .eq('title', EVENT.title)
    .maybeSingle()
  if (selErr) throw new Error(`select events failed: ${selErr.message}`)
  if (existing) return { id: existing.id, created: false }

  const eventDate = new Date()
  eventDate.setDate(eventDate.getDate() + 7)
  eventDate.setHours(19, 0, 0, 0)

  const { data, error: insErr } = await supabase
    .from('events')
    .insert({
      host_id: hostId,
      title: EVENT.title,
      tagline: EVENT.tagline,
      event_date: eventDate.toISOString(),
      venue: EVENT.venue,
      address: EVENT.address,
      dress_code: EVENT.dress_code,
      theme: EVENT.theme,
    })
    .select('id')
    .single()
  if (insErr) throw new Error(`insert events failed: ${insErr.message}`)
  return { id: data.id, created: true }
}

async function ensureRsvp(eventId, userId) {
  const { error } = await supabase
    .from('rsvps')
    .upsert(
      { event_id: eventId, user_id: userId, status: 'going' },
      { onConflict: 'event_id,user_id' }
    )
  if (error) throw new Error(`upsert rsvps(${eventId}, ${userId}) failed: ${error.message}`)
}

async function main() {
  const host = await ensureUser(HOST.name, HOST.phone)
  console.log(`Host: ${HOST.name} (${HOST.phone}) — ${host.created ? 'created' : 'reused'} [${host.id}]`)

  const event = await ensureEvent(host.id)
  console.log(`Event: "${EVENT.title}" — ${event.created ? 'created' : 'reused'} [${event.id}]`)

  const userResults = [{ ...host, name: HOST.name, phone: HOST.phone }]
  const rsvpResults = []

  await ensureRsvp(event.id, host.id)
  rsvpResults.push({ name: HOST.name })

  for (const guest of GUESTS) {
    const user = await ensureUser(guest.name, guest.phone)
    userResults.push({ ...user, name: guest.name, phone: guest.phone })

    await ensureTasteProfile(user.id, guest)
    await ensureRsvp(event.id, user.id)
    rsvpResults.push({ name: guest.name })
  }

  const expectedUserCount = GUESTS.length + 1 // 8 guests + host
  const expectedRsvpCount = GUESTS.length + 1

  console.log('\n=== Summary ===')
  for (const u of userResults) {
    console.log(`  user  ${u.name.padEnd(10)} ${u.phone}  ${u.created ? 'created' : 'reused'}  [${u.id}]`)
  }

  const ok = userResults.length === expectedUserCount && rsvpResults.length === expectedRsvpCount
  if (!ok) {
    console.error(
      `\nFAILED: expected ${expectedUserCount} users and ${expectedRsvpCount} rsvps, got ${userResults.length} users and ${rsvpResults.length} rsvps.`
    )
    process.exit(1)
  }

  console.log(
    `\nAll ${expectedUserCount} users (host + ${GUESTS.length} guests) confirmed with users + taste_profiles + rsvps rows, and ${expectedRsvpCount} rsvps recorded — all "going".`
  )

  console.log(`\nDemo host phone: ${HOST.phone}`)
  console.log(`Event (localhost): http://localhost:3000/events/${event.id}`)
  console.log(`Event (production path — prepend your deployed domain): /events/${event.id}`)
}

main().catch(e => {
  console.error('\n=== UNCAUGHT ERROR ===')
  console.error(e)
  process.exit(1)
})
