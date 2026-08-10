import type { DishRole } from './config'
import type { MenuCreationBrief } from './brief'

export type MissingIngredient={name:string;importance:'core'|'supporting'|'optional'}
export type SignatureRefinement={baseSignatureName:string;finalName:string;usedAvailableIngredients:string[];missingIngredients:MissingIngredient[];reasoning:string}
export type GeneratedDishMetadata={proteinBase:string[];flavors:string[];textures:string[];techniques:string[];temperature:string[];richness:string[];noveltyScore:number|null;dietary:string[];allergens:string[];substantial:boolean}
export type GeneratedDish={role:DishRole;finalName:string;usedAvailableIngredients:string[];missingIngredients:MissingIngredient[];reasoning:string;metadata:GeneratedDishMetadata}
export type LLMMenuProposal={signatureRefinements:SignatureRefinement[];generatedDishes:GeneratedDish[]}
export type ProposalParseResult={ok:true;proposal:LLMMenuProposal}|{ok:false;errors:string[]}

const roles=new Set<DishRole>(['starter','main','side','dessert','flex'])
const importances=new Set(['core','supporting','optional'])
const strings=(x:unknown):x is string[]=>Array.isArray(x)&&x.every(v=>typeof v==='string')
const missing=(x:unknown):x is MissingIngredient[]=>Array.isArray(x)&&x.every(v=>!!v&&typeof v==='object'&&typeof (v as MissingIngredient).name==='string'&&importances.has((v as MissingIngredient).importance))
const key=(value:string)=>value.trim().toLowerCase().replace(/[^a-z0-9]+/g,' ')
const truncateReasoning=(value:string)=>value.trim().split(/\s+/).filter(Boolean).slice(0,20).join(' ')
const VOCAB={proteinBase:['beef','lamb','chicken','turkey','pork','duck','fish','shellfish','egg','dairy','legume','tofu','mushroom','grain','pasta','vegetable','fruit','mixed','none'],flavors:['fresh','rich','spicy','sweet','smoky','acidic','earthy','umami'],textures:['crunchy','tender','chewy','juicy','silky','flaky','firm','mild','bitter','savory','herbal','crispy','soft','creamy'],techniques:['braised','baked','steamed','boiled','seared','smoked','stewed','pickled','raw','grilled','roasted','fried'],temperature:['chilled','hot','cold','room_temperature'],richness:['rich','fresh'],dietary:['veg','vegetarian','vegan','pescatarian','no pork','kosher','halal','gluten-free','no dairy','meat','seafood'],allergens:['nuts','shellfish','dairy','eggs','gluten','soy','sesame','mustard','celery','sulfites','lupin','molluscs']} as const
const validMetadata=(x:unknown):x is GeneratedDishMetadata=>{if(!x||typeof x!=='object')return false;const m=x as Record<string,unknown>;return Object.entries(VOCAB).every(([k,v])=>strings(m[k])&&(m[k] as string[]).every(x=>(v as readonly string[]).includes(x)))&&(m.noveltyScore===null||[.1,.25,.5,.75,.95].includes(m.noveltyScore as number))&&typeof m.substantial==='boolean'}

