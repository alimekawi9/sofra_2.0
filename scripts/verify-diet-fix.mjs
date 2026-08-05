// Ad-hoc verification for the diet-tag safety-check fix (lib/menu.ts).
// Reproduces the demo event's guests (from scripts/seed-demo-event.mjs) and a
// realistic signature catalog (tags copied from lib/dish-presets.ts) and shows,
// per-signature and per-course, exactly what scoreDish now returns.
//
// Usage: node scripts/verify-diet-fix.mjs
import { register } from 'node:module'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '..', '.env.local')
if (existsSync(envPath)) {
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
}

register('./ts-loader.mjs', import.meta.url)
const { buildIntel } = await import('../lib/intel.ts')
const { scoreDish, draftMenu, SLOT_LABELS } = await import('../lib/menu.ts')

// --- Demo guests (copied verbatim from scripts/seed-demo-event.mjs) --------
const guests = [
  { name: 'Omar',  dietary: [],              avoid: ['Pork'],      proteinAnchor: 'Beef',       flavorPreference: ['Rich'],          adventurousness: 85 },
  { name: 'Nadia', dietary: ['Vegetarian'],  avoid: ['Nuts'],      proteinAnchor: 'Vegetarian', flavorPreference: ['Fresh'],         adventurousness: 55 },
  { name: 'Sam',   dietary: [],              avoid: ['Nuts'],      proteinAnchor: 'Chicken',    flavorPreference: ['Crispy'],        adventurousness: 40 },
  { name: 'Yara',  dietary: [],              avoid: ['Shellfish'], proteinAnchor: 'Fish',       flavorPreference: ['Fresh'],         adventurousness: 75 },
  { name: 'Tarek', dietary: ['Halal'],       avoid: [],            proteinAnchor: 'Lamb',       flavorPreference: ['Spicy'],         adventurousness: 90 },
  { name: 'Mona',  dietary: ['Vegetarian'],  avoid: ['Mushrooms'], proteinAnchor: 'Vegetarian', flavorPreference: ['Creamy'],        adventurousness: 35 },
  { name: 'Dana',  dietary: [],              avoid: ['Nuts'],      proteinAnchor: 'Chicken',    flavorPreference: ['Rich'],          adventurousness: 60 },
  { name: 'Priya', dietary: ['Vegetarian'],  avoid: [],            proteinAnchor: 'No preference', flavorPreference: ['Spicy'],      adventurousness: 65 },
]

// --- Signatures with the tag/allergen shapes from lib/dish-presets.ts -----
const signatures = [
  { id: 'sig-1',  name: 'Baba Ganoush',        slot: 'start',  tags: ['veg', 'vegan'],           contains_allergens: [] },
  { id: 'sig-2',  name: 'Hummus',              slot: 'start',  tags: ['veg', 'vegan'],           contains_allergens: [] },
  { id: 'sig-3',  name: 'Muhammara',           slot: 'start',  tags: ['veg', 'vegan'],           contains_allergens: ['nuts'] },
  { id: 'sig-4',  name: 'Chana Masala',        slot: 'green',  tags: ['veg', 'vegan'],           contains_allergens: [] },
  { id: 'sig-5',  name: 'Ratatouille',         slot: 'green',  tags: ['veg', 'vegan'],           contains_allergens: [] },
  { id: 'sig-6',  name: 'Falafel',             slot: 'green',  tags: ['veg', 'vegan'],           contains_allergens: [] },
  { id: 'sig-7',  name: 'Risotto ai Funghi',   slot: 'green',  tags: ['veg'],                    contains_allergens: ['dairy'] },
  { id: 'sig-8',  name: 'Lamb Kofta',          slot: 'land',   tags: ['meat'],                   contains_allergens: [] },
  { id: 'sig-9',  name: 'Souvlaki',            slot: 'land',   tags: ['meat'],                   contains_allergens: [] },
  { id: 'sig-10', name: 'BBQ Pulled Pork',     slot: 'land',   tags: ['meat'],                   contains_allergens: [] },
  { id: 'sig-11', name: 'Sushi Platter',       slot: 'sea',    tags: ['seafood'],                contains_allergens: ['shellfish'] },
  { id: 'sig-12', name: 'Ceviche',             slot: 'sea',    tags: ['seafood'],                contains_allergens: ['shellfish'] },
  { id: 'sig-13', name: 'Bouillabaisse',       slot: 'sea',    tags: ['seafood'],                contains_allergens: ['shellfish'] },
  { id: 'sig-14', name: 'Matcha Mochi',        slot: 'finish', tags: ['dessert', 'veg', 'vegan'], contains_allergens: [] },
  { id: 'sig-15', name: 'Panna Cotta',         slot: 'finish', tags: ['dessert', 'veg'],         contains_allergens: ['dairy'] },
  { id: 'sig-16', name: 'Baklava',             slot: 'finish', tags: ['dessert', 'veg'],         contains_allergens: ['nuts', 'gluten'] },
]

