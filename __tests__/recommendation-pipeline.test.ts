import { buildRecommendationPlan, dinerDishFit } from '@/lib/recommendation/pipeline'
import { buildCompactGapPrompt, buildMenuCreationBrief } from '@/lib/recommendation/brief'
import type { TasteProfile } from '@/lib/intel'
import type { Signature } from '@/lib/menu'

const diner=(name:string,overrides:Partial<TasteProfile>={}):TasteProfile=>({name,dietary:[],avoid:[],proteinAnchor:null,proteinPreferences:['chicken'],flavorPreference:['savory'],adventurousness:25,...overrides})
const dish=(id:string,name:string,tags:string[],allergens:string[]=[]):Signature=>({id,name,tags,contains_allergens:allergens,slot:null})

test('allergen dish is excluded below 8 and contributes zero at 8',()=>{
  const allergic=diner('A',{avoid:['nuts']});const nutDish=dish('n','Nut chicken',['main','chicken','savory'],['nuts'])
  expect(dinerDishFit(allergic,nutDish,7).eligibility).toBe(0)
  expect(dinerDishFit(allergic,nutDish,8).q).toBe(0)
})

test('compact brief contains gap-only canonical data and no IDs or raw tags',()=>{
  const plan=buildRecommendationPlan([diner('Private Name')],[],[{id:'secret-id',name:'Rice',tags:['grain','savory'],contains_allergens:[]}])
  const brief=buildMenuCreationBrief(plan),prompt=buildCompactGapPrompt(brief)
  expect(brief.gaps).toHaveLength(plan.targetDishCount)
  expect(prompt).not.toContain('secret-id')
  expect(prompt).not.toContain('Private Name')
  expect(prompt).not.toContain('"tags"')
  expect(prompt).toContain(`exactly ${plan.gaps.length} generated dishes`)
})

test('category ceilings apply before MMR and overall K',()=>{
  const pantry=Array.from({length:30},(_,i)=>({id:`p${i}`,name:`Chicken ${i}`,tags:['chicken','savory'],contains_allergens:[]}))
  const plan=buildRecommendationPlan([diner('A'),diner('B')],[],pantry)
  expect(plan.retrievalDiagnostics.categoryBreakdown.proteins).toBeLessThanOrEqual(Math.min(7,2*plan.gaps.length+3))
  expect(plan.retrievalDiagnostics.afterThreshold).toBe(30)
  expect(plan.retrievalDiagnostics.afterCategoryCeilings).toBeLessThanOrEqual(7)
  expect(plan.ingredients.length).toBeLessThanOrEqual(plan.contextCeiling)
})

test('sequential selector produces dynamic gaps and MMR diagnostics',()=>{
  const guests=[diner('A'),diner('B')]
  const signatures=[dish('1','Chicken main',['main','chicken','savory','familiar']),dish('2','Chicken side',['side','chicken','savory','familiar']),dish('3','Fresh starter',['starter','vegetable','fresh','familiar'])]
  const pantry=[{id:'p1',name:'Tomato',tags:['vegetable','fresh'],contains_allergens:[]},{id:'p2',name:'Cherry tomato',tags:['vegetable','fresh'],contains_allergens:[]},{id:'p3',name:'Rice',tags:['grain','savory'],contains_allergens:[]},{id:'p4',name:'Mint',tags:['herb','fresh'],contains_allergens:[]}]
  const plan=buildRecommendationPlan(guests,signatures,pantry)
  expect(plan.targetDishCount).toBe(3)
  expect(plan.selected.length+plan.gaps.length).toBe(3)
  expect(plan.ingredients.every(item=>item.relevance>=.55)).toBe(true)
  expect(plan.ingredients.length).toBeLessThanOrEqual(plan.contextCeiling)
  expect(plan.ingredients.every(item=>item.mmr===.8*item.relevance-.2*item.redundancy)).toBe(true)
})

test('unknown novelty is neutral, no-preference protein is neutral, and crispy is sensory-matchable',()=>{
  const generated={id:'g',name:'Crispy vegetable bite',tags:['starter','vegetable','crispy'],contains_allergens:[],slot:null,novelty_score:null}
  const fit=dinerDishFit(diner('A',{proteinPreferences:['no_preference'],flavorPreference:['crispy'],adventurousness:90}),generated,4)
  expect(fit.protein).toBe(.65)
  expect(fit.flavor).toBe(1)
  expect(fit.adventurousness).toBe(.5)
  expect(dinerDishFit(diner('A',{dietary:['vegan']}),{...generated,tags:['starter','chicken','crispy']},4).eligibility).toBe(0)
})

test('coverage allocation assigns distinct diner obligations across enough gaps',()=>{
  const plan=buildRecommendationPlan([diner('A',{proteinPreferences:['chicken'],flavorPreference:['crispy']}),diner('B',{dietary:['vegetarian'],proteinPreferences:['no_preference'],flavorPreference:['spicy','umami']}),...Array.from({length:7},(_,i)=>diner(`Other ${i}`))],[],[])
  const a=plan.gaps.filter(g=>g.targetDiners.some(t=>t.dinerIndex===0)),b=plan.gaps.filter(g=>g.targetDiners.some(t=>t.dinerIndex===1))
  expect(plan.targetDishCount).toBe(7)
  expect(a).toHaveLength(4)
  expect(b).toHaveLength(4)
  expect(plan.gaps.some(g=>g.targetDiners.length>=2)).toBe(true)
  expect(a[0].targetDiners.find(t=>t.dinerIndex===0)?.proteinNeed).toEqual(['chicken'])
  expect(b[0].targetDiners.find(t=>t.dinerIndex===1)?.dietaryConstraints).toContain('vegetarian')
})
