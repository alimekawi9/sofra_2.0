import { NextResponse } from 'next/server'
import { buildIntel, type TasteProfile } from '@/lib/intel'
import { inferSlot, type PantryItem, type Signature } from '@/lib/menu'
import { withoutDishRoles } from '@/lib/dish-presets'
import { normalizeProteinPreferences } from '@/lib/protein-preferences'
import { createClient } from '@/lib/supabase/server'
import { buildRecommendationPlan } from '@/lib/recommendation/pipeline'
import { buildCompactGapPrompt, buildMenuCreationBrief } from '@/lib/recommendation/brief'
import { MENU_PROPOSAL_SCHEMA, parseMenuProposal, type LLMMenuProposal } from '@/lib/recommendation/proposal'
import { callGeminiJson } from '@/lib/gemini'
import { planMenuReplacement, type DesiredMenuDish, type ExistingMenuRow } from '@/lib/recommendation/persistence'
import { repairWithLimit, validateFinalMenu, type FinalDish } from '@/lib/recommendation/validator'

export const runtime = 'nodejs'
export const maxDuration = 10

function currentMonday(): string {
  const d = new Date()
  const diff = d.getDay() === 0 ? -6 : 1 - d.getDay()
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)
}

export async function POST(req: Request) {
  const startedAt = Date.now()
  let body: { eventId?: unknown; userId?: unknown }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (typeof body.eventId !== 'string' || typeof body.userId !== 'string') {
    return NextResponse.json({ error: 'Missing event identifier' }, { status: 400 })
  }

  const supabase = createClient()
  const loadStarted = Date.now()
  const { data: event } = await supabase.from('events').select('host_id,chef_id').eq('id', body.eventId).maybeSingle()
  if (!event || event.host_id !== body.userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const chefId = event.chef_id ?? event.host_id
  const [{ data: rsvps }, { data: signatures }, { data: pantry }, { data: menu }] = await Promise.all([
    supabase.from('rsvps').select('user_id,users(name)').eq('event_id', body.eventId).in('status', ['going', 'maybe']),
    supabase.from('signatures').select('id,name,tags,contains_allergens,slot').eq('chef_id', chefId),
    supabase.from('pantry_items').select('id,name,tags,contains_allergens').eq('chef_id', chefId).eq('week_of', currentMonday()),
    supabase.from('menus').select('id').eq('event_id', body.eventId).maybeSingle(),
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
  const intel = buildIntel(guests)
  const trustedSignatures: Signature[] = (signatures ?? []).map((item) => ({ ...item, slot: item.slot ?? inferSlot(item.name, item.tags) }))
  const trustedPantry: PantryItem[] = (pantry ?? []).map((item) => ({ ...item, tags: withoutDishRoles(item.tags) }))
  if(!menu)return NextResponse.json({error:'Menu not found'},{status:404})
  const {data:existingRows}=await supabase.from('menu_courses').select('*').eq('menu_id',menu.id).order('sort_order',{ascending:true})
  const existing=(existingRows??[]) as ExistingMenuRow[],lockedSignatures=existing.filter(row=>row.locked&&row.source).map(row=>trustedSignatures.find(sig=>sig.id===row.source)).filter(Boolean) as Signature[]
  const plan=buildRecommendationPlan(guests,trustedSignatures,trustedPantry,lockedSignatures),brief=buildMenuCreationBrief(plan),dataLoadMs=Date.now()-loadStarted
  let proposal:LLMMenuProposal={signatureRefinements:[],generatedDishes:[]},modelMs=0,usedFallback=false
  if(plan.gaps.length){const modelStarted=Date.now();try{const raw=await callGeminiJson(buildCompactGapPrompt(brief),MENU_PROPOSAL_SCHEMA);modelMs=Date.now()-modelStarted;const parsed=parseMenuProposal(raw,brief);if(!parsed.ok)return NextResponse.json({error:'Invalid model proposal',validationErrors:parsed.errors},{status:422});proposal=parsed.proposal}catch(error){modelMs=Date.now()-modelStarted;usedFallback=true;return NextResponse.json({error:error instanceof Error?error.message:'Generation failed',usedFallback:true},{status:503})}}
  const initialDishes:FinalDish[]=[...plan.selected.map(item=>({name:item.signature.name,role:item.role,origin:'signature' as const,baseSignatureName:item.signature.name,usedAvailableIngredients:[],missingIngredients:[],locked:existing.some(row=>row.locked&&row.source===item.signature.id)})),...proposal.generatedDishes.map(item=>({name:item.finalName,role:item.role,origin:'generated' as const,usedAvailableIngredients:item.usedAvailableIngredients,missingIngredients:item.missingIngredients}))]
  const validationStarted=Date.now(),validate=(dishes:FinalDish[])=>validateFinalMenu({dishes,target:plan.targetDishCount,guests,signatures:trustedSignatures,pantry:trustedPantry})
  const repaired=await repairWithLimit(initialDishes,validate,async(dishes,issue)=>{const index=issue.dishIndex??dishes.findIndex(d=>!d.locked);if(index<0||dishes[index]?.locked)return null;const gap=brief.gaps[0];if(!gap)return null;const repairBrief={...brief,event:{...brief.event,missingDishCount:1},selectedSignatures:dishes.filter((_,i)=>i!==index&&dishes[i].origin==='signature').map(d=>({name:d.name,role:d.role,mayBeRefined:false})),gaps:[{...gap,culinaryGoal:`Replace ${dishes[index].name}: ${issue.message}`,avoid:dishes.filter((_,i)=>i!==index).map(d=>d.name)}]};try{const raw=await callGeminiJson<LLMMenuProposal>(buildCompactGapPrompt(repairBrief),MENU_PROPOSAL_SCHEMA);const parsed=parseMenuProposal(raw,repairBrief);if(!parsed.ok||parsed.proposal.generatedDishes.length!==1)return null;const d=parsed.proposal.generatedDishes[0];return{index,dish:{name:d.finalName,role:d.role,origin:'generated',usedAvailableIngredients:d.usedAvailableIngredients,missingIngredients:d.missingIngredients}}}catch{return null}},2)
  const validationMs=Date.now()-validationStarted
  if(!repaired.result.valid)return NextResponse.json({error:'Menu validation failed',validationErrors:repaired.result.issues,repairAttempts:repaired.attempts,warning:repaired.warning},{status:422})
  const desired:DesiredMenuDish[]=repaired.result.normalized.map(item=>({role:item.role,dish_name:item.name,dish_origin:item.origin.startsWith('signature')?'signature':'pantry-composed',source:item.sourceId??null,component_ids:item.componentIds??null}))
  const replacement=planMenuReplacement(existing,desired,plan.targetDishCount)
  await Promise.all(replacement.preserve.map(row=>supabase.from('menu_courses').update({sort_order:row.sort_order,slot:row.role??row.slot}).eq('id',row.id)))
  let inserted:ExistingMenuRow[]=[]
  if(replacement.insert.length){const {data,error}=await supabase.from('menu_courses').insert(replacement.insert.map(row=>({menu_id:menu.id,slot:row.role,dish_name:row.dish_name,dish_origin:row.dish_origin,source:row.source,component_ids:row.component_ids??null,locked:false,sort_order:row.sort_order}))).select('*');if(error)return NextResponse.json({error:'Failed to persist menu'},{status:500});inserted=(data??[]) as ExistingMenuRow[]}
  if(replacement.removeIds.length){const {error}=await supabase.from('menu_courses').delete().in('id',replacement.removeIds);if(error){if(inserted.length)await supabase.from('menu_courses').delete().in('id',inserted.map(row=>row.id));return NextResponse.json({error:'Failed to remove stale menu rows'},{status:500})}}
  const rows=[...replacement.preserve,...inserted].sort((a,b)=>a.sort_order-b.sort_order)
  console.info(JSON.stringify({scope:'menu_generation',dataLoadMs,promptChars:plan.gaps.length?buildCompactGapPrompt(brief).length:0,modelMs,validationMs,repairAttempts:repaired.attempts,totalMs:Date.now()-startedAt,model:process.env.GEMINI_MENU_MODEL||'gemini-3.5-flash-lite',guestCount:intel.guestCount,targetDishCount:plan.targetDishCount,selectedSignatureCount:plan.selected.length,generatedDishCount:proposal.generatedDishes.length,ingredientContextCount:plan.ingredients.length,categoryBreakdown:plan.retrievalDiagnostics.categoryBreakdown,usedFallback}))
  return NextResponse.json({rows,aiFailed:false,repairAttempts:repaired.attempts,reasoningByName:Object.fromEntries(proposal.generatedDishes.map(d=>[d.finalName,d.reasoning]))})
}
