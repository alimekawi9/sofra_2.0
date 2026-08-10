import { dishRoleFromTags, type DishRole } from './dish-presets'

export const NOVELTY_SCORES = [0.10, 0.25, 0.50, 0.75, 0.95] as const
export type NoveltyScore = (typeof NOVELTY_SCORES)[number]

export type DishScoringSource = {
  tags: readonly string[]
  contains_allergens: readonly string[]
  novelty_score?: number | null
  is_substantial?: boolean | null
}

export type NormalizedDishScoringData = {
  role: DishRole | null
  proteinBases: string[]
  dietary: string[]
  flavors: string[]
  textures: string[]
  techniques: string[]
  temperatures: string[]
  richness: string[]
  noveltyScore: NoveltyScore | null
  substantial: boolean | null
  allergens: string[]
}

export const DISH_SCORING_VOCABULARY = {
  proteinBases: ['beef','lamb','chicken','turkey','pork','duck','fish','shellfish','egg','dairy','legume','tofu','mushroom','grain','pasta','vegetable','fruit','mixed','none'],
  dietary: ['veg','vegetarian','vegan','pescatarian','no pork','kosher','halal','gluten-free','no dairy','meat','seafood'],
  flavors: ['fresh','rich','spicy','sweet','smoky','acidic','earthy','umami'],
  textures: ['crunchy','tender','chewy','juicy','silky','flaky','firm','mild','bitter','savory','herbal','crispy','soft','creamy'],
  techniques: ['braised','baked','steamed','boiled','seared','smoked','stewed','pickled','raw','grilled','roasted','fried'],
  temperatures: ['chilled','hot','cold','room_temperature'],
  richness: ['rich','fresh'],
} as const

const pick=(tags:Set<string>,values:readonly string[])=>values.filter(value=>tags.has(value))
const canonicalNovelty=(value:number|null|undefined):NoveltyScore|null=>NOVELTY_SCORES.includes(value as NoveltyScore)?value as NoveltyScore:null

export function normalizeDishScoringData(dish:DishScoringSource):NormalizedDishScoringData{
  const tags=new Set(dish.tags.map(tag=>tag.trim().toLowerCase()))
  const role=dishRoleFromTags(Array.from(tags))
  return{
    role,
    proteinBases:pick(tags,DISH_SCORING_VOCABULARY.proteinBases),
    dietary:pick(tags,DISH_SCORING_VOCABULARY.dietary),
    flavors:pick(tags,DISH_SCORING_VOCABULARY.flavors),
    textures:pick(tags,DISH_SCORING_VOCABULARY.textures),
    techniques:pick(tags,DISH_SCORING_VOCABULARY.techniques),
    temperatures:pick(tags,DISH_SCORING_VOCABULARY.temperatures),
    richness:pick(tags,DISH_SCORING_VOCABULARY.richness),
    noveltyScore:canonicalNovelty(dish.novelty_score),
    substantial:dish.is_substantial??(role==='main'?true:null),
    allergens:Array.from(new Set(dish.contains_allergens.map(value=>value.trim().toLowerCase()).filter(Boolean))),
  }
}
