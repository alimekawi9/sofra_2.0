import { buildIntel } from '@/lib/intel'
import { inferIngredientAllergens, parseIngredientLines, recipeSafetyWarnings, scaleRecipeIngredients, type RecipeIngredient } from '@/lib/recipes'

const ingredient=(name:string,amount=2,allergens:string[]=[]):RecipeIngredient=>({ingredient_name:name,quantity_amount:amount,quantity_unit:'cups',tags:[],contains_allergens:allergens,sort_order:0})
const intel=buildIntel([{name:'Guest A',dietary:[],avoid:['nuts'],proteinPreferences:[],flavorPreference:[],adventurousness:50}])

test('recipe quantities scale deterministically without changing stored amounts',()=>{const original=ingredient('Rice',2),scaled=scaleRecipeIngredients([original],4,10);expect(scaled[0].scaled_amount).toBe(5);expect(original.quantity_amount).toBe(2)})

test('ingredient names infer canonical allergens',()=>{expect(inferIngredientAllergens('Roasted peanuts')).toContain('nuts');expect(inferIngredientAllergens('Greek yogurt')).toContain('dairy')})

test('recipe-level allergen warning identifies a dish metadata gap',()=>{const warnings=recipeSafetyWarnings([ingredient('Peanut sauce')],intel,[]);expect(warnings).toEqual([{guest:'Guest A',allergen:'nuts',ingredient:'Peanut sauce',dishMetadataGap:true}])})

test('known dish allergen remains visible but is not mislabeled as a metadata gap',()=>{const warnings=recipeSafetyWarnings([ingredient('Peanut sauce')],intel,[{guest:'Guest A',reason:'contains nuts',kind:'allergy'}]);expect(warnings[0].dishMetadataGap).toBe(false)})

test('host ingredient lines preserve quantities and explicit allergens',()=>{expect(parseIngredientLines('1.5 | cups | flour | gluten')[0]).toMatchObject({quantity_amount:1.5,quantity_unit:'cups',ingredient_name:'flour',contains_allergens:['gluten']})})
