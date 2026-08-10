// Curated dish presets for the "Your signatures" quick-add picker.
// Tapping a preset fills name/tags/allergens — the chef can still edit
// before saving. Free-text entry remains available for anything not listed.

// A dish's course role is independent of its diet/course-type tags ('meat',
// 'veg', etc — those stay for allergen/diet matching in lib/menu.ts). 'main'
// dishes are eligible for "Main — Land/Sea/Green"; 'side' and 'starter'
// dishes are traditionally accompaniments or appetizers and are only ever
// routed to "To Start" (see inferSlot in lib/menu.ts).
export const DISH_ROLES = ['starter', 'main', 'side', 'dessert', 'flex'] as const
export type DishRole = (typeof DISH_ROLES)[number]

export function canonicalDishName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US')
}

export function dishPresetKey(preset: Pick<DishPreset, 'cuisine' | 'name'>): string {
  return `${preset.cuisine}::${canonicalDishName(preset.name)}`
}

const DISH_ROLE_SET = new Set<string>(DISH_ROLES)

export function isDishRole(value: string): value is DishRole {
  return DISH_ROLE_SET.has(value)
}

export function dishRoleFromTags(tags: readonly string[]): DishRole | null {
  return tags.find(isDishRole) ?? null
}

export function withoutDishRoles(tags: readonly string[]): string[] {
  return tags.filter((tag) => !isDishRole(tag))
}

export function withDishRole(tags: readonly string[], role: DishRole): string[] {
  return [...withoutDishRoles(tags), role]
}

export type DishPreset = {
  name: string
  cuisine: string
  tags: string[]
  allergens: string[]
  role: DishRole
  novelty_score?: 0.10 | 0.25 | 0.50 | 0.75 | 0.95
  is_substantial?: boolean
}

export const CUISINES = [
  'Levantine',
  'Italian',
  'French',
  'Japanese',
  'Mexican',
  'Indian',
  'Greek',
  'American',
] as const

type RawDishPreset = Omit<DishPreset, 'novelty_score' | 'is_substantial'>

