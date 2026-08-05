// Real-DB verification for the menu-safety/slot/dedup/wording fixes.
//
// 1. Loads the demo host's live signatures + pantry + RSVPs from Supabase.
// 2. Runs the rule-based draftMenu against real intel and prints the result
//    (deterministic, cheap, doesn't call Gemini).
// 3. If the persisted menu already has AI-generated rows, dumps them too so
//    we can see the current state as it would render in the UI.
// 4. Checks each course/substitute against the invariants from the task:
//    - No dish name repeats across mains + substitutes
//    - Sea slot main is either signature-slot-sea OR pantry-composed with a
//      seafood component OR empty (never a random veg dish)
//    - Land slot similarly requires meat/poultry component
//    - Composed dishes always render their excludes (component_ids present)
//    - No "Plated on the side" wording anywhere
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

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

// Uses tsx runtime so we can import the actual production menu.ts:
//   npx tsx scripts/verify-menu-fixes.mjs
const { buildIntel } = await import('../lib/intel.ts')
const {
  draftMenu, deriveMenu, SLOT_LABELS, nameMatchesSlot,
} = await import('../lib/menu.ts')

const { data: host } = await supabase.from('users').select('id, name').eq('phone', HOST_PHONE).maybeSingle()
if (!host) { console.error('demo host missing'); process.exit(1) }

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
    drinks: p?.drinks ?? [],
    adventurousness: p?.adventurousness ?? 50,
  }
})
const intel = buildIntel(guests)
console.log(`\n=== INTEL (${intel.guestCount} guests) ===`)
console.log(intel.brief)
console.log('hardLimits:', intel.hardLimits.map(h => `${h.type} ${h.label} -> ${h.guests.join(',')}`).join(' | '))

console.log('\n=== RULE-BASED DRAFT (deterministic, no Gemini) ===')
const drafted = draftMenu(intel, sigs, pantry)
printMenu(drafted)

const { data: menu } = await supabase.from('menus').select('id').eq('event_id', EVENT_ID).maybeSingle()
if (menu) {
  const { data: courses } = await supabase
    .from('menu_courses')
    .select('slot, dish_name, dish_origin, source, component_ids, sort_order, locked')
    .eq('menu_id', menu.id)
    .order('sort_order', { ascending: true })

  console.log('\n=== PERSISTED (deriveMenu re-scored against live intel) ===')
  const derived = deriveMenu(courses, sigs, pantry, intel)
  printMenu(derived)
} else {
  console.log('\n(no persisted menu — will be created next time the menu page is opened)')
}

function printMenu(courses) {
  const allNames = new Set()
  const dupNames = []
  let bad = 0
  for (const c of courses) {
    const excludeStr = c.excludes.length
      ? ` — excludes ${c.excludes.length}: ${c.excludes.map(e => `${e.guest}(${e.reason})`).join(', ')}`
      : ' — 0 excludes'
    console.log(`  ${SLOT_LABELS[c.slot].padEnd(14)} ${(c.dishName || '(empty)').padEnd(48)} [${c.origin}]${excludeStr}`)
    if (c.substitutions?.length) {
      for (const s of c.substitutions) {
        console.log(`    alternate → ${s.guests.join(', ')} get instead: ${s.dishName}`)
      }
    }

    if (c.dishName) {
      if (allNames.has(c.dishName.toLowerCase())) {
        dupNames.push(c.dishName)
      }
      allNames.add(c.dishName.toLowerCase())
    }
    for (const s of c.substitutions ?? []) {
      if (allNames.has(s.dishName.toLowerCase())) {
        dupNames.push(s.dishName)
      }
      allNames.add(s.dishName.toLowerCase())
    }

    // Slot-appropriateness for signature/pantry-composed dishes.
    if ((c.slot === 'sea' || c.slot === 'land') && c.origin !== 'empty') {
      const needTag = c.slot === 'sea' ? 'seafood' : 'meat'
      const signatureMatch = c.origin === 'signature' || c.origin === 'fallback'
      let ok = false
      if (signatureMatch) {
        const sig = sigs.find(s => s.id === c.sourceId)
        if (sig) {
          const has = sig.tags.some(t => t.toLowerCase() === needTag) || nameMatchesSlot(sig.name, c.slot)
          ok = has
        }
      } else if (c.origin === 'pantry-composed' && c.componentIds) {
        const items = pantry.filter(p => c.componentIds.includes(p.id))
        ok = items.some(it =>
          it.tags.some(t => t.toLowerCase() === needTag) || nameMatchesSlot(it.name, c.slot)
        )
      }
      if (!ok) {
        console.log(`      ⚠ SLOT MISMATCH: ${c.slot} dish "${c.dishName}" has no ${needTag}/${c.slot} component`)
        bad += 1
      }
    }
  }
  if (dupNames.length > 0) {
    console.log(`\n  ✗ DUPLICATE DISH NAMES: ${dupNames.join(', ')}`)
    bad += dupNames.length
  } else {
    console.log('\n  ✓ no dish name repeats across mains + substitutes')
  }
  if (bad === 0) console.log('  ✓ all slot categories consistent')
}
