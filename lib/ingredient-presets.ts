// Curated ingredient presets for the "This week's pantry" quick-add picker.
// Organized by category (not cuisine, since ingredients aren't cuisine-bound).
// Multi-select — tap several, add them all at once.

export const INGREDIENT_CATEGORIES = [
  'Proteins',
  'Vegetables',
  'Fruits',
  'Herbs & Spices',
  'Dairy & Eggs',
  'Grains & Starches',
  'Pantry & Condiments',
] as const

export const INGREDIENT_PRESETS: Record<string, string[]> = {
  Proteins: [
    'Chicken thighs', 'Chicken breast', 'Whole chicken', 'Duck breast',
    'Lamb shoulder', 'Lamb chops', 'Beef short rib', 'Beef tenderloin',
    'Ground beef', 'Pork belly', 'Pork tenderloin', 'Sea bass',
    'Branzino', 'Salmon', 'Shrimp', 'Scallops', 'Tofu', 'Tempeh',
    'Chickpeas', 'Lentils', 'Black beans', 'Eggs',
  ],
  Vegetables: [
    'Eggplant', 'Zucchini', 'Heirloom tomato', 'Cherry tomatoes',
    'Fennel', 'Leeks', 'Shallots', 'Red onion', 'Garlic',
    'Bell peppers', 'Broccolini', 'Asparagus', 'Mushrooms',
    'Spinach', 'Kale', 'Arugula', 'Butternut squash', 'Beets',
    'Carrots', 'Cauliflower', 'Brussels sprouts', 'Cucumber',
  ],
  Fruits: [
    'Lemon', 'Lime', 'Orange', 'Preserved lemon', 'Figs',
    'Pomegranate', 'Apples', 'Pears', 'Peaches', 'Grapes',
    'Dates', 'Apricots', 'Avocado',
  ],
  'Herbs & Spices': [
    'Parsley', 'Mint', 'Cilantro', 'Basil', 'Thyme', 'Rosemary',
    'Dill', 'Sumac', 'Za\'atar', 'Cumin', 'Coriander', 'Paprika',
    'Cinnamon', 'Saffron', 'Turmeric', 'Chili flakes', 'Black pepper',
  ],
  'Dairy & Eggs': [
    'Labneh', 'Greek yogurt', 'Feta', 'Halloumi', 'Burrata',
    'Parmesan', 'Ricotta', 'Butter', 'Heavy cream', 'Crème fraîche',
  ],
  'Grains & Starches': [
    'Freekeh', 'Bulgur', 'Rice', 'Orzo', 'Couscous', 'Farro',
    'Pita', 'Sourdough', 'Potatoes', 'Polenta',
  ],
  'Pantry & Condiments': [
    'Olive oil', 'Tahini', 'Pomegranate molasses', 'Harissa',
    'Dijon mustard', 'Honey', 'Pine nuts', 'Pistachios', 'Almonds',
    'Walnuts', 'Capers', 'Anchovies', 'Soy sauce', 'Miso paste',
  ],
}

// Best-effort mapping from a custom pantry item's stored Protein-group tag
// (lib/kitchen-tags.ts's DESCRIPTIVE_TAG_GROUPS "Protein" group) to the
// curated category it belongs to in this picker. An item whose tags don't
// map to any of these returns null and is only ever shown under "All" --
// never guessed into the wrong tab, and never excluded from "All".
const PROTEIN_TAG_TO_CATEGORY: Record<string, (typeof INGREDIENT_CATEGORIES)[number]> = {
  beef: 'Proteins', lamb: 'Proteins', chicken: 'Proteins', turkey: 'Proteins', pork: 'Proteins',
  duck: 'Proteins', fish: 'Proteins', shellfish: 'Proteins', legume: 'Proteins', tofu: 'Proteins',
  // Mushroom is a "Protein"-group descriptive tag, but the curated preset picker already files its
  // "Mushrooms" entry under Vegetables (see INGREDIENT_PRESETS.Vegetables above) -- mapping it to
  // Proteins here would split the same ingredient across two different tabs depending on whether it
  // was typed manually or picked as a preset.
  mushroom: 'Vegetables',
  vegetable: 'Vegetables',
  fruit: 'Fruits',
  dairy: 'Dairy & Eggs', egg: 'Dairy & Eggs',
  grain: 'Grains & Starches', pasta: 'Grains & Starches',
}

export function inferIngredientCategory(tags: readonly string[]): (typeof INGREDIENT_CATEGORIES)[number] | null {
  for (const tag of tags) {
    const mapped = PROTEIN_TAG_TO_CATEGORY[tag]
    if (mapped) return mapped
  }
  return null
}
