import type { TasteProfile } from '@/lib/intel'
import type { PantryItem, Signature } from '@/lib/menu'
import { buildMenuCreationBrief } from './brief'
import { buildRecommendationPlan } from './pipeline'
import { requiredSatisfyingDishCount } from './planning'

export function inspectPreLlmPipeline(guests:TasteProfile[],signatures:Signature[],pantry:PantryItem[],locked:Signature[]=[]){
  const plan=buildRecommendationPlan(guests,signatures,pantry,locked),compactBrief=buildMenuCreationBrief(plan),counts=plan.residuals.map(r=>r.satisfying),selectedUnlocked=plan.selected.length-plan.lockedCount,M=plan.gaps.length
  if(M!==plan.targetDishCount-selectedUnlocked-plan.lockedCount)throw new Error(`Pre-LLM invariant failed: ${M} != ${plan.targetDishCount} - ${selectedUnlocked} - ${plan.lockedCount}`)
  return{guestCount:plan.guestCount,N:plan.targetDishCount,signatureCandidates:plan.signatureCandidates,selectedSignatures:plan.selected.map(x=>x.signature.name),M,invariant:`M = ${plan.targetDishCount} - ${selectedUnlocked} selected unlocked - ${plan.lockedCount} locked = ${M}`,dinerCoverage:{satisfyingTarget:requiredSatisfyingDishCount(plan.targetDishCount),underServedCount:plan.residuals.filter(r=>r.value>0).length,minimumSatisfyingCount:counts.length?Math.min(...counts):0,averageSatisfyingCount:counts.length?counts.reduce((a,b)=>a+b,0)/counts.length:0},gaps:plan.gaps.map(g=>({...g,underservedDinerSummary:g.underservedDinerSummary.map(x=>x.replace(/^.*?:\s*/,''))})),pantryRetrieval:{totalPantry:pantry.length,afterRolePrefilter:plan.retrievalDiagnostics.beforeThreshold,afterThreshold:plan.retrievalDiagnostics.afterThreshold,afterCategoryCaps:plan.retrievalDiagnostics.afterCategoryCeilings,afterMMR:plan.retrievalDiagnostics.afterMmr,finalIngredientNames:plan.ingredients.map(x=>x.item.name)},compactBrief}
}