export function parseMenuProposal(raw:unknown,brief:MenuCreationBrief):ProposalParseResult{
  const errors:string[]=[]
  if(!raw||typeof raw!=='object')return{ok:false,errors:['schema: response must be an object']}
  const x=raw as Partial<LLMMenuProposal>,refs=x.signatureRefinements,dishes=x.generatedDishes
  if(!Array.isArray(refs))errors.push('stage=schema_validation field=signatureRefinements expected=array')
  if(!Array.isArray(dishes))errors.push('stage=schema_validation field=generatedDishes expected=array')
  if(errors.length)return{ok:false,errors}
  if(dishes!.length!==brief.event.missingDishCount)errors.push(`stage=generated_dish_count_validation expected=${brief.event.missingDishCount} received=${dishes!.length}`)
  const availableNames=brief.availableIngredientsByCategory.flatMap(g=>g.names),available=new Map(availableNames.map(name=>[key(name),name])),selectedNames=brief.selectedSignatures.map(s=>s.name),selected=new Map(selectedNames.map(name=>[key(name),name]))
  for(let i=0;i<dishes!.length;i++){const d=dishes![i]
    if(!d||typeof d.finalName!=='string'||!roles.has(d.role)||!strings(d.usedAvailableIngredients)||!missing(d.missingIngredients)||typeof d.reasoning!=='string'||!validMetadata(d.metadata))errors.push(`stage=schema_validation field=generatedDishes[${i}]`)
    else{d.reasoning=truncateReasoning(d.reasoning);d.usedAvailableIngredients=d.usedAvailableIngredients.map(name=>{const canonical=available.get(key(name));if(!canonical)errors.push(`stage=pantry_name_validation dish="${d.finalName}" returned="${name}" allowed=${JSON.stringify(availableNames)}`);return canonical??name})}
  }
  for(let i=0;i<refs!.length;i++){const r=refs![i]
    if(!r||typeof r.baseSignatureName!=='string'||typeof r.finalName!=='string'||!strings(r.usedAvailableIngredients)||!missing(r.missingIngredients)||typeof r.reasoning!=='string')errors.push(`stage=schema_validation field=signatureRefinements[${i}]`)
    else{const canonicalBase=selected.get(key(r.baseSignatureName));if(!canonicalBase)errors.push(`stage=signature_lineage_validation returned="${r.baseSignatureName}" allowed=${JSON.stringify(selectedNames)}`);else r.baseSignatureName=canonicalBase;r.reasoning=truncateReasoning(r.reasoning);r.usedAvailableIngredients=r.usedAvailableIngredients.map(name=>{const canonical=available.get(key(name));if(!canonical)errors.push(`stage=pantry_name_validation dish="${r.finalName}" returned="${name}" allowed=${JSON.stringify(availableNames)}`);return canonical??name})}
  }
  return errors.length?{ok:false,errors}:{ok:true,proposal:x as LLMMenuProposal}
}

const enumArray=(values:readonly string[])=>({type:'array',items:{type:'string',enum:values}})
export const MENU_PROPOSAL_SCHEMA={type:'object',additionalProperties:false,required:['signatureRefinements','generatedDishes'],properties:{signatureRefinements:{type:'array',items:{type:'object',additionalProperties:false,required:['baseSignatureName','finalName','usedAvailableIngredients','missingIngredients','reasoning'],properties:{baseSignatureName:{type:'string'},finalName:{type:'string',maxLength:40},usedAvailableIngredients:{type:'array',items:{type:'string'}},missingIngredients:{$ref:'#/$defs/missing'},reasoning:{type:'string',maxLength:0}}}},generatedDishes:{type:'array',items:{type:'object',additionalProperties:false,required:['role','finalName','usedAvailableIngredients','missingIngredients','reasoning','metadata'],properties:{role:{type:'string',enum:['starter','main','side','dessert','flex']},finalName:{type:'string',maxLength:40},usedAvailableIngredients:{type:'array',items:{type:'string'}},missingIngredients:{$ref:'#/$defs/missing'},reasoning:{type:'string',maxLength:0},metadata:{type:'object',additionalProperties:false,required:['proteinBase','flavors','textures','techniques','temperature','richness','noveltyScore','dietary','allergens','substantial'],properties:{proteinBase:enumArray(VOCAB.proteinBase),flavors:enumArray(VOCAB.flavors),textures:enumArray(VOCAB.textures),techniques:enumArray(VOCAB.techniques),temperature:enumArray(VOCAB.temperature),richness:enumArray(VOCAB.richness),noveltyScore:{anyOf:[{type:'number',enum:[.1,.25,.5,.75,.95]},{type:'null'}]},dietary:enumArray(VOCAB.dietary),allergens:enumArray(VOCAB.allergens),substantial:{type:'boolean'}}}}}}},$defs:{missing:{type:'array',maxItems:3,items:{type:'object',additionalProperties:false,required:['name','importance'],properties:{name:{type:'string',maxLength:30},importance:{type:'string',enum:['core','supporting','optional']}}}}}} as const
