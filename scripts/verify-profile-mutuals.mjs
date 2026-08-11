import fs from 'node:fs'
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

function readEnv(path) {
  return Object.fromEntries(fs.readFileSync(path, 'utf8').split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^([^#=]+)=(.*)$/)
    if (!match) return []
    return [[match[1].trim(), match[2].trim().replace(/^['"]|['"]$/g, '')]]
  }))
}

const env = readEnv(process.argv[2] ?? '.env.remote-backup.local')
const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!url || !key) throw new Error('Supabase URL/key not found')

const db = createClient(url, key)
const ids = Array.from({ length: 4 }, () => crypto.randomUUID())
const eventId = crypto.randomUUID()

try {
  const { error: usersError } = await db.from('users').insert([
    { id: ids[0], name: 'Mutual Test A', caption: 'Caption A' },
    { id: ids[1], name: 'Mutual Test B', caption: 'Caption B' },
    { id: ids[2], name: 'Nonmutual Test A' },
    { id: ids[3], name: 'Nonmutual Test B' },
  ])
  if (usersError) throw usersError

  const { error: eventError } = await db.from('events').insert({
    id: eventId,
    host_id: ids[0],
    title: 'Mutual Verification Sofra',
    event_date: new Date(Date.now() + 86400000).toISOString(),
    is_published: false,
  })
  if (eventError) throw eventError

  const { error: rsvpError } = await db.from('rsvps').insert([
    { event_id: eventId, user_id: ids[0], status: 'going' },
    { event_id: eventId, user_id: ids[1], status: 'maybe' },
  ])
  if (rsvpError) throw rsvpError

  const { data: shared } = await db.from('rsvps').select('user_id').eq('event_id', eventId).in('status', ['going', 'maybe'])
  const sharedIds = new Set((shared ?? []).map((row) => row.user_id))
  if (!sharedIds.has(ids[0]) || !sharedIds.has(ids[1])) throw new Error('Mutual pair was not derived')
  if (sharedIds.has(ids[2]) || sharedIds.has(ids[3])) throw new Error('Non-mutual pair was incorrectly derived')

  const { data: captionRow, error: captionError } = await db.from('users').select('caption').eq('id', ids[1]).single()
  if (captionError || captionRow?.caption !== 'Caption B') throw captionError ?? new Error('Caption did not persist')

  console.log('PASS: real Supabase mutual, non-mutual, and caption verification')
} finally {
  await db.from('events').delete().eq('id', eventId)
  await db.from('users').delete().in('id', ids)
}
