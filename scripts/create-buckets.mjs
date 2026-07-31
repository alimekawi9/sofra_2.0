import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '..', '.env.local')
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
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

const BUCKETS = ['covers', 'avatars']

function print(label, value) {
  console.log(`\n=== ${label} ===`)
  console.log(JSON.stringify(value, null, 2))
}

async function main() {
  for (const name of BUCKETS) {
    const res = await supabase.storage.createBucket(name, { public: true })
    print(`createBucket('${name}')`, res)
  }

  const list = await supabase.storage.listBuckets()
  print('listBuckets()', list)

  for (const name of BUCKETS) {
    const res = await supabase.storage.getBucket(name)
    print(`getBucket('${name}')`, res)
  }
}

main().catch((e) => {
  console.error('\n=== UNCAUGHT ERROR ===')
  console.error(e)
  process.exit(1)
})