const DISH_PRESETS_RAW: RawDishPreset[] = [
  // Levantine
  { name: 'Hummus', cuisine: 'Levantine', tags: ['veg', 'vegan'], allergens: [], role: 'starter' },
  { name: 'Baba Ganoush', cuisine: 'Levantine', tags: ['veg', 'vegan'], allergens: [], role: 'starter' },
  { name: 'Tabbouleh', cuisine: 'Levantine', tags: ['veg', 'vegan'], allergens: ['gluten'], role: 'side' },
  { name: 'Fattoush', cuisine: 'Levantine', tags: ['veg', 'vegan'], allergens: ['gluten'], role: 'side' },
  { name: 'Falafel', cuisine: 'Levantine', tags: ['veg', 'vegan'], allergens: [], role: 'main' },
  { name: 'Muhammara', cuisine: 'Levantine', tags: ['veg', 'vegan'], allergens: ['nuts'], role: 'starter' },
  { name: 'Shawarma', cuisine: 'Levantine', tags: ['meat'], allergens: [], role: 'main' },
  { name: 'Lamb Kofta', cuisine: 'Levantine', tags: ['meat'], allergens: [], role: 'main' },
  { name: 'Kibbeh', cuisine: 'Levantine', tags: ['meat'], allergens: ['gluten'], role: 'main' },
  { name: 'Mansaf', cuisine: 'Levantine', tags: ['meat'], allergens: ['dairy'], role: 'main' },
  { name: 'Baklava', cuisine: 'Levantine', tags: ['dessert', 'veg'], allergens: ['nuts', 'gluten', 'dairy'], role: 'dessert' },
  { name: 'Knafeh', cuisine: 'Levantine', tags: ['dessert', 'veg'], allergens: ['dairy', 'gluten'], role: 'dessert' },

  // Italian
  { name: 'Margherita Pizza', cuisine: 'Italian', tags: ['veg'], allergens: ['dairy', 'gluten'], role: 'main' },
  { name: 'Spaghetti Carbonara', cuisine: 'Italian', tags: ['meat'], allergens: ['dairy', 'eggs', 'gluten', 'pork'], role: 'main' },
  { name: 'Risotto ai Funghi', cuisine: 'Italian', tags: ['veg'], allergens: ['dairy'], role: 'main' },
  { name: 'Osso Buco', cuisine: 'Italian', tags: ['meat'], allergens: ['alcohol'], role: 'main' },
  { name: 'Caprese Salad', cuisine: 'Italian', tags: ['veg'], allergens: ['dairy'], role: 'starter' },
  { name: 'Bruschetta', cuisine: 'Italian', tags: ['veg', 'vegan'], allergens: ['gluten'], role: 'starter' },
  { name: 'Lasagna', cuisine: 'Italian', tags: ['meat'], allergens: ['dairy', 'gluten'], role: 'main' },
  { name: 'Tiramisu', cuisine: 'Italian', tags: ['dessert', 'veg'], allergens: ['dairy', 'eggs', 'gluten', 'alcohol'], role: 'dessert' },
  { name: 'Panna Cotta', cuisine: 'Italian', tags: ['dessert', 'veg'], allergens: ['dairy'], role: 'dessert' },

  // French
  { name: 'Coq au Vin', cuisine: 'French', tags: ['meat'], allergens: ['alcohol', 'pork'], role: 'main' },
  { name: 'Beef Bourguignon', cuisine: 'French', tags: ['meat'], allergens: ['alcohol', 'pork'], role: 'main' },
  { name: 'Ratatouille', cuisine: 'French', tags: ['veg', 'vegan'], allergens: [], role: 'main' },
  { name: 'French Onion Soup', cuisine: 'French', tags: ['veg'], allergens: ['dairy', 'gluten'], role: 'starter' },
  { name: 'Duck Confit', cuisine: 'French', tags: ['meat'], allergens: [], role: 'main' },
  { name: 'Bouillabaisse', cuisine: 'French', tags: ['seafood'], allergens: ['shellfish', 'alcohol'], role: 'main' },
  { name: 'Crème Brûlée', cuisine: 'French', tags: ['dessert', 'veg'], allergens: ['dairy', 'eggs'], role: 'dessert' },
  { name: 'Tarte Tatin', cuisine: 'French', tags: ['dessert', 'veg'], allergens: ['gluten', 'dairy'], role: 'dessert' },

  // Japanese
  { name: 'Sushi Platter', cuisine: 'Japanese', tags: ['seafood'], allergens: ['shellfish'], role: 'main' },
  { name: 'Ramen', cuisine: 'Japanese', tags: ['meat'], allergens: ['gluten', 'eggs', 'pork', 'soy'], role: 'main' },
  { name: 'Miso Soup', cuisine: 'Japanese', tags: ['veg'], allergens: ['soy'], role: 'starter' },
  { name: 'Tempura', cuisine: 'Japanese', tags: [], allergens: ['gluten', 'shellfish', 'eggs'], role: 'starter' },
  { name: 'Teriyaki Chicken', cuisine: 'Japanese', tags: ['meat'], allergens: ['soy', 'gluten'], role: 'main' },
  { name: 'Gyoza', cuisine: 'Japanese', tags: ['meat'], allergens: ['gluten', 'soy', 'pork'], role: 'starter' },
  { name: 'Matcha Mochi', cuisine: 'Japanese', tags: ['dessert', 'veg', 'vegan'], allergens: [], role: 'dessert' },

  // Mexican
  { name: 'Tacos al Pastor', cuisine: 'Mexican', tags: ['meat'], allergens: ['pork'], role: 'main' },
  { name: 'Guacamole', cuisine: 'Mexican', tags: ['veg', 'vegan'], allergens: [], role: 'starter' },
  { name: 'Elote', cuisine: 'Mexican', tags: ['veg'], allergens: ['dairy'], role: 'side' },
  { name: 'Chiles Rellenos', cuisine: 'Mexican', tags: ['veg'], allergens: ['dairy', 'eggs', 'gluten'], role: 'main' },
  { name: 'Mole Poblano', cuisine: 'Mexican', tags: ['meat'], allergens: ['nuts'], role: 'main' },
  { name: 'Ceviche', cuisine: 'Mexican', tags: ['seafood'], allergens: ['shellfish'], role: 'starter' },
  { name: 'Churros', cuisine: 'Mexican', tags: ['dessert', 'veg'], allergens: ['gluten', 'eggs', 'dairy'], role: 'dessert' },

  // Indian
  { name: 'Butter Chicken', cuisine: 'Indian', tags: ['meat'], allergens: ['dairy', 'nuts'], role: 'main' },
  { name: 'Chana Masala', cuisine: 'Indian', tags: ['veg', 'vegan'], allergens: [], role: 'main' },
  { name: 'Saag Paneer', cuisine: 'Indian', tags: ['veg'], allergens: ['dairy'], role: 'main' },
  { name: 'Lamb Rogan Josh', cuisine: 'Indian', tags: ['meat'], allergens: ['dairy'], role: 'main' },
  { name: 'Samosas', cuisine: 'Indian', tags: ['veg', 'vegan'], allergens: ['gluten'], role: 'starter' },
  { name: 'Biryani', cuisine: 'Indian', tags: [], allergens: ['dairy'], role: 'main' },
  { name: 'Gulab Jamun', cuisine: 'Indian', tags: ['dessert', 'veg'], allergens: ['dairy', 'gluten'], role: 'dessert' },

  // Greek
  { name: 'Greek Salad', cuisine: 'Greek', tags: ['veg'], allergens: ['dairy'], role: 'side' },
  { name: 'Moussaka', cuisine: 'Greek', tags: ['meat'], allergens: ['dairy', 'eggs', 'gluten'], role: 'main' },
  { name: 'Souvlaki', cuisine: 'Greek', tags: ['meat'], allergens: [], role: 'main' },
  { name: 'Spanakopita', cuisine: 'Greek', tags: ['veg'], allergens: ['dairy', 'gluten', 'eggs'], role: 'starter' },
  { name: 'Tzatziki', cuisine: 'Greek', tags: ['veg'], allergens: ['dairy'], role: 'starter' },
  { name: 'Baklava (Greek style)', cuisine: 'Greek', tags: ['dessert', 'veg'], allergens: ['nuts', 'gluten', 'dairy'], role: 'dessert' },

  // American
  { name: 'Classic Burger', cuisine: 'American', tags: ['meat'], allergens: ['gluten', 'dairy'], role: 'main' },
  { name: 'BBQ Pulled Pork', cuisine: 'American', tags: ['meat'], allergens: ['pork'], role: 'main' },
  { name: 'Mac and Cheese', cuisine: 'American', tags: ['veg'], allergens: ['dairy', 'gluten'], role: 'side' },
  { name: 'Cornbread', cuisine: 'American', tags: ['veg'], allergens: ['gluten', 'eggs', 'dairy'], role: 'side' },
  { name: 'Fried Chicken', cuisine: 'American', tags: ['meat'], allergens: ['gluten', 'dairy', 'eggs'], role: 'main' },
  { name: 'Apple Pie', cuisine: 'American', tags: ['dessert', 'veg'], allergens: ['gluten', 'dairy'], role: 'dessert' },
]

