import type { TasteProfile } from '@/lib/intel'
import type { PantryItem, Signature } from '@/lib/menu'
import { dishRoleByName, isDishRole } from '@/lib/dish-presets'
import { RECOMMENDATION_CONFIG, type DishRole } from './config'
import { calculateTargetDishCount, ingredientContextCeiling, requiredSatisfyingDishCount, requiredSubstantialDishCount, roleBlueprint, roleCeilings } from './planning'

type Fit = { eligibility: 0 | 1; protein: number; flavor: number; adventurousness: number; q: number }
type Residual = { name: string; satisfying: number; substantial: number; value: number }
export type ScoredSignature = { signature: Signature; role: DishRole; score: number; base: number; underserved: number; diversity: number; fits: Fit[] }
export type MenuGap = { requestedRole: DishRole; substantialRequired: boolean; underservedDinerSummary: string[]; dietaryConstraints: string[]; proteinDirections: string[]; flavorDirections: string[]; avoidRepetition: string[] }
export type IngredientDiagnostic = { item: PantryItem; category: string; relevance: number; redundancy: number; mmr: number }
export type RetrievalDiagnostics = { beforeThreshold:number; afterThreshold:number; afterCategoryCeilings:number; afterMmr:number; categoryBreakdown:Record<string,number> }
export type RecommendationPlan = { guestCount: number; targetDishCount: number; selected: ScoredSignature[]; residuals: Residual[]; gaps: MenuGap[]; ingredients: IngredientDiagnostic[]; contextCeiling: number; retrievalDiagnostics:RetrievalDiagnostics; insufficientData: boolean }

const HARD_DIETS = new Set(['vegetarian','vegan','gluten-free','no dairy','no pork','kosher','pescatarian'])
const ALLERGY_WORDS = new Set(['nuts','shellfish','dairy','eggs','gluten','soy','sesame','mustard','celery','sulfites','lupin','molluscs'])
const GROUPS: Record<string, string[]> = { flavor:['savory','fresh','spicy','smoky','rich','bright','sweet','tangy'], texture:['crispy','creamy','crunchy','tender','silky'], technique:['grilled','roasted','fried','braised','raw','baked'], protein:['beef','lamb','chicken','turkey','pork','duck','fish','shellfish','egg','dairy','legume','tofu','mushroom','grain','pasta','vegetable','fruit'], temperature:['hot','cold','room_temperature'], richness:['rich','fresh','light'] }
const lower = (xs: string[] = []) => xs.map(x => x.toLowerCase())
const clamp = (n: number) => Math.max(0, Math.min(1, n))
const jaccard = (a: string[], b: string[]) => { const A=new Set(a),B=new Set(b),u=new Set(a.concat(b)); return u.size?Array.from(A).filter(x=>B.has(x)).length/u.size:0 }
const group = (tags:string[], name:string) => Object.fromEntries(Object.entries(GROUPS).map(([k,v])=>[k,v.filter(x=>lower(tags).includes(x)||name.toLowerCase().includes(x))])) as Record<string,string[]>
const roleOf = (s: Signature): DishRole => lower(s.tags).find(isDishRole) as DishRole || dishRoleByName(s.name) || 'flex'
const substantial = (role:DishRole,tags:string[]) => role==='main'||lower(tags).includes('substantial')
const categoryOf=(item:PantryItem)=>{const text=`${item.name} ${item.tags.join(' ')}`.toLowerCase();if(['vegetable','fruit','tomato','pepper','aubergine','eggplant'].some(x=>text.includes(x)))return'vegetables';if(['grain','rice','pasta','bread','potato','starch','polenta'].some(x=>text.includes(x)))return'grains';if(['herb','aromatic','mint','parsley','cilantro','onion','garlic'].some(x=>text.includes(x)))return'herbs';if(GROUPS.protein.some(x=>text.includes(x)))return'proteins';return'sauces'}

