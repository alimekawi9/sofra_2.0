import { register } from 'node:module'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
for (const line of readFileSync(resolve(root, '.env.local'), 'utf8').split('\n')) {
  const value = line.trim()
  if (!value || value.startsWith('#')) continue
  const separator = value.indexOf('=')
  if (separator > 0) process.env[value.slice(0, separator)] = value.slice(separator + 1)
}
register('./ts-loader.mjs', import.meta.url)
const { createClient } = await import('@supabase/supabase-js')
const { buildRecommendationPlan } = await import('../lib/recommendation/pipeline.ts')
const { buildMenuCreationBrief, buildCompactGapPrompt } = await import('../lib/recommendation/brief.ts')
const { MENU_PROPOSAL_SCHEMA, parseMenuProposal } = await import('../lib/recommendation/proposal.ts')
const { validateFinalMenu, repairWithLimit } = await import('../lib/recommendation/validator.ts')
const { callGeminiJson } = await import('../lib/gemini.ts')
const { inferSlot } = await import('../lib/menu.ts')
const { withoutDishRoles } = await import('../lib/dish-presets.ts')
const { normalizeProteinPreferences } = await import('../lib/protein-preferences.ts')

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const monday = (() => { const d = new Date(); d.setDate(d.getDate() + (d.getDay() === 0 ? -6 : 1 - d.getDay())); return d.toISOString().slice(0, 10) })()
const { data: host } = await db.from('users').select('id').eq('phone', '+10000000001').maybeSingle()
if (!host) throw new Error('Demo host not found')
const { data: event } = await db.from('events').select('id').eq('host_id', host.id).maybeSingle()
if (!event) throw new Error('Demo event not found')
const { data: rsvps } = await db.from('rsvps').select('user_id,users(name)').eq('event_id', event.id).in('status', ['going', 'maybe'])
const ids = (rsvps ?? []).map(row => row.user_id)
const [{ data: profiles }, { data: rawSignatures }, { data: rawPantry }] = await Promise.all([
  db.from('taste_profiles').select('*').in('user_id', ids),
  db.from('signatures').select('id,name,tags,contains_allergens,slot').eq('chef_id', host.id),
  db.from('pantry_items').select('id,name,tags,contains_allergens').eq('chef_id', host.id).eq('week_of', monday),
])
const guests = (rsvps ?? []).map(row => { const p = (profiles ?? []).find(x => x.user_id === row.user_id); return { name: row.users?.name ?? 'Unknown', dietary: p?.dietary ?? [], avoid: p?.avoid ?? [], proteinAnchor: p?.protein_anchor ?? null, proteinPreferences: normalizeProteinPreferences(p?.protein_preferences, p?.protein_anchor), flavorPreference: p?.flavor_preference ?? [], adventurousness: p?.adventurousness ?? 50 } })
const signatures = (rawSignatures ?? []).map(s => ({ ...s, slot: s.slot ?? inferSlot(s.name, s.tags) }))
const pantry = (rawPantry ?? []).map(p => ({ ...p, tags: withoutDishRoles(p.tags) }))
const started = performance.now()
const plan = buildRecommendationPlan(guests, signatures, pantry, [])
const brief = buildMenuCreationBrief(plan)
const prompt = buildCompactGapPrompt(brief)
let modelLatency = 0
let fallback = false
let proposal = { signatureRefinements: [], generatedDishes: [] }
try {
  const modelStarted = performance.now()
  const raw = await callGeminiJson(prompt, MENU_PROPOSAL_SCHEMA)
  modelLatency = performance.now() - modelStarted
  const parsed = parseMenuProposal(raw, brief)
  if (!parsed.ok) throw new Error(parsed.errors.join('; '))
  proposal = parsed.proposal
} catch (error) {
  fallback = true
  console.error(error)
}
const toDishes = p => [...plan.selected.map(x => ({ name: x.signature.name, role: x.role, origin: 'signature', baseSignatureName: x.signature.name, usedAvailableIngredients: [], missingIngredients: [] })), ...p.generatedDishes.map(x => ({ name: x.finalName, role: x.role, origin: 'generated', usedAvailableIngredients: x.usedAvailableIngredients, missingIngredients: x.missingIngredients, scoringMetadata: x.metadata }))]
const validate = dishes => validateFinalMenu({ dishes, target: plan.targetDishCount, guests, signatures, pantry })
const validationStarted = performance.now()
const repaired = fallback ? { result: validate(toDishes(proposal)), attempts: 0 } : await repairWithLimit(toDishes(proposal), validate, async (dishes, issue) => {
  const index = issue.dishIndex ?? dishes.findIndex(d => !d.locked)
  if (index < 0 || dishes[index].locked || !brief.gaps[0]) return null
  const repairBrief = { ...brief, event: { ...brief.event, missingDishCount: 1 }, selectedSignatures: dishes.filter((_, i) => i !== index && dishes[i].origin === 'signature').map(d => ({ name: d.name, role: d.role, mayBeRefined: false })), gaps: [{ ...brief.gaps[0], culinaryGoal: `Replace ${dishes[index].name}: ${issue.message}`, avoid: dishes.filter((_, i) => i !== index).map(d => d.name) }] }
  const raw = await callGeminiJson(buildCompactGapPrompt(repairBrief), MENU_PROPOSAL_SCHEMA)
  const parsed = parseMenuProposal(raw, repairBrief)
  if (!parsed.ok || parsed.proposal.generatedDishes.length !== 1) return null
  const d = parsed.proposal.generatedDishes[0]
  return { index, dish: { name: d.finalName, role: d.role, origin: 'generated', usedAvailableIngredients: d.usedAvailableIngredients, missingIngredients: d.missingIngredients, scoringMetadata: d.metadata } }
}, 2)
const validationLatency = performance.now() - validationStarted
fallback ||= !repaired.result.valid
if (!repaired.result.valid) console.error(JSON.stringify({ stage: 'deterministic_validation', issues: repaired.result.issues }, null, 2))
console.log(JSON.stringify({ calculatedN: plan.targetDishCount, selectedSignatureCount: plan.selected.length, M: plan.gaps.length, promptTokens: Math.ceil(prompt.length / 4), modelLatencyMs: Math.round(modelLatency), validationLatencyMs: Math.round(validationLatency), repairAttempts: repaired.attempts, totalLatencyMs: Math.round(performance.now() - started), fallback }, null, 2))
