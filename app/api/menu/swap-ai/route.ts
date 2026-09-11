import { NextResponse } from 'next/server'
import type { TasteProfile } from '@/lib/intel'
import type { PantryItem, Signature, Slot } from '@/lib/menu'
import { withoutDishRoles } from '@/lib/dish-presets'
import { normalizeProteinPreferences } from '@/lib/protein-preferences'
import { createClient } from '@/lib/supabase/server'
import { requireAppUser } from '@/lib/auth/server-user'
import { buildRecommendationPlan, dinerDishFit } from '@/lib/recommendation/pipeline'
import { buildCompactGapPrompt, buildMenuCreationBrief, type MenuCreationBrief } from '@/lib/recommendation/brief'
import { MENU_PROPOSAL_SCHEMA, parseMenuProposal } from '@/lib/recommendation/proposal'
import { callGeminiJson } from '@/lib/gemini'

export const runtime = 'nodejs'
export const maxDuration = 10

function currentMonday(): string {
  const d = new Date()
  const diff = d.getDay() === 0 ? -6 : 1 - d.getDay()
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)
}

const lower = (xs: string[] = []) => xs.map((x) => x.toLowerCase())

// Swap's deterministic path (draftCourse in lib/menu.ts) only ever draws from
// stored signatures. Once the chef has too few signatures left to offer a new
// alternative for a slot -- the near-empty-inventory edge case -- there is no
// deterministic candidate left to give, no matter how good the guest
// preference data is. This route is the explicitly-authorized LLM fallback
// for exactly that dead end: it is only ever called after the deterministic
// swap has already come up empty, so it never competes with the free,
// synchronous path and never runs on every ordinary swap click.
export async function POST(req: Request) {
  let body: { eventId?: unknown; courseId?: unknown }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (typeof body.eventId !== 'string' || typeof body.courseId !== 'string') {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const supabase = createClient()
  const currentUser = await requireAppUser(supabase)
  if (!currentUser) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  const userId = currentUser.appUserId
  const { data: event } = await supabase.from('events').select('host_id,chef_id').eq('id', body.eventId).maybeSingle()
  if (!event) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { data: cohost } = event.host_id === userId || event.chef_id === userId
    ? { data: null }
    : await supabase.from('event_cohosts').select('user_id').eq('event_id', body.eventId).eq('user_id', userId).maybeSingle()
  if (event.host_id !== userId && event.chef_id !== userId && !cohost) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: targetCourse } = await supabase.from('menu_courses').select('id,menu_id,slot').eq('id', body.courseId).maybeSingle()
  if (!targetCourse) return NextResponse.json({ error: 'Course not found' }, { status: 404 })
  const { data: menu } = await supabase.from('menus').select('event_id').eq('id', targetCourse.menu_id).maybeSingle()
  if (!menu || menu.event_id !== body.eventId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const slot = targetCourse.slot as Slot

  const { data: menuCourses } = await supabase.from('menu_courses').select('dish_name').eq('menu_id', targetCourse.menu_id)
  const avoidNames = Array.from(new Set((menuCourses ?? []).map((row) => row.dish_name).filter((name): name is string => !!name)))

  const chefId = event.chef_id ?? event.host_id
  const [{ data: rsvps }, { data: pantry }] = await Promise.all([
    supabase.from('rsvps').select('user_id,users(name)').eq('event_id', body.eventId).in('status', ['going', 'maybe']),
    supabase.from('pantry_items').select('id,name,tags,contains_allergens').eq('chef_id', chefId).eq('week_of', currentMonday()),
  ])
  const ids = (rsvps ?? []).map((row) => row.user_id)
  const { data: profiles } = ids.length
    ? await supabase.from('taste_profiles').select('user_id,dietary,avoid,protein_anchor,protein_preferences,flavor_preference,adventurousness').in('user_id', ids)
    : { data: [] }
  const guests: TasteProfile[] = (rsvps ?? []).map((row) => {
    const profile = (profiles ?? []).find((item) => item.user_id === row.user_id)
    const related = row.users as unknown as { name?: string } | null
    return {
      name: related?.name ?? 'Unknown', dietary: profile?.dietary ?? [], avoid: profile?.avoid ?? [],
      proteinAnchor: profile?.protein_anchor ?? null,
      proteinPreferences: normalizeProteinPreferences(profile?.protein_preferences, profile?.protein_anchor),
      flavorPreference: profile?.flavor_preference ?? [], adventurousness: profile?.adventurousness ?? 50,
    }
  })
  if (guests.length === 0) return NextResponse.json({ error: 'No guests to generate a dish for' }, { status: 422 })

  const trustedPantry: PantryItem[] = (pantry ?? []).map((item) => ({ ...item, tags: withoutDishRoles(item.tags) }))
  // No signatures are offered here -- the deterministic swap already tried
  // every stored signature and came up empty, so this route's only job is to
  // invent one new dish. Passing signatures=[] keeps that a hard rule rather
  // than a soft preference.
  const noSignatures: Signature[] = []
  const contextPlan = buildRecommendationPlan(guests, noSignatures, trustedPantry, [])
  const contextBrief = buildMenuCreationBrief(contextPlan)

  const gap: MenuCreationBrief['gaps'][number] = {
    gapIndex: 0,
    requestedRole: slot,
    substantialRequired: slot === 'main',
    targetDinerCount: guests.length,
    targetDiners: guests.map((g, dinerIndex) => ({
      dinerIndex,
      needsSubstantialSafeDish: slot === 'main',
      proteinNeed: lower(g.proteinPreferences ?? []),
      sensoryNeed: lower(g.flavorPreference ?? []),
      dietaryConstraints: Array.from(new Set([...lower(g.dietary), ...lower(g.avoid)])),
    })),
    culinaryGoal: `Create one ${slot} that fits the whole table. The chef has run out of stored signature dishes for this slot and needs a fresh suggestion.`,
    underservedNeed: [],
    proteinDirections: Array.from(new Set(guests.flatMap((g) => lower(g.proteinPreferences ?? [])))),
    flavorDirections: Array.from(new Set(guests.flatMap((g) => lower(g.flavorPreference ?? [])))),
    avoid: avoidNames,
  }

  const brief: MenuCreationBrief = {
    ...contextBrief,
    event: { guestCount: guests.length, targetDishCount: 1, missingDishCount: 1 },
    selectedSignatures: [],
    gaps: [gap],
  }

  let raw: unknown
  try {
    raw = await callGeminiJson(buildCompactGapPrompt(brief), MENU_PROPOSAL_SCHEMA)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Generation failed' }, { status: 503 })
  }
  const parsed = parseMenuProposal(raw, brief)
  if (!parsed.ok || parsed.proposal.generatedDishes.length !== 1) {
    return NextResponse.json({ error: 'Invalid model proposal', validationErrors: !parsed.ok ? parsed.errors : ['unexpected dish count'] }, { status: 422 })
  }
  const dish = parsed.proposal.generatedDishes[0]
  const m = dish.metadata
  const safetySource = {
    name: dish.finalName,
    tags: [slot, ...m.proteinBase, ...m.flavors, ...m.textures, ...m.techniques, ...m.temperature, ...m.richness, ...m.dietary],
    contains_allergens: m.allergens,
    novelty_score: m.noveltyScore,
  }
  const unsafeForSomeGuest = guests.some((guest) => dinerDishFit(guest, safetySource, guests.length).eligibility === 0)
  if (unsafeForSomeGuest) return NextResponse.json({ error: 'Generated dish failed safety validation' }, { status: 422 })

  const { data: updated, error: updateError } = await supabase
    .from('menu_courses')
    .update({
      dish_name: dish.finalName,
      dish_origin: 'pantry-composed',
      source: null,
      component_ids: null,
      scoring_metadata: { ...m, missingIngredients: dish.missingIngredients },
    })
    .eq('id', body.courseId)
    .select('*')
    .single()
  if (updateError || !updated) return NextResponse.json({ error: 'Failed to persist swapped dish' }, { status: 500 })

  return NextResponse.json({ row: updated })
}
