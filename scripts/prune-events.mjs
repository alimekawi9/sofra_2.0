import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const KEEP_IDS = new Set([
  '6eacfc25-9c05-4c46-8bce-416b04245cd3',
  'db2c9c4f-7e8c-4d86-8c4d-1e9abfbcfa81',
])

const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  .split('\n').map((line) => line.trim()).filter((line) => line && !line.startsWith('#'))
  .map((line) => { const at = line.indexOf('='); return [line.slice(0, at), line.slice(at + 1)] }))

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const { data: events, error: readError } = await db.from('events').select('id,title,event_date').order('created_at')
if (readError) throw readError

const preserved = events.filter((event) => KEEP_IDS.has(event.id))
const targets = events.filter((event) => !KEEP_IDS.has(event.id))

console.log('PRESERVE')
console.table(preserved)
console.log('DELETE')
console.table(targets)

if (preserved.length !== KEEP_IDS.size) {
  throw new Error(`Safety stop: found ${preserved.length} of the ${KEEP_IDS.size} required preserved events`)
}

if (!process.argv.includes('--apply')) {
  console.log(`Dry run only: ${targets.length} event(s) would be deleted.`)
  process.exit(0)
}

if (targets.length) {
  const { error: deleteError } = await db.from('events').delete().in('id', targets.map((event) => event.id))
  if (deleteError) throw deleteError
}

const { data: remaining, error: verifyError } = await db.from('events').select('id,title').order('created_at')
if (verifyError) throw verifyError
if (remaining.length !== KEEP_IDS.size || remaining.some((event) => !KEEP_IDS.has(event.id))) {
  throw new Error(`Verification failed: unexpected remaining event set ${JSON.stringify(remaining)}`)
}
console.log(`Deleted ${targets.length} event(s). Verified exactly the two requested events remain.`)
