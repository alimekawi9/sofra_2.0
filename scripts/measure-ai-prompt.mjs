// Measures the actual char/token size of the current buildAIPrompt output
// against the real demo event's signatures + pantry + guest intel. Compares
// against the 5966-char / 1492-token baseline documented in lib/gemini.ts.
//
// Usage: node scripts/measure-ai-prompt.mjs [--print-prompt]
//
// Matches the .mjs bootstrap pattern used by every other script in this
// directory: register the TS loader hook, then dynamic-import the real
// TS modules. No writes; safe to run repeatedly.
import { register } from 'node:module'
import { createClient } from '@supabase/supabase-js'
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

register('./ts-loader.mjs', import.meta.url)
const { buildIntel } = await import('../lib/intel.ts')
const { buildAIPrompt } = await import('../lib/menu-ai.ts')

// Same constants as scripts/inspect-demo-state.mjs.
const HOST_PHONE = '+10000000001'
const EVENT_ID = 'f4a87b1e-61b9-4199-9a63-22dd3196c45b'

// Baseline documented in lib/gemini.ts (commit b6975b5). This is the point
// from which the current 60_000ms timeout was calibrated.
const BASELINE_CHARS = 5966
const BASELINE_TOKENS = 1492

function currentMonday() {
  const d = new Date()
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)
}

async function loadHost() {
  const { data, error } = await supabase
    .from('users').select('id, name').eq('phone', HOST_PHONE).maybeSingle()
  if (error) throw new Error(`select host: ${error.message}`)
  if (!data) throw new Error(`demo host (${HOST_PHONE}) not found — run scripts/seed-demo-event.mjs`)
  return data
}

async function loadSignatures(hostId) {
  const { data, error } = await supabase
    .from('signatures')
    .select('id, name, tags, contains_allergens, slot')
    .eq('chef_id', hostId)
  if (error) throw new Error(`select signatures: ${error.message}`)
  return data ?? []
}

async function loadPantry(hostId) {
  const { data, error } = await supabase
    .from('pantry_items')
    .select('id, name, tags, contains_allergens')
    .eq('chef_id', hostId)
    .eq('week_of', currentMonday())
  if (error) throw new Error(`select pantry: ${error.message}`)
  return data ?? []
}

async function loadGuestProfiles() {
  const { data: rsvps, error: rErr } = await supabase
    .from('rsvps')
    .select('user_id, users(name)')
    .eq('event_id', EVENT_ID)
    .in('status', ['going', 'maybe'])
  if (rErr) throw new Error(`select rsvps: ${rErr.message}`)
  if (!rsvps || rsvps.length === 0) return []

  const userIds = rsvps.map(r => r.user_id)
  const { data: profiles, error: pErr } = await supabase
    .from('taste_profiles')
    .select('user_id, dietary, avoid, protein_anchor, flavor_preference, adventurousness')
    .in('user_id', userIds)
  if (pErr) throw new Error(`select taste_profiles: ${pErr.message}`)

  const out = []
  for (const r of rsvps) {
    const p = (profiles ?? []).find(x => x.user_id === r.user_id)
    if (!p) continue
    out.push({
      name: r.users?.name ?? '?',
      dietary: p.dietary ?? [],
      avoid: p.avoid ?? [],
      proteinAnchor: p.protein_anchor ?? null,
      flavorPreference: p.flavor_preference ?? [],
      adventurousness: p.adventurousness ?? 50,
    })
  }
  return out
}

const host = await loadHost()
const [signatures, pantry, guests] = await Promise.all([
  loadSignatures(host.id),
  loadPantry(host.id),
  loadGuestProfiles(),
])

const intel = buildIntel(guests)
const prompt = buildAIPrompt(intel, signatures, pantry)

const chars = prompt.length
const tokensEst = Math.round(chars / 4)
const charDelta = chars - BASELINE_CHARS
const tokenDelta = tokensEst - BASELINE_TOKENS
const pctDelta = ((charDelta / BASELINE_CHARS) * 100).toFixed(1)

console.log('=== Prompt inputs ===')
console.log(`host:        ${host.name} [${host.id}]`)
console.log(`event:       ${EVENT_ID}`)
console.log(`week_of:     ${currentMonday()}`)
console.log(`signatures:  ${signatures.length}`)
console.log(`pantry:      ${pantry.length}`)
console.log(`guests:      ${guests.length}`)
console.log(`hardLimits:  ${intel.hardLimits.length} ` +
  `(${intel.hardLimits.filter(h => h.type === 'allergy').length} allergy, ` +
  `${intel.hardLimits.filter(h => h.type === 'diet').length} diet)`)

console.log('\n=== Prompt size ===')
console.log(`current:   ${chars} chars (~${tokensEst} tokens est.)`)
console.log(`baseline:  ${BASELINE_CHARS} chars (~${BASELINE_TOKENS} tokens est.) — commit b6975b5`)
console.log(`delta:     ${charDelta >= 0 ? '+' : ''}${charDelta} chars ` +
  `(${tokenDelta >= 0 ? '+' : ''}${tokenDelta} tokens, ${pctDelta}%)`)

if (process.argv.includes('--print-prompt')) {
  console.log('\n=== Full prompt ===')
  console.log(prompt)
}
