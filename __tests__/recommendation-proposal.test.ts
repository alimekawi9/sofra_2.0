import { parseMenuProposal } from '@/lib/recommendation/proposal'
import type { MenuCreationBrief } from '@/lib/recommendation/brief'

const brief:MenuCreationBrief={event:{guestCount:4,targetDishCount:4,missingDishCount:1},selectedSignatures:[{name:'Chicken',role:'main',mayBeRefined:false}],gaps:[{requestedRole:'side',substantialRequired:false,culinaryGoal:'Fresh side',underservedNeed:[],proteinDirections:[],flavorDirections:['fresh'],avoid:['Chicken']}],availableIngredientsByCategory:[{category:'vegetables',names:['Tomato']}],constraints:['nuts'],purchaseRules:{maximumMissingPerDish:3,maximumCoreMissingPerDish:1,maximumUniqueMissingAcrossMenu:4}}
const valid={signatureRefinements:[],generatedDishes:[{role:'side',finalName:'Tomato salad',usedAvailableIngredients:['Tomato'],missingIngredients:[],reasoning:'Fresh contrast.'}]}

test('strict parser accepts exact M and canonical pantry lineage',()=>expect(parseMenuProposal(valid,brief).ok).toBe(true))
test('strict parser rejects wrong count and invented available ingredients',()=>{const result=parseMenuProposal({...valid,generatedDishes:[...valid.generatedDishes,{...valid.generatedDishes[0],usedAvailableIngredients:['Invented']}]},brief);expect(result.ok).toBe(false);if(!result.ok)expect(result.errors.join(' ')).toMatch(/dish-count|pantry-lineage/)})
test('strict parser rejects unselected signature lineage',()=>{const result=parseMenuProposal({...valid,signatureRefinements:[{baseSignatureName:'Fish',finalName:'Fish 2',usedAvailableIngredients:[],missingIngredients:[],reasoning:'Refined.'}]},brief);expect(result.ok).toBe(false)})
