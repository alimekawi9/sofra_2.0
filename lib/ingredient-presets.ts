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
