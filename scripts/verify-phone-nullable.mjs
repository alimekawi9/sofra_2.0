// Verifies the 20260807000001_make_users_phone_nullable.sql migration
// against the real database: null-phone users can be created (and don't
// collide with each other under the UNIQUE constraint), while duplicate
// non-null phone numbers are still rejected. Cleans up every row it creates.
//
// Requires the migration to already be applied to the target database.
// Usage: node scripts/verify-phone-nullable.mjs
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

const created = []
let failures = 0

function check(label, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${label}${detail ? `: ${detail}` : ''}`)
  if (!ok) failures++
}

async function insertUser(name, phone) {
  const id = crypto.randomUUID()
  const { error } = await supabase.from('users').insert({ id, name, phone })
  created.push(id)
  return { id, error }
}

// 1. Two separate null-phone users must both succeed (NULL is never equal
//    to NULL under a UNIQUE constraint, so this must not collide).
const a = await insertUser('verify-phone-nullable A', null)
check('first null-phone user inserts successfully', !a.error, a.error?.message)
const b = await insertUser('verify-phone-nullable B', null)
check('second null-phone user inserts successfully (no false collision)', !b.error, b.error?.message)

// 2. A duplicate non-null phone must still be rejected.
const uniquePhone = `+1999${Date.now().toString().slice(-7)}`
const c = await insertUser('verify-phone-nullable C', uniquePhone)
check('first user with a fresh non-null phone inserts successfully', !c.error, c.error?.message)
const d = await insertUser('verify-phone-nullable D', uniquePhone)
check(
  'second user with the SAME non-null phone is rejected (uniqueness preserved)',
  !!d.error && /unique|duplicate/i.test(d.error.message),
  d.error ? d.error.message : 'expected an error but insert succeeded'
)

// Cleanup — remove every row this script created, regardless of outcome.
const { error: cleanupError } = await supabase.from('users').delete().in('id', created)
if (cleanupError) console.error('cleanup failed:', cleanupError.message)
else console.log(`cleaned up ${created.length} test row(s)`)

console.log(failures === 0 ? '\n=== ALL CHECKS PASSED ===' : `\n=== ${failures} CHECK(S) FAILED ===`)
process.exit(failures === 0 ? 0 : 1)
