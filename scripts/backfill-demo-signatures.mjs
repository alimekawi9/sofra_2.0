// One-off: backfill role tags on the demo host's signatures + reset the
// stale persisted menu so the next page load re-drafts and re-writes with
// component_ids populated.
//
// Why this exists: signatures added before dish-presets gained the `role`
// field lack the 'side'/'starter' tag on the DB row, so `inferSlot` used to
// route Mac and Cheese, Greek Salad, Tzatziki etc. to Main — Green. The
// preset-name fallback in inferSlot now catches this at runtime, but this
// script also normalises the stored data so tag chips in the Kitchen UI
// display the accurate role.
//
// Safe to re-run: only updates rows that are missing the correct role tag.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// Hardcoded copy of side/starter presets from lib/dish-presets.ts so this
// script doesn't need to load TypeScript. Keep in sync with that file if
// roles change — the roleByName map below is the source of truth for this
// script only. `main` role rows don't need entries here (no tag change).
const NON_MAIN_PRESETS = [
  ['Hummus', 'starter'],           ['Baba Ganoush', 'starter'],
  ['Tabbouleh', 'side'],           ['Fattoush', 'side'],
  ['Muhammara', 'starter'],
  ['Caprese Salad', 'starter'],    ['Bruschetta', 'starter'],
  ['French Onion Soup', 'starter'],
  ['Miso Soup', 'starter'],        ['Tempura', 'starter'],
  ['Gyoza', 'starter'],
  ['Guacamole', 'starter'],        ['Elote', 'side'],
  ['Ceviche', 'starter'],
  ['Samosas', 'starter'],
  ['Greek Salad', 'side'],         ['Spanakopita', 'starter'],
  ['Tzatziki', 'starter'],
  ['Mac and Cheese', 'side'],      ['Cornbread', 'side'],
]

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

const roleByName = new Map(NON_MAIN_PRESETS.map(([n, r]) => [n.toLowerCase(), r]))

const { data: host } = await supabase.from('users').select('id, name').eq('phone', HOST_PHONE).maybeSingle()
if (!host) {
  console.error(`No demo host found for phone ${HOST_PHONE}`)
  process.exit(1)
}
console.log(`HOST: ${host.name} [${host.id}]`)

const { data: sigs, error: sigErr } = await supabase
  .from('signatures')
  .select('id, name, tags')
  .eq('chef_id', host.id)
if (sigErr) { console.error(sigErr); process.exit(1) }

let updated = 0
for (const s of sigs) {
  const role = roleByName.get(s.name.toLowerCase())
  if (!role) continue
  const tagsLC = new Set(s.tags.map(t => t.toLowerCase()))
  if (tagsLC.has(role)) continue
  const nextTags = [...s.tags, role]
  const { error } = await supabase
    .from('signatures')
    .update({ tags: nextTags })
    .eq('id', s.id)
  if (error) {
    console.error(`  FAIL ${s.name}: ${error.message}`)
    continue
  }
  console.log(`  ${s.name.padEnd(28)} + '${role}' -> tags=${JSON.stringify(nextTags)}`)
  updated += 1
}
console.log(`\nBackfilled ${updated} signature row(s).`)

const { data: menu } = await supabase.from('menus').select('id').eq('event_id', EVENT_ID).maybeSingle()
if (menu) {
  const { error: delErr } = await supabase.from('menus').delete().eq('id', menu.id)
  if (delErr) {
    console.error(`\nFailed to delete stale menu: ${delErr.message}`)
    process.exit(1)
  }
  console.log(`\nDeleted stale persisted menu [${menu.id}] — next page load will re-draft with component_ids populated.`)
} else {
  console.log('\nNo persisted menu to reset.')
}
