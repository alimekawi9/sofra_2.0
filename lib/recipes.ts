import type { Exclusion, PantryItem } from './menu'
import { scoreDish } from './menu'
import type { TableIntel } from './intel'
import { inferIngredientAllergens } from './ingredient-safety'
export { inferIngredientAllergens } from './ingredient-safety'

export type RecipeSource='host_provided'|'ai_generated'
export type RecipeIngredient={id?:string;ingredient_name:string;quantity_amount:number;quantity_unit:string;tags:string[];contains_allergens:string[];sort_order:number;pantry_item_id?:string|null}
export type Recipe={id:string;menu_course_id:string;source:RecipeSource;base_servings:number;instructions:string;ingredients:RecipeIngredient[]}
export type ScaledRecipeIngredient=RecipeIngredient&{scaled_amount:number}

export function scaleRecipeIngredients(ingredients:RecipeIngredient[],baseServings:number,guestCount:number):ScaledRecipeIngredient[]{if(!Number.isFinite(baseServings)||baseServings<=0||!Number.isFinite(guestCount)||guestCount<0)throw new Error('Invalid serving count');const factor=guestCount/baseServings;return ingredients.map(item=>({...item,scaled_amount:item.quantity_amount*factor}))}

export type RecipeSafetyWarning={guest:string;allergen:string;ingredient:string;dishMetadataGap:boolean}
export function recipeSafetyWarnings(ingredients:RecipeIngredient[],intel:TableIntel,dishExclusions:Exclusion[]):RecipeSafetyWarning[]{const known=new Set(dishExclusions.filter(x=>x.kind==='allergy').map(x=>`${x.guest}|${x.reason.replace(/^.*contains\s+/,'').toLowerCase()}`)),seen=new Set<string>(),warnings:RecipeSafetyWarning[]=[];for(const ingredient of ingredients){const allergens=Array.from(new Set([...(ingredient.contains_allergens??[]),...inferIngredientAllergens(ingredient.ingredient_name)]));const item:PantryItem={id:ingredient.id??ingredient.ingredient_name,name:ingredient.ingredient_name,tags:ingredient.tags??[],contains_allergens:allergens};for(const exclusion of scoreDish(item,intel).filter(x=>x.kind==='allergy')){const allergen=exclusion.reason.replace(/^.*contains\s+/,'').replace(/^.*contain\s+/,'').toLowerCase(),key=`${exclusion.guest}|${allergen}`;if(seen.has(key))continue;seen.add(key);warnings.push({guest:exclusion.guest,allergen,ingredient:ingredient.ingredient_name,dishMetadataGap:!known.has(key)})}}return warnings}

export function parseIngredientLines(value:string):RecipeIngredient[]{return value.split('\n').map(line=>line.trim()).filter(Boolean).map((line,index)=>{const [amount,unit,name,allergens='']=line.split('|').map(x=>x.trim());const quantity=Number(amount);if(!Number.isFinite(quantity)||quantity<0||!unit||!name)throw new Error(`Ingredient line ${index+1} must be: amount | unit | ingredient | optional allergens`);return{ingredient_name:name,quantity_amount:quantity,quantity_unit:unit,tags:[],contains_allergens:Array.from(new Set([...allergens.split(',').map(x=>x.trim().toLowerCase()).filter(Boolean),...inferIngredientAllergens(name)])),sort_order:index}})}
