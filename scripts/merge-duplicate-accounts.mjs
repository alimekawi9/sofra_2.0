import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

// Case-by-case duplicate-account cleanup, per explicit user direction:
//
// 1. "Alia" -- 5 accounts share what's really one identity split by the
//    pre-country-picker phone bug. Only ONE (3a72e435...) has any real data
//    (RSVPs, taste profile, THE ODYSSEY co-host role, hosted event, survey
//    answers) -- confirmed by a full read-only audit across every
//    user-referencing table. The other 4 are entirely empty duplicates.
//    Keep 3a72e435..., normalize its phone to +1 (US), delete the 4 empties.
//
// 2. "Ali" (6e61d83c...) has phone "22884455521" (11 digits, no country
//    code). 11 digits has an exact match in exactly one country in this
//    app's list: China (+86, CN:[11]) -- Brazil and Germany also allow 11
//    but as one of two valid lengths (10 or 11), not the sole length, so
//    China is the unambiguous fit. No shortening needed.

const KEEP_ALIA_ID = '3a72e435-33ca-4b4b-85c0-20faa12f6991'
const ALIA_TARGET_PHONE = '+14012303966'
const EMPTY_ALIA_DUPLICATE_IDS = [
  '39306097-1ba7-4270-9887-a43600aaf639', // +201146466645
  'b5b43235-3524-4016-a74d-5760babd2f0e', // +14012303966 (collides with the target phone -- must go first)
  '1fe5d863-d2fa-4d6f-84d5-eb1709a86746', // +204012303966
  '7de59971-98c8-421f-aaf6-b29e1205fb5d', // 1146466645
]

const ALI_ID = '6e61d83c-a05d-4d5b-b6dd-9145e6ee453d'
const ALI_TARGET_PHONE = '+8622884455521'

const REFERENCE_CHECKS = [
  ['rsvps', 'user_id'],
  ['taste_profiles', 'user_id'],
  ['event_cohosts', 'user_id'],
  ['events', 'host_id'],
  ['events', 'chef_id'],
  ['event_photos', 'uploaded_by'],
  ['event_photo_comments', 'user_id'],
  ['event_messages', 'user_id'],
  ['event_question_responses', 'user_id'],
  ['signatures', 'chef_id'],
  ['pantry_items', 'chef_id'],
]

const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  .split('\n').map((line) => line.trim()).filter((line) => line && !line.startsWith('#'))
  .map((line) => { const at = line.indexOf('='); return [line.slice(0, at), line.slice(at + 1)] }))

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function referenceCount(uid) {
  let total = 0
  for (const [table, column] of REFERENCE_CHECKS) {
    const { count, error } = await db.from(table).select('*', { count: 'exact', head: true }).eq(column, uid)
    if (error) throw error
    total += count ?? 0
  }
  return total
}

console.log('=== SAFETY CHECK: confirming each "empty" Alia duplicate truly has zero references ===')
for (const uid of EMPTY_ALIA_DUPLICATE_IDS) {
  const count = await referenceCount(uid)
  console.log(uid, '-> reference count:', count)
  if (count !== 0) throw new Error(`Safety stop: ${uid} is not actually empty (${count} references found). Aborting.`)
}

const { data: keepRow, error: keepError } = await db.from('users').select('id,name,phone').eq('id', KEEP_ALIA_ID).maybeSingle()
if (keepError) throw keepError
if (!keepRow) throw new Error(`Safety stop: keeper account ${KEEP_ALIA_ID} not found`)
console.log('\nKeeper Alia account:', keepRow, '-> will become phone', ALIA_TARGET_PHONE)

const { data: aliRow, error: aliError } = await db.from('users').select('id,name,phone').eq('id', ALI_ID).maybeSingle()
if (aliError) throw aliError
if (!aliRow) throw new Error(`Safety stop: Ali account ${ALI_ID} not found`)
if (aliRow.phone !== '22884455521') throw new Error(`Safety stop: Ali's phone is "${aliRow.phone}", not the expected "22884455521". Aborting.`)
console.log('Ali account:', aliRow, '-> will become phone', ALI_TARGET_PHONE)

if (!process.argv.includes('--apply')) {
  console.log('\nDry run only -- no changes made. Re-run with --apply to make these changes.')
  process.exit(0)
}

// Delete the empty duplicates BEFORE renaming the keeper's phone, since one
// of them (b5b43235...) currently holds the exact phone value we're about to
// assign to the keeper.
for (const uid of EMPTY_ALIA_DUPLICATE_IDS) {
  const { error } = await db.from('users').delete().eq('id', uid)
  if (error) throw error
}
console.log(`\nDeleted ${EMPTY_ALIA_DUPLICATE_IDS.length} empty Alia duplicate(s).`)

const { error: updateAliaError } = await db.from('users').update({ phone: ALIA_TARGET_PHONE }).eq('id', KEEP_ALIA_ID)
if (updateAliaError) throw updateAliaError
console.log(`Updated Alia's phone to ${ALIA_TARGET_PHONE}.`)

const { error: updateAliError } = await db.from('users').update({ phone: ALI_TARGET_PHONE }).eq('id', ALI_ID)
if (updateAliError) throw updateAliError
console.log(`Updated Ali's phone to ${ALI_TARGET_PHONE}.`)

console.log('\nDone.')
