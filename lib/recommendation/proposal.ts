import type { DishRole } from './config'
import type { MenuCreationBrief } from './brief'

export type MissingIngredient={name:string;importance:'core'|'supporting'|'optional'}
export type SignatureRefinement={baseSignatureName:string;finalName:string;usedAvailableIngredients:string[];missingIngredients:MissingIngredient[];reasoning:string}
export type GeneratedDish={role:DishRole;finalName:string;usedAvailableIngredients:string[];missingIngredients:MissingIngredient[];reasoning:string}
export type LLMMenuProposal={signatureRefinements:SignatureRefinement[];generatedDishes:GeneratedDish[]}
export type ProposalParseResult={ok:true;proposal:LLMMenuProposal}|{ok:false;errors:string[]}

const roles=new Set<DishRole>(['starter','main','side','dessert','flex'])
const importances=new Set(['core','supporting','optional'])
const strings=(x:unknown):x is string[]=>Array.isArray(x)&&x.every(v=>typeof v==='string')
const missing=(x:unknown):x is MissingIngredient[]=>Array.isArray(x)&&x.every(v=>!!v&&typeof v==='object'&&typeof (v as MissingIngredient).name==='string'&&importances.has((v as MissingIngredient).importance))

export function parseMenuProposal(raw:unknown,brief:MenuCreationBrief):ProposalParseResult{
  const errors:string[]=[]
  if(!raw||typeof raw!=='object')return{ok:false,errors:['schema: response must be an object']}
  const x=raw as Partial<LLMMenuProposal>,refs=x.signatureRefinements,dishes=x.generatedDishes
  if(!Array.isArray(refs))errors.push('schema: signatureRefinements must be an array')
  if(!Array.isArray(dishes))errors.push('schema: generatedDishes must be an array')
  if(errors.length)return{ok:false,errors}
  if(dishes!.length!==brief.event.missingDishCount)errors.push(`dish-count: expected ${brief.event.missingDishCount}, received ${dishes!.length}`)
  const available=new Set(brief.availableIngredientsByCategory.flatMap(g=>g.names)),selected=new Set(brief.selectedSignatures.map(s=>s.name))
  for(let i=0;i<dishes!.length;i++){const d=dishes![i]
    if(!d||typeof d.finalName!=='string'||!roles.has(d.role)||!strings(d.usedAvailableIngredients)||!missing(d.missingIngredients)||typeof d.reasoning!=='string')errors.push(`schema: generatedDishes[${i}] is malformed`)
    else{if(d.reasoning.trim().split(/\s+/).length>20)errors.push(`schema: generatedDishes[${i}] reasoning exceeds 20 words`);for(const name of d.usedAvailableIngredients)if(!available.has(name))errors.push(`pantry-lineage: ${name} was not supplied`)}
  }
  for(let i=0;i<refs!.length;i++){const r=refs![i]
    if(!r||typeof r.baseSignatureName!=='string'||typeof r.finalName!=='string'||!strings(r.usedAvailableIngredients)||!missing(r.missingIngredients)||typeof r.reasoning!=='string')errors.push(`schema: signatureRefinements[${i}] is malformed`)
    else{if(!selected.has(r.baseSignatureName))errors.push(`signature-lineage: ${r.baseSignatureName} was not selected`);for(const name of r.usedAvailableIngredients)if(!available.has(name))errors.push(`pantry-lineage: ${name} was not supplied`)}
  }
  return errors.length?{ok:false,errors}:{ok:true,proposal:x as LLMMenuProposal}
}

export const MENU_PROPOSAL_SCHEMA={type:'object',additionalProperties:false,required:['signatureRefinements','generatedDishes'],properties:{signatureRefinements:{type:'array',items:{type:'object',additionalProperties:false,required:['baseSignatureName','finalName','usedAvailableIngredients','missingIngredients','reasoning'],properties:{baseSignatureName:{type:'string'},finalName:{type:'string',maxLength:40},usedAvailableIngredients:{type:'array',items:{type:'string'}},missingIngredients:{$ref:'#/$defs/missing'},reasoning:{type:'string',maxLength:0}}}},generatedDishes:{type:'array',items:{type:'object',additionalProperties:false,required:['role','finalName','usedAvailableIngredients','missingIngredients','reasoning'],properties:{role:{type:'string',enum:['starter','main','side','dessert','flex']},finalName:{type:'string',maxLength:40},usedAvailableIngredients:{type:'array',items:{type:'string'}},missingIngredients:{$ref:'#/$defs/missing'},reasoning:{type:'string',maxLength:0}}}}},$defs:{missing:{type:'array',maxItems:3,items:{type:'object',additionalProperties:false,required:['name','importance'],properties:{name:{type:'string',maxLength:30},importance:{type:'string',enum:['core','supporting','optional']}}}}}} as const