// Pantry items now carry declared tags + contains_allergens (matching signatures).
// Sea Bass and Duck Breast tagged halal so they can serve Tarek; Aubergine and
// Apricots tagged vegan so they serve the whole table.
const pantry = [
  { id: 'p-1', name: 'Sourdough',   tags: ['veg'],           contains_allergens: ['gluten'] },
  { id: 'p-2', name: 'Sea Bass',    tags: ['seafood', 'halal'], contains_allergens: [] },
  { id: 'p-3', name: 'Aubergine',   tags: ['veg', 'vegan'],  contains_allergens: [] },
  { id: 'p-4', name: 'Apricots',    tags: ['veg', 'vegan'],  contains_allergens: [] },
  { id: 'p-5', name: 'Duck Breast', tags: ['meat', 'halal'], contains_allergens: [] },
]

const intel = buildIntel(guests)

console.log('=== Demo table intel ===')
console.log(`Guests: ${intel.guestCount}`)
console.log('Hard limits:')
for (const h of intel.hardLimits) {
  console.log(`  ${h.type.toUpperCase()} "${h.label}" → ${h.guests.join(', ')}`)
}

console.log('\n=== scoreDish() per signature (post-fix) ===')
for (const sig of signatures) {
  const excludes = scoreDish(sig, intel)
  const status = excludes.length === 0
    ? 'SAFE for whole table'
    : `excludes ${excludes.map(e => `${e.guest} (${e.reason})`).join(', ')}`
  console.log(`  [${sig.slot.padEnd(6)}] ${sig.name.padEnd(22)} tags=${JSON.stringify(sig.tags).padEnd(30)} → ${status}`)
}

console.log('\n=== draftMenu() result (rule-based path) ===')
const drafted = draftMenu(intel, signatures, pantry)
for (const c of drafted) {
  console.log(`\n[${c.slotLabel}] ${c.dishName || '(empty)'}`)
  console.log(`  origin: ${c.origin}  sourceId: ${c.sourceId}`)
  if (c.excludes.length) {
    console.log(`  excludes: ${c.excludes.map(e => `${e.guest} (${e.reason})`).join(', ')}`)
  } else {
    console.log(`  excludes: (none — serves whole table)`)
  }
}

// Try the AI path if a key is available; skip gracefully otherwise.
if (process.env.GEMINI_API_KEY) {
  console.log('\n=== generateMenuWithAI() result (AI path, real Gemini call) ===')
  try {
    const { generateMenuWithAI } = await import('../lib/menu-ai.ts')
    const result = await generateMenuWithAI(intel, signatures, pantry)
    console.log(`aiFailed: ${result.aiFailed}`)
    if (result.fallbackReason) console.log(`fallbackReason: ${result.fallbackReason}`)
    for (const c of result.courses) {
      console.log(`\n[${c.slotLabel}] ${c.dishName || '(empty)'}`)
      console.log(`  origin: ${c.origin}  sourceId: ${c.sourceId}`)
      if (c.reasoning) console.log(`  reasoning: ${c.reasoning}`)
      if (c.excludes.length) {
        console.log(`  excludes: ${c.excludes.map(e => `${e.guest} (${e.reason})`).join(', ')}`)
      } else {
        console.log(`  excludes: (none — serves whole table)`)
      }
    }
  } catch (err) {
    console.log(`AI path failed: ${err instanceof Error ? err.message : String(err)}`)
  }
} else {
  console.log('\n=== Skipping AI path — no GEMINI_API_KEY in .env.local ===')
}
