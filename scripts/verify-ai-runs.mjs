// Hits /api/menu/generate-ai N times against the running dev server, with
// real demo intel + signatures + pantry. Reports each generated menu and
// checks the invariants from the task ask.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const N_RUNS = Number(process.argv[2] ?? 3)
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
const { SLOT_LABELS, nameMatchesSlot } = await import('../lib/menu.ts')

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
    name: r.users?.name ?? 'Unknown',
    dietary: p?.dietary ?? [],
    avoid: p?.avoid ?? [],
    proteinAnchor: p?.protein_anchor ?? null,
    flavorPreference: p?.flavor_preference ?? [],
    adventurousness: p?.adventurousness ?? 50,
  }
})
const intel = buildIntel(guests)

let totalFailures = 0
for (let i = 1; i <= N_RUNS; i++) {
  console.log(`\n════ RUN ${i}/${N_RUNS} ════`)
  const res = await fetch(`${BASE}/api/menu/generate-ai`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ intel, signatures: sigs, pantry }),
  })
  if (!res.ok) {
    console.log(`  HTTP ${res.status}: ${await res.text()}`)
    totalFailures += 1
    continue
  }
  const result = await res.json()
  if (result.aiFailed) {
    console.log(`  aiFailed (fell back to rule-based): ${result.fallbackReason ?? ''}`)
  }
  totalFailures += check(result.courses)
}

console.log(`\n════ SUMMARY ════`)
console.log(totalFailures === 0
  ? `✓ ${N_RUNS} run(s), all invariants held.`
  : `✗ ${totalFailures} invariant failure(s) across ${N_RUNS} run(s).`
)

function check(courses) {
  const allNames = new Set()
  const dupNames = []
  let fails = 0
  for (const c of courses) {
    const excl = c.excludes.length
      ? ` — excludes ${c.excludes.length}: ${c.excludes.map(e => `${e.guest}(${e.reason})`).join(', ')}`
      : ' — 0 excludes'
    console.log(`  ${SLOT_LABELS[c.slot].padEnd(14)} ${(c.dishName || '(empty)').padEnd(52)} [${c.origin}]${excl}`)
    if (c.componentIds?.length) {
      console.log(`      componentIds: [${c.componentIds.join(', ')}]`)
    }
    if (c.reasoning) console.log(`      ✦ ${c.reasoning}`)
    for (const s of c.substitutions ?? []) {
      console.log(`      ${s.guests.join(', ')} get instead: ${s.dishName}`)
    }
    if (c.dishName) {
      if (allNames.has(c.dishName.toLowerCase())) dupNames.push(c.dishName)
      allNames.add(c.dishName.toLowerCase())
    }
    for (const s of c.substitutions ?? []) {
      if (allNames.has(s.dishName.toLowerCase())) dupNames.push(s.dishName)
      allNames.add(s.dishName.toLowerCase())
    }
    if ((c.slot === 'sea' || c.slot === 'land') && c.origin !== 'empty') {
      const needTag = c.slot === 'sea' ? 'seafood' : 'meat'
      let ok = false
      if (c.origin === 'signature' || c.origin === 'fallback') {
        const sig = sigs.find(x => x.id === c.sourceId)
        if (sig) ok = sig.tags.some(t => t.toLowerCase() === needTag) || nameMatchesSlot(sig.name, c.slot)
      } else if (c.origin === 'pantry-composed' && c.componentIds?.length) {
        const items = pantry.filter(p => c.componentIds.includes(p.id))
        ok = items.some(it => it.tags.some(t => t.toLowerCase() === needTag) || nameMatchesSlot(it.name, c.slot))
      }
      if (!ok) {
        console.log(`      ⚠ SLOT MISMATCH: ${c.slot} dish has no ${needTag}/${c.slot} component`)
        fails += 1
      }
    }
  }
  if (dupNames.length > 0) {
    console.log(`  ✗ DUPES: ${dupNames.join(', ')}`)
    fails += dupNames.length
  } else {
    console.log('  ✓ no dish name repeats')
  }
  return fails
}
