import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

// One-off migration: a custom question created by converting one of the 5
// canonical questions (see convertCanonicalQuestion in
// components/sofra-v2/QuestionnaireEditor.tsx) used to keep the canonical
// question's old id (e.g. "dietary") instead of getting a fresh one. This
// gives any such already-converted question on the named event a real,
// unique id -- in both event_questionnaires.config and the matching
// event_question_responses rows -- matching what the fixed editor now does
// for new conversions. Also removes any response rows that don't belong to
// any question in the resulting config at all (the same orphan cleanup the
// app itself now does automatically on save/reset).

const EVENT_ID = '6eacfc25-9c05-4c46-8bce-416b04245cd3' // THE ODYSSEY
const RESERVED_IDS = new Set(['dietary', 'avoid', 'protein', 'flavor', 'adventurousness'])

function generateQuestionId() {
  return `q_${Math.random().toString(36).slice(2, 10)}`
}

const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  .split('\n').map((line) => line.trim()).filter((line) => line && !line.startsWith('#'))
  .map((line) => { const at = line.indexOf('='); return [line.slice(0, at), line.slice(at + 1)] }))

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const { data: event, error: eventError } = await db.from('events').select('id,title').eq('id', EVENT_ID).maybeSingle()
if (eventError) throw eventError
if (!event) throw new Error(`Safety stop: event ${EVENT_ID} not found`)
console.log(`Target event: "${event.title}" (${event.id})`)

const { data: qRow, error: qError } = await db.from('event_questionnaires').select('config').eq('event_id', EVENT_ID).maybeSingle()
if (qError) throw qError
if (!qRow?.config?.questions) throw new Error('Safety stop: no questionnaire config found for this event')

const config = qRow.config
const idMap = new Map() // oldId -> newId, only for custom questions currently reusing a canonical id
for (const q of config.questions) {
  if (q.kind === 'custom' && RESERVED_IDS.has(q.id)) idMap.set(q.id, generateQuestionId())
}

if (idMap.size === 0) {
  console.log('Nothing to migrate: no custom question in this config reuses a canonical id.')
  process.exit(0)
}

console.log('\nID REMAPPING')
console.table([...idMap.entries()].map(([oldId, newId]) => ({ oldId, newId })))

const newConfig = {
  ...config,
  questions: config.questions.map((q) => (idMap.has(q.id) ? { ...q, id: idMap.get(q.id) } : q)),
}

const { data: responseRows, error: responseError } = await db
  .from('event_question_responses')
  .select('id,user_id,question_id,response')
  .eq('event_id', EVENT_ID)
if (responseError) throw responseError

const toRemap = responseRows.filter((row) => idMap.has(row.question_id))
console.log(`\nRESPONSES TO REMAP (${toRemap.length})`)
console.table(toRemap.map((row) => ({ user_id: row.user_id, oldQuestionId: row.question_id, newQuestionId: idMap.get(row.question_id), response: JSON.stringify(row.response) })))

const currentConfigIds = new Set(newConfig.questions.map((q) => q.id))
const orphaned = responseRows.filter((row) => !idMap.has(row.question_id) && !currentConfigIds.has(row.question_id))
console.log(`\nORPHANED ROWS TO DELETE -- question no longer in config at all (${orphaned.length})`)
console.table(orphaned.map((row) => ({ user_id: row.user_id, question_id: row.question_id, response: JSON.stringify(row.response) })))

if (!process.argv.includes('--apply')) {
  console.log('\nDry run only -- no changes made. Re-run with --apply to make these changes.')
  process.exit(0)
}

const { error: upsertError } = await db.from('event_questionnaires').upsert(
  { event_id: EVENT_ID, config: newConfig, updated_at: new Date().toISOString() },
  { onConflict: 'event_id' }
)
if (upsertError) throw upsertError

for (const row of toRemap) {
  const { error: updateError } = await db
    .from('event_question_responses')
    .update({ question_id: idMap.get(row.question_id) })
    .eq('id', row.id)
  if (updateError) throw updateError
}

if (orphaned.length > 0) {
  const { error: deleteError } = await db
    .from('event_question_responses')
    .delete()
    .in('id', orphaned.map((row) => row.id))
  if (deleteError) throw deleteError
}

console.log(`\nDone. Remapped ${toRemap.length} response row(s), removed ${orphaned.length} orphaned row(s).`)
