const ALLERGEN_TERMS: Record<string, string[]> = {
  nuts: ['nut','nuts','peanut','peanuts','almond','almonds','cashew','cashews','pistachio','pistachios','walnut','walnuts','pecan','pecans','hazelnut','hazelnuts'],
  shellfish: ['shellfish','shrimp','prawn','prawns','crab','lobster'],
  molluscs: ['mussel','mussels','clam','clams','oyster','oysters','scallop','scallops','squid','octopus'],
  dairy: ['milk','cream','butter','cheese','yogurt','yoghurt','whey','ghee'],
  eggs: ['egg','eggs','mayonnaise','mayo'],
  gluten: ['flour','wheat','bread','breadcrumbs','pasta','couscous','barley','rye','bulgur'],
  soy: ['soy','tofu','tempeh','miso','edamame'],
  sesame: ['sesame','tahini'], mustard: ['mustard'], celery: ['celery'],
  sulfites: ['sulfite','sulfites'], lupin: ['lupin'],
}
const PORK = ['pork','bacon','ham','prosciutto','pancetta','chorizo','lard','guanciale']
const LAND_MEAT = [...PORK,'beef','veal','lamb','mutton','chicken','turkey','duck','goose','venison','meat']
const SEAFOOD = ['fish','salmon','tuna','cod','bass','branzino','anchovy','anchovies','sardine','sardines','shellfish','shrimp','prawn','crab','lobster','mussel','clam','oyster','scallop','squid','octopus']
const ANIMAL_PRODUCTS = [...LAND_MEAT,...SEAFOOD,'milk','cream','butter','cheese','yogurt','yoghurt','whey','ghee','egg','eggs','mayonnaise','mayo','honey']
const words=(values:string[])=>` ${values.join(' ').toLowerCase().replace(/[^a-z0-9]+/g,' ')} `
const contains=(text:string,terms:string[])=>terms.some(term=>text.includes(` ${term} `))

export function inferIngredientAllergens(name:string):string[]{const text=words([name]);return Object.entries(ALLERGEN_TERMS).filter(([,terms])=>contains(text,terms)).map(([allergen])=>allergen)}

export function reconcileDishDietaryClaims(claims:string[],ingredientNames:string[],ingredientTags:string[]=[]):string[]{const result=new Set(claims.map(value=>value.toLowerCase()));if(!ingredientNames.length&&!ingredientTags.length)return Array.from(result);const text=words([...ingredientNames,...ingredientTags]),hasPork=contains(text,PORK),hasLandMeat=contains(text,LAND_MEAT),hasSeafood=contains(text,SEAFOOD),hasAnimal=contains(text,ANIMAL_PRODUCTS);if(hasAnimal)result.delete('vegan');else result.add('vegan');if(hasLandMeat||hasSeafood){result.delete('vegetarian');result.delete('veg')}else{result.add('vegetarian');result.add('veg')}if(hasPork)result.delete('no pork');else result.add('no pork');if(hasLandMeat)result.delete('pescatarian');else if(hasSeafood)result.add('pescatarian');return Array.from(result)}