export function dinerDishFit(diner:TasteProfile,dish:Pick<Signature,'name'|'tags'|'contains_allergens'>,guestCount:number):Fit {
  const tags=lower(dish.tags), allergens=lower(dish.contains_allergens), restrictions=lower(diner.dietary), avoids=lower(diner.avoid)
  const allergyConflict=[...allergens,...tags].some(x=>ALLERGY_WORDS.has(x)&&(avoids.includes(x)||restrictions.includes(x)))
  const dietConflict=restrictions.filter(x=>HARD_DIETS.has(x)).some(d=>d==='vegan'?!tags.includes('vegan'):d==='vegetarian'?!tags.some(x=>['veg','vegetarian','vegan'].includes(x)):d==='no pork'?tags.includes('pork'):d==='no dairy'?tags.includes('dairy'):d==='gluten-free'?tags.includes('gluten'):false)
  const eligibility:0|1=(dietConflict||(allergyConflict&&guestCount<RECOMMENDATION_CONFIG.allergy.largeGroupCutoff))?0:1
  if (allergyConflict&&guestCount>=RECOMMENDATION_CONFIG.allergy.largeGroupCutoff) return {eligibility:0,protein:0,flavor:0,adventurousness:0,q:0}
  const proteins=lower(diner.proteinPreferences??[]), dishProteins=group(tags,dish.name).protein
  const protein=proteins.length===0?.65:dishProteins.some(x=>proteins.some(p=>p.includes(x)||x.includes(p)))?1:dishProteins.length?.3:.65
  const flavors=lower(diner.flavorPreference), dishFlavors=group(tags,dish.name).flavor
  const flavor=flavors.length===0?.5:dishFlavors.length?clamp(dishFlavors.filter(x=>flavors.includes(x)).length/flavors.length):.5
  const novelty=tags.includes('very_unusual')?.95:tags.includes('adventurous')?.75:tags.includes('uncommon')?.5:tags.includes('familiar')?.25:.1
  const adventurousness=1-Math.abs((diner.adventurousness??50)/100-novelty)
  return {eligibility,protein,flavor,adventurousness,q:eligibility*clamp(.45*protein+.35*flavor+.2*adventurousness)}
}

function similarity(a:Signature,b:Signature){const A=group(a.tags,a.name),B=group(b.tags,b.name);return .3*jaccard(A.flavor,B.flavor)+.2*jaccard(A.texture,B.texture)+.15*jaccard(A.technique,B.technique)+.15*jaccard(A.protein,B.protein)+.1*jaccard(A.temperature,B.temperature)+.1*jaccard(A.richness,B.richness)}