const PRESET_TAG_ENRICHMENT:Record<string,string[]>={
  Tabbouleh:['vegetable','grain','fresh','acidic','herbal','savory','chewy','raw','cold'],
  Tzatziki:['dairy','fresh','acidic','herbal','creamy','raw','chilled'],
  'Lamb Rogan Josh':['lamb','rich','spicy','earthy','umami','tender','juicy','braised','stewed','hot'],
}
const PRESET_NOVELTY:Record<string,0.10|0.25|0.50|0.75|0.95>={Tabbouleh:.25,Tzatziki:.25,'Lamb Rogan Josh':.75}

// Presets carry complete-dish metadata once, at definition time. Selecting a
// preset persists these canonical tags and the two structured values; menu
// generation never asks an LLM to reinterpret the saved dish.
export const DISH_PRESETS:DishPreset[]=DISH_PRESETS_RAW.map(preset=>({
  ...preset,
  tags:Array.from(new Set([...preset.tags,...(PRESET_TAG_ENRICHMENT[preset.name]??[])])),
  novelty_score:PRESET_NOVELTY[preset.name]??.25,
  is_substantial:preset.role==='main',
}))

// Name → role lookup so inferSlot in lib/menu.ts can classify legacy DB rows
// added before the `role` field existed. Those rows have tags like ['veg']
// with no 'side'/'starter' tag, and would otherwise route Mac and Cheese to
// the Main — Green slot. Case-insensitive.
const DISH_ROLE_BY_NAME = new Map<string, DishRole>(
  DISH_PRESETS.map(p => [p.name.toLowerCase(), p.role])
)

export function dishRoleByName(name: string): DishRole | null {
  return DISH_ROLE_BY_NAME.get(name.toLowerCase()) ?? null
}
