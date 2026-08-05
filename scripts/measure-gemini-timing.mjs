// Measures real Gemini latency/timeout behavior for "Regenerate with AI"
// against the real demo event data (not the hardcoded fixtures in
// test-gemini-menu.mjs), so the numbers reflect the actual prompt size a
// chef would see. Runs generateMenuWithAI N times sequentially and prints
// a summary table. The per-call prompt-size/elapsed-ms lines come from the
// instrumentation in lib/gemini.ts.
//
// Usage: node scripts/measure-gemini-timing.mjs [attempts]
import { register } from 'node:module'
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
for (const k of ['GEMINI_API_KEY', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
  if (env[k]) process.env[k] = env[k]
}
if (!process.env.GEMINI_API_KEY) {
  console.error('Missing GEMINI_API_KEY in .env.local')
  process.exit(1)
}

register('./ts-loader.mjs', import.meta.url)
const { generateMenuWithAI } = await import('../lib/menu-ai.ts')
const { buildIntel } = await import('../lib/intel.ts')
const { createClient } = await import('@supabase/supabase-js')

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function currentMonday() {
  const d = new Date()
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)
}

function mergeGuests(rsvps, profiles) {
  return rsvps.map(r => {
    const p = profiles.find(x => x.user_id === r.user_id)
    return {
      name: r.users?.name ?? 'Unknown',
      dietary: p?.dietary ?? [],
      avoid: p?.avoid ?? [],
      proteinAnchor: p?.protein_anchor ?? null,
      flavorPreference: p?.flavor_preference ?? [],
      adventurousness: p?.adventurousness ?? 50,
    }
  })
}

async function loadDemoEventData() {
  const { data: host, error: hostErr } = await supabase
    .from('users').select('id, name, phone').eq('phone', '+10000000001').maybeSingle()
  if (hostErr || !host) throw new Error(`demo host not found: ${hostErr?.message}`)

  const { data: event, error: eventErr } = await supabase
    .from('events').select('id, title').eq('host_id', host.id).maybeSingle()
  if (eventErr || !event) throw new Error(`demo event not found: ${eventErr?.message}`)

  const { data: rsvps } = await supabase
    .from('rsvps').select('user_id, users(name)').eq('event_id', event.id).in('status', ['going', 'maybe'])

  const userIds = (rsvps ?? []).map(r => r.user_id)
  const { data: profiles } = userIds.length
    ? await supabase.from('taste_profiles').select('*').in('user_id', userIds)
    : { data: [] }

  const guests = mergeGuests(rsvps ?? [], profiles ?? [])
  const intel = buildIntel(guests)

  const [{ data: sigs }, { data: pantry }] = await Promise.all([
    supabase.from('signatures').select('id, name, tags, contains_allergens, slot').eq('chef_id', host.id),
    supabase.from('pantry_items').select('id, name, tags, contains_allergens')
      .eq('chef_id', host.id).eq('week_of', currentMonday()),
  ])

  return { event, intel, signatures: sigs ?? [], pantry: pantry ?? [] }
}

const attempts = Number(process.argv[2] ?? 3)

const { event, intel, signatures, pantry } = await loadDemoEventData()
console.log(`=== Demo event: "${event.title}" [${event.id}] ===`)
console.log(`guests=${intel.guestCount} signatures=${signatures.length} pantry=${pantry.length}`)
console.log('')

const results = []
for (let i = 1; i <= attempts; i++) {
  console.log(`--- Attempt ${i}/${attempts} ---`)
  const wallStart = Date.now()
  const result = await generateMenuWithAI(intel, signatures, pantry)
  const wallElapsed = Date.now() - wallStart
  results.push({ attempt: i, wallElapsed, aiFailed: result.aiFailed, fallbackReason: result.fallbackReason })
  console.log(`[summary] attempt ${i}: aiFailed=${result.aiFailed} wallElapsed=${wallElapsed}ms${result.fallbackReason ? ` reason="${result.fallbackReason}"` : ''}`)
  console.log('')
}

console.log('=== Summary across all attempts ===')
for (const r of results) {
  console.log(`attempt ${r.attempt}: ${r.aiFailed ? 'FAILED' : 'OK'} in ${r.wallElapsed}ms${r.fallbackReason ? ` (${r.fallbackReason})` : ''}`)
}
