import { normalizeDishScoringData } from '@/lib/dish-scoring'
import { DISH_PRESETS } from '@/lib/dish-presets'

test('normalizes canonical tag dimensions without parallel fields',()=>{
  expect(normalizeDishScoringData({tags:['main','lamb','veg','rich','spicy','tender','braised','hot'],contains_allergens:['Dairy'],novelty_score:.75,is_substantial:true})).toEqual({role:'main',proteinBases:['lamb'],dietary:['veg'],flavors:['rich','spicy'],textures:['tender'],techniques:['braised'],temperatures:['hot'],richness:['rich'],noveltyScore:.75,substantial:true,allergens:['dairy']})
})

test.each([
  ['Tabbouleh',['vegetable','grain','fresh','acidic','raw','cold'],.25,false],
  ['Tzatziki',['dairy','fresh','acidic','creamy','raw','chilled'],.25,false],
  ['Lamb Rogan Josh',['lamb','rich','spicy','braised','hot'],.75,true],
] as const)('%s preset carries saved scoring metadata',(name,tags,novelty,substantial)=>{const preset=DISH_PRESETS.find(item=>item.name===name)!;expect(preset.tags).toEqual(expect.arrayContaining([...tags]));expect(preset.novelty_score).toBe(novelty);expect(preset.is_substantial).toBe(substantial)})

test('explicit substantial metadata takes precedence over role fallback',()=>{expect(normalizeDishScoringData({tags:['main'],contains_allergens:[],is_substantial:false}).substantial).toBe(false);expect(normalizeDishScoringData({tags:['main'],contains_allergens:[]}).substantial).toBe(true)})
