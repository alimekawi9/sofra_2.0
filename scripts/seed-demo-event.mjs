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
  { name: 'Omar', phone: '+10000000002', dietary: [], avoid: ['Pork'], protein_anchor: 'Beef', protein_preferences: ['beef_lamb'], flavor_preference: ['Rich', 'Smoky'], adventurousness: 85 },
  { name: 'Nadia', phone: '+10000000003', dietary: ['Vegetarian'], avoid: ['Nuts'], protein_anchor: 'Vegetarian', protein_preferences: ['vegetable'], flavor_preference: ['Fresh', 'Acidic'], adventurousness: 55 },
  { name: 'Sam', phone: '+10000000004', dietary: [], avoid: ['Nuts'], protein_anchor: 'Chicken', protein_preferences: ['chicken'], flavor_preference: ['Crispy'], adventurousness: 40 },
  { name: 'Yara', phone: '+10000000005', dietary: [], avoid: ['Shellfish'], protein_anchor: 'Fish', protein_preferences: ['fish'], flavor_preference: ['Fresh', 'Acidic'], adventurousness: 75 },
  { name: 'Tarek', phone: '+10000000006', dietary: ['No pork/alcohol'], avoid: [], protein_anchor: 'Lamb', protein_preferences: ['beef_lamb'], flavor_preference: ['Spicy', 'Grilled'], adventurousness: 90 },
  { name: 'Mona', phone: '+10000000007', dietary: ['Vegetarian'], avoid: ['Mushrooms'], protein_anchor: 'Vegetarian', protein_preferences: ['vegetable'], flavor_preference: ['Creamy'], adventurousness: 35 },
  { name: 'Dana', phone: '+10000000008', dietary: [], avoid: ['Nuts'], protein_anchor: 'Chicken', protein_preferences: ['chicken'], flavor_preference: ['Rich'], adventurousness: 60 },
  { name: 'Priya', phone: '+10000000009', dietary: ['Vegetarian'], avoid: [], protein_anchor: 'No preference', protein_preferences: ['no_preference'], flavor_preference: ['Spicy', 'Umami'], adventurousness: 65 },
]

const DEMO_QUESTIONNAIRE = {
  header: "A FEW THINGS BEFORE WE SET THE TABLE",
  questions: [
    { id: 'demo_date_rank', kind: 'custom', type: 'ranking', title: 'Which date works best?', helperText: 'Rank from most preferred to least preferred.', options: [
      { value: 'wednesday', label: 'Wednesday, September 9th' }, { value: 'thursday', label: 'Thursday, September 10th' }, { value: 'friday', label: 'Friday, September 11th' },
    ], order: 0 },
    { id: 'demo_table_mood', kind: 'custom', type: 'single', title: 'What kind of table are you hoping for?', options: [
      { value: 'lively', label: 'Lively and loud' }, { value: 'intimate', label: 'Intimate and slow' }, { value: 'surprising', label: 'A little unexpected' },
    ], order: 1 },
    { id: 'demo_flavor_direction', kind: 'custom', type: 'multiple', title: 'Which flavors should lead the evening?', helperText: 'Choose up to two.', options: [
      { value: 'bright', label: 'Bright and fresh' }, { value: 'smoky', label: 'Smoky and rich' }, { value: 'spicy', label: 'Spicy' }, { value: 'comforting', label: 'Comforting' },
    ], maxSelections: 2, order: 2 },
    { id: 'demo_note', kind: 'custom', type: 'text', title: 'Anything the host should know?', order: 3 },
  ],
}

function demoAnswers(index, name) {
  // Deliberately skew the demo answers so Table intelligence demonstrates a
  // clear signal rather than an artificial three-way tie.
  const rankings = [
    ['thursday', 'wednesday', 'friday'],
    ['thursday', 'wednesday', 'friday'],
    ['thursday', 'friday', 'wednesday'],
    ['thursday', 'wednesday', 'friday'],
    ['wednesday', 'thursday', 'friday'],
    ['thursday', 'friday', 'wednesday'],
    ['thursday', 'wednesday', 'friday'],
    ['friday', 'thursday', 'wednesday'],
    ['thursday', 'wednesday', 'friday'],
  ]
  const moods = ['intimate', 'intimate', 'intimate', 'lively', 'intimate', 'intimate', 'surprising', 'intimate', 'lively']
  const flavors = [
    ['bright', 'comforting'], ['bright', 'comforting'], ['bright', 'smoky'],
    ['bright', 'comforting'], ['smoky', 'comforting'], ['bright', 'comforting'],
    ['bright', 'spicy'], ['bright', 'comforting'], ['bright', 'smoky'],
  ]
  return {
    demo_date_rank: rankings[index % rankings.length],
    demo_table_mood: moods[index % moods.length],
    demo_flavor_direction: flavors[index % flavors.length],
    demo_note: index % 3 === 0 ? `${name} would love a relaxed seat near friends.` : '',
  }
}

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
        protein_anchor: profile.protein_anchor,
        protein_preferences: profile.protein_preferences,
        flavor_preference: profile.flavor_preference,
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

async function seedQuestionnaire(eventId, attendees) {
  const { error: questionnaireError } = await supabase.from('event_questionnaires').upsert(
    { event_id: eventId, config: DEMO_QUESTIONNAIRE, updated_at: new Date().toISOString() },
    { onConflict: 'event_id' }
  )
  if (questionnaireError) throw new Error(`upsert demo questionnaire failed: ${questionnaireError.message}`)

  const now = new Date().toISOString()
  const rows = attendees.flatMap((attendee, index) => Object.entries(demoAnswers(index, attendee.name))
    .filter(([, response]) => response !== '')
    .map(([question_id, response]) => ({ event_id: eventId, user_id: attendee.id, question_id, response, updated_at: now })))
  const { error: responseError } = await supabase.from('event_question_responses').upsert(rows, { onConflict: 'event_id,user_id,question_id' })
  if (responseError) throw new Error(`upsert demo questionnaire responses failed: ${responseError.message}`)
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

  await seedQuestionnaire(event.id, userResults)

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