export function buildRecommendationPlan(guests:TasteProfile[],signatures:Signature[],pantry:PantryItem[],locked:Signature[]=[]):RecommendationPlan{
  const G=guests.length,N=Math.max(calculateTargetDishCount(G),locked.length),prefTarget=requiredSatisfyingDishCount(N),subTarget=requiredSubstantialDishCount(N),blue=roleBlueprint(N),ceil=roleCeilings(N)
  const selected:ScoredSignature[]=[], remaining=signatures.filter(s=>!locked.some(l=>l.id===s.id)), counts:Record<string,number>={starter:0,main:0,side:0,dessert:0,flex:0}
  const residual=():Residual[]=>guests.map((g,i)=>{const sat=selected.filter(s=>s.fits[i]?.q>=.6).length,sub=selected.filter(s=>s.fits[i]?.eligibility&&substantial(s.role,s.signature.tags)).length;return{name:g.name,satisfying:sat,substantial:sub,value:Math.max(0,1-sat/prefTarget,1-sub/subTarget)}})
  const add=(s:Signature)=>{const fits=guests.map(g=>dinerDishFit(g,s,G));const role=roleOf(s);selected.push({signature:s,role,score:1,base:1,underserved:1,diversity:.5,fits});counts[role]++}
  locked.forEach(add)
  while(selected.length<N&&remaining.length){const rs=residual(),sumR=rs.reduce((a,r)=>a+r.value,0);const candidates=remaining.map(signature=>{const role=roleOf(signature);if(role!=='flex'&&counts[role]>=(ceil as Record<string,number>)[role])return null;const fits=guests.map(g=>dinerDishFit(g,signature,G));if(G<8&&fits.some(f=>!f.eligibility))return null;const avg=(f:(x:Fit)=>number)=>G?fits.reduce((a,x)=>a+f(x),0)/G:0;const U=sumR?fits.reduce((a,f,i)=>a+rs[i].value*(f.q>=.6?1:0),0)/sumR:0;const B=.45*avg(f=>f.q)+.25*avg(f=>f.q>=.6?1:0)+.15*avg(f=>f.eligibility)+.15*U;const roleNeed=role==='flex'?.5:counts[role]<((blue as Record<string,number>)[role]??0)?1:.5;const diversity=selected.length?1-Math.max(...selected.map(x=>similarity(signature,x.signature))):.5;const score=.75*B+.15*roleNeed+.1*diversity;return{signature,role,score,base:B,underserved:U,diversity,fits}}).filter(Boolean) as ScoredSignature[]
    candidates.sort((a,b)=>b.score-a.score);const best=candidates.find(c=>c.score>=.7||(c.score>=.58&&c.underserved>=.6&&substantial(c.role,c.signature.tags)));if(!best)break;selected.push(best);counts[best.role]++;remaining.splice(remaining.findIndex(s=>s.id===best.signature.id),1)
  }
  const residuals=residual(),under=residuals.filter(r=>r.value>0),missing=N-selected.length,roles=Object.entries(blue).flatMap(([r,n])=>Array(Math.max(0,(n??0)-(counts[r]??0))).fill(r as DishRole));while(roles.length<missing)roles.push('flex')
  const flavors=Array.from(new Set(guests.flatMap((g,i)=>residuals[i].value>0?lower(g.flavorPreference):[]))),proteins=Array.from(new Set(guests.flatMap((g,i)=>residuals[i].value>0?lower(g.proteinPreferences??[]):[])))
  const constraints=Array.from(new Set(guests.flatMap(g=>g.dietary.concat(g.avoid))))
  const gaps=Array.from({length:missing},(_,i)=>({requestedRole:roles[i]??'flex',substantialRequired:under.some(r=>r.substantial<subTarget),underservedDinerSummary:under.map(r=>`${r.name}: needs ${Math.max(0,prefTarget-r.satisfying)} satisfying, ${Math.max(0,subTarget-r.substantial)} substantial`),dietaryConstraints:constraints,proteinDirections:proteins,flavorDirections:flavors,avoidRepetition:selected.map(s=>s.signature.name)}))
  const cap=ingredientContextCeiling(missing), scored=pantry.map(item=>{const tags=lower(item.tags),gapFit=gaps.some(g=>g.requestedRole==='dessert'?tags.some(t=>['fruit','dairy','sweet'].includes(t)):g.substantialRequired?tags.some(t=>GROUPS.protein.includes(t)):true)?1:.2;const dinerFit=tags.some(t=>proteins.concat(flavors).includes(t))?1:.5;const relevance=.4*gapFit+.3*dinerFit+.2*.7+.1*.7;return{item,category:categoryOf(item),relevance,redundancy:0,mmr:0}}),thresholded=scored.filter(x=>x.relevance>=.55)
  const limits:Record<string,number>={proteins:Math.min(7,2*missing+3),vegetables:Math.min(8,2*missing+4),grains:Math.min(5,missing+2),herbs:Math.min(6,missing+3),sauces:Math.min(6,missing+3)},seen:Record<string,number>={};const diagnostics=thresholded.sort((a,b)=>b.relevance-a.relevance).filter(x=>{seen[x.category]=(seen[x.category]??0)+1;return seen[x.category]<=limits[x.category]})
  const afterCategoryCeilings=diagnostics.length,ingredients:IngredientDiagnostic[]=[];while(ingredients.length<cap&&diagnostics.length){for(const d of diagnostics){d.redundancy=ingredients.length?Math.max(...ingredients.map(s=>jaccard(lower(d.item.tags),lower(s.item.tags)))):0;d.mmr=.8*d.relevance-.2*d.redundancy}diagnostics.sort((a,b)=>b.mmr-a.mmr);ingredients.push(diagnostics.shift()!)}
  const breakdown:Record<string,number>={};ingredients.forEach(x=>breakdown[x.category]=(breakdown[x.category]??0)+1)
  return{guestCount:G,targetDishCount:N,selected,residuals,gaps,ingredients,contextCeiling:cap,retrievalDiagnostics:{beforeThreshold:scored.length,afterThreshold:thresholded.length,afterCategoryCeilings,afterMmr:ingredients.length,categoryBreakdown:breakdown},insufficientData:selected.every(s=>s.score<.7)&&ingredients.length<4}
}
