// Exercises generateMenuWithAI() end-to-end against the real Gemini API,
// with hardcoded fake data, so the prompt/parsing/safety-net logic can be
// checked without going through the UI or creating real accounts.
//
// Usage: node scripts/test-gemini-menu.mjs
import { register } from 'node:module'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load GEMINI_API_KEY from .env.local the same way scripts/create-buckets.mjs does.
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
if (env.GEMINI_API_KEY) process.env.GEMINI_API_KEY = env.GEMINI_API_KEY
if (!process.env.GEMINI_API_KEY) {
  console.error('Missing GEMINI_API_KEY in .env.local')
  process.exit(1)
}

register('./ts-loader.mjs', import.meta.url)
const { generateMenuWithAI } = await import('../lib/menu-ai.ts')
const { buildIntel } = await import('../lib/intel.ts')

// --- Fake signature dishes -------------------------------------------------
const signatures = [
  {
    id: 'sig-1',
    name: "Grandma's Baklava",
    tags: ['Vegetarian'],
    contains_allergens: ['Nuts', 'Gluten', 'Dairy'],
    slot: 'finish',
  },
  {
    id: 'sig-2',
    name: 'Charred Octopus with Chickpea Puree',
    tags: [],
    contains_allergens: ['Shellfish'],
    slot: 'sea',
  },
  {
    id: 'sig-3',
    name: 'Slow-Braised Lamb Shoulder',
    tags: ['Halal'],
    contains_allergens: [],
    slot: 'land',
  },
  {
    id: 'sig-4',
    name: 'Charred Leek & Labneh',
    tags: ['Vegetarian', 'Gluten-free'],
    contains_allergens: ['Dairy'],
    slot: 'start',
  },
]

// --- Fake pantry ingredients ------------------------------------------------
const pantry = [
  { id: 'pan-1', name: 'Heirloom tomatoes' },
  { id: 'pan-2', name: 'Wild mushrooms' },
  { id: 'pan-3', name: 'Green lentils' },
  { id: 'pan-4', name: 'Blood oranges' },
  { id: 'pan-5', name: 'Fresh sea bream' },
]

// --- Fake guests -------------------------------------------------------------
// Sam has a nut allergy, which directly conflicts with "Grandma's Baklava"
// (contains_allergens includes "Nuts") — this is the hard limit we expect
// the safety net to catch and swap out.
const guests = [
  {
    name: 'Sam',
    dietary: [],
    avoid: ['Nuts'],
    proteinAnchor: 'Fish',
    flavorPreference: ['Fresh', 'Acidic'],
    adventurousness: 60,
  },
  {
    name: 'Priya',
    dietary: ['Vegetarian'],
    avoid: [],
    proteinAnchor: 'Vegetarian',
    flavorPreference: ['Spicy'],
    adventurousness: 45,
  },
  {
    name: 'Tariq',
    dietary: ['Halal'],
    avoid: ['Pork'],
    proteinAnchor: 'Lamb',
    flavorPreference: ['Rich', 'Grilled'],
    adventurousness: 70,
  },
  {
    name: 'Dana',
    dietary: [],
    avoid: [],
    proteinAnchor: 'Beef',
    flavorPreference: ['Smoky'],
    adventurousness: 85,
  },
]

const intel = buildIntel(guests)

console.log('=== TableIntel ===')
console.log(JSON.stringify(intel, null, 2))

console.log('\n=== Calling generateMenuWithAI ===')
const result = await generateMenuWithAI(intel, signatures, pantry)

console.log('\n=== Result ===')
console.log(`aiFailed: ${result.aiFailed}`)
if (result.fallbackReason) console.log(`fallbackReason: ${result.fallbackReason}`)

console.log('\n=== Generated Menu ===')
for (const course of result.courses) {
  console.log(`\n[${course.slotLabel}] ${course.dishName || '(empty)'}`)
  console.log(`  origin: ${course.origin}  sourceId: ${course.sourceId}`)
  if (course.reasoning) console.log(`  reasoning: ${course.reasoning}`)
  if (course.excludes.length) {
    console.log(`  excludes: ${course.excludes.map(e => `${e.guest} (${e.reason})`).join(', ')}`)
  }
}

const wasRejected = result.courses.some(c => c.reasoning?.includes('rejected'))
console.log(`\n=== Safety net triggered a swap: ${wasRejected} ===`)
