// One-off: dump the demo host's signatures + pantry + demo event RSVPs so we can
// simulate the exact menu drafts against real data.
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

const { data: host } = await supabase.from('users').select('id, name').eq('phone', HOST_PHONE).maybeSingle()
console.log('HOST', host)

const { data: sigs } = await supabase
  .from('signatures')
  .select('id, name, tags, contains_allergens, slot')
  .eq('chef_id', host.id)
console.log(`\nSIGNATURES (${sigs?.length ?? 0}):`)
for (const s of sigs ?? []) {
  console.log(`  ${s.name.padEnd(28)} slot=${(s.slot ?? '—').padEnd(8)} tags=[${s.tags.join(', ')}]  allergens=[${s.contains_allergens.join(', ')}]`)
}

function currentMonday() {
  const d = new Date()
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)
}

const { data: pantry } = await supabase
  .from('pantry_items')
  .select('id, name, tags, contains_allergens, week_of')
  .eq('chef_id', host.id)
  .eq('week_of', currentMonday())
console.log(`\nPANTRY (${pantry?.length ?? 0}) — week_of=${currentMonday()}:`)
for (const p of pantry ?? []) {
  console.log(`  ${p.name.padEnd(28)} tags=[${p.tags.join(', ')}]  allergens=[${p.contains_allergens.join(', ')}]`)
}

const { data: rsvps } = await supabase
  .from('rsvps')
  .select('user_id, users(name)')
  .eq('event_id', EVENT_ID)
  .in('status', ['going', 'maybe'])
console.log(`\nRSVPs (${rsvps?.length ?? 0}):`)

const userIds = rsvps.map(r => r.user_id)
const { data: profiles } = await supabase.from('taste_profiles').select('*').in('user_id', userIds)

for (const r of rsvps ?? []) {
  const p = profiles.find(x => x.user_id === r.user_id)
  console.log(`  ${r.users?.name?.padEnd(10) ?? '?'} dietary=[${p?.dietary?.join(', ') ?? ''}]  avoid=[${p?.avoid?.join(', ') ?? ''}]  adv=${p?.adventurousness ?? '—'}`)
}

const { data: menu } = await supabase.from('menus').select('id').eq('event_id', EVENT_ID).maybeSingle()
if (menu) {
  const { data: courses } = await supabase
    .from('menu_courses')
    .select('slot, dish_name, dish_origin, source, sort_order, locked')
    .eq('menu_id', menu.id)
    .order('sort_order', { ascending: true })
  console.log(`\nSTORED MENU COURSES (${courses?.length ?? 0}):`)
  for (const c of courses ?? []) {
    console.log(`  ${c.slot.padEnd(8)}  ${c.dish_name.padEnd(40)} origin=${c.dish_origin}  locked=${c.locked}  source=${c.source ?? '—'}`)
  }
}
