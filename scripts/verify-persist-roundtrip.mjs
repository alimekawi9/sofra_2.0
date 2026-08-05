// End-to-end: generate an AI menu, persist it to menu_courses with
// component_ids, then read back and re-derive via deriveMenu — proving that
// composed-dish exclusions survive save/reload (the silent-9/9 bug fix).
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const BASE = 'http://localhost:3000'
const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '..', '.env.local')
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8').split('\n').map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)] })
)
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const HOST_PHONE = '+10000000001'
const EVENT_ID = 'f4a87b1e-61b9-4199-9a63-22dd3196c45b'

function currentMonday() {
  const d = new Date()
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)
}

const { buildIntel } = await import('../lib/intel.ts')
const { deriveMenu, SLOT_LABELS } = await import('../lib/menu.ts')

const { data: host } = await supabase.from('users').select('id, name').eq('phone', HOST_PHONE).maybeSingle()

const [{ data: sigs }, { data: pantry }, { data: rsvps }] = await Promise.all([
  supabase.from('signatures').select('id, name, tags, contains_allergens, slot').eq('chef_id', host.id),
  supabase.from('pantry_items').select('id, name, tags, contains_allergens').eq('chef_id', host.id).eq('week_of', currentMonday()),
  supabase.from('rsvps').select('user_id, users(name)').eq('event_id', EVENT_ID).in('status', ['going','maybe']),
])
const uids = rsvps.map(r => r.user_id)
const { data: profiles } = await supabase.from('taste_profiles').select('*').in('user_id', uids)
const guests = rsvps.map(r => {
  const p = profiles.find(x => x.user_id === r.user_id)
  return {
    name: r.users?.name ?? '?', dietary: p?.dietary ?? [], avoid: p?.avoid ?? [],
    drinks: p?.drinks ?? [], adventurousness: p?.adventurousness ?? 50,
  }
})
const intel = buildIntel(guests)

console.log('Generating AI menu…')
const res = await fetch(`${BASE}/api/menu/generate-ai`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ intel, signatures: sigs, pantry }),
})
const result = await res.json()
if (result.aiFailed) console.log(`(AI fell back to rule-based: ${result.fallbackReason ?? ''})`)

// Reset any stale persisted menu, then create a fresh one from the AI output.
const { data: oldMenu } = await supabase.from('menus').select('id').eq('event_id', EVENT_ID).maybeSingle()
if (oldMenu) await supabase.from('menus').delete().eq('id', oldMenu.id)
const { data: newMenu } = await supabase.from('menus').insert({ event_id: EVENT_ID }).select('id').single()

const inserts = result.courses.map((c, i) => ({
  menu_id: newMenu.id,
  slot: c.slot,
  dish_name: c.dishName,
  dish_origin: c.origin,
  source: c.sourceId,
  component_ids: c.componentIds ?? null,
  locked: false,
  sort_order: i,
}))
const { error: insErr } = await supabase.from('menu_courses').insert(inserts)
if (insErr) { console.error('insert failed', insErr); process.exit(1) }
console.log('✓ persisted 5 courses to DB\n')

// Now read back exactly like the menu page would.
const { data: readback } = await supabase
  .from('menu_courses')
  .select('slot, dish_name, dish_origin, source, component_ids, sort_order, locked')
  .eq('menu_id', newMenu.id)
  .order('sort_order', { ascending: true })

console.log('=== ROUND-TRIP: deriveMenu against persisted rows ===')
const derived = deriveMenu(readback, sigs, pantry, intel)

let bug = 0
for (let i = 0; i < derived.length; i++) {
  const d = derived[i]
  const g = result.courses[i]
  const genEx = g.excludes.map(e => e.guest).sort().join(',')
  const derEx = d.excludes.map(e => e.guest).sort().join(',')
  const match = genEx === derEx
  const status = match ? '✓' : '✗'
  console.log(`  ${status} ${SLOT_LABELS[d.slot].padEnd(14)} ${(d.dishName || '(empty)').padEnd(52)} [${d.origin}]`)
  console.log(`      gen excludes: [${genEx || 'none'}]`)
  console.log(`      derived     : [${derEx || 'none'}]`)
  if (!match) bug += 1
  if (d.substitutions?.length) {
    for (const s of d.substitutions) console.log(`      → ${s.guests.join(', ')} get instead: ${s.dishName}`)
  }
}

console.log(`\n${bug === 0 ? '✓ SUCCESS' : '✗ MISMATCH'} — deriveMenu excludes ${bug === 0 ? 'match' : 'DO NOT match'} generation-time excludes for all courses`)
