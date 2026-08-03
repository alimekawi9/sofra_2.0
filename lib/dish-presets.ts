// Curated dish presets for the "Your signatures" quick-add picker.
// Tapping a preset fills name/tags/allergens — the chef can still edit
// before saving. Free-text entry remains available for anything not listed.

export type DishPreset = {
  name: string
  cuisine: string
  tags: string[]
  allergens: string[]
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

export const DISH_PRESETS: DishPreset[] = [
  // Levantine
  { name: 'Hummus', cuisine: 'Levantine', tags: ['veg', 'vegan'], allergens: [] },
  { name: 'Baba Ganoush', cuisine: 'Levantine', tags: ['veg', 'vegan'], allergens: [] },
  { name: 'Tabbouleh', cuisine: 'Levantine', tags: ['veg', 'vegan'], allergens: ['gluten'] },
  { name: 'Fattoush', cuisine: 'Levantine', tags: ['veg', 'vegan'], allergens: ['gluten'] },
  { name: 'Falafel', cuisine: 'Levantine', tags: ['veg', 'vegan'], allergens: [] },
  { name: 'Muhammara', cuisine: 'Levantine', tags: ['veg', 'vegan'], allergens: ['nuts'] },
  { name: 'Shawarma', cuisine: 'Levantine', tags: ['meat'], allergens: [] },
  { name: 'Lamb Kofta', cuisine: 'Levantine', tags: ['meat'], allergens: [] },
  { name: 'Kibbeh', cuisine: 'Levantine', tags: ['meat'], allergens: ['gluten'] },
  { name: 'Mansaf', cuisine: 'Levantine', tags: ['meat'], allergens: ['dairy'] },
  { name: 'Baklava', cuisine: 'Levantine', tags: ['dessert', 'veg'], allergens: ['nuts', 'gluten'] },
  { name: 'Knafeh', cuisine: 'Levantine', tags: ['dessert', 'veg'], allergens: ['dairy', 'gluten'] },

  // Italian
  { name: 'Margherita Pizza', cuisine: 'Italian', tags: ['veg'], allergens: ['dairy', 'gluten'] },
  { name: 'Spaghetti Carbonara', cuisine: 'Italian', tags: [], allergens: ['dairy', 'eggs', 'gluten'] },
  { name: 'Risotto ai Funghi', cuisine: 'Italian', tags: ['veg'], allergens: ['dairy'] },
  { name: 'Osso Buco', cuisine: 'Italian', tags: ['meat'], allergens: [] },
  { name: 'Caprese Salad', cuisine: 'Italian', tags: ['veg'], allergens: ['dairy'] },
  { name: 'Bruschetta', cuisine: 'Italian', tags: ['veg', 'vegan'], allergens: ['gluten'] },
  { name: 'Lasagna', cuisine: 'Italian', tags: ['meat'], allergens: ['dairy', 'gluten'] },
  { name: 'Tiramisu', cuisine: 'Italian', tags: ['dessert', 'veg'], allergens: ['dairy', 'eggs', 'gluten'] },
  { name: 'Panna Cotta', cuisine: 'Italian', tags: ['dessert', 'veg'], allergens: ['dairy'] },

  // French
  { name: 'Coq au Vin', cuisine: 'French', tags: ['meat'], allergens: [] },
  { name: 'Beef Bourguignon', cuisine: 'French', tags: ['meat'], allergens: [] },
  { name: 'Ratatouille', cuisine: 'French', tags: ['veg', 'vegan'], allergens: [] },
  { name: 'French Onion Soup', cuisine: 'French', tags: ['veg'], allergens: ['dairy', 'gluten'] },
  { name: 'Duck Confit', cuisine: 'French', tags: ['meat'], allergens: [] },
  { name: 'Bouillabaisse', cuisine: 'French', tags: ['seafood'], allergens: ['shellfish'] },
  { name: 'Crème Brûlée', cuisine: 'French', tags: ['dessert', 'veg'], allergens: ['dairy', 'eggs'] },
  { name: 'Tarte Tatin', cuisine: 'French', tags: ['dessert', 'veg'], allergens: ['gluten', 'dairy'] },

  // Japanese
  { name: 'Sushi Platter', cuisine: 'Japanese', tags: ['seafood'], allergens: ['shellfish'] },
  { name: 'Ramen', cuisine: 'Japanese', tags: [], allergens: ['gluten', 'eggs'] },
  { name: 'Miso Soup', cuisine: 'Japanese', tags: ['veg'], allergens: ['soy'] },
  { name: 'Tempura', cuisine: 'Japanese', tags: [], allergens: ['gluten', 'shellfish'] },
  { name: 'Teriyaki Chicken', cuisine: 'Japanese', tags: ['meat'], allergens: ['soy'] },
  { name: 'Gyoza', cuisine: 'Japanese', tags: [], allergens: ['gluten', 'soy'] },
  { name: 'Matcha Mochi', cuisine: 'Japanese', tags: ['dessert', 'veg', 'vegan'], allergens: [] },

  // Mexican
  { name: 'Tacos al Pastor', cuisine: 'Mexican', tags: ['meat'], allergens: [] },
  { name: 'Guacamole', cuisine: 'Mexican', tags: ['veg', 'vegan'], allergens: [] },
  { name: 'Elote', cuisine: 'Mexican', tags: ['veg'], allergens: ['dairy'] },
  { name: 'Chiles Rellenos', cuisine: 'Mexican', tags: ['veg'], allergens: ['dairy', 'eggs'] },
  { name: 'Mole Poblano', cuisine: 'Mexican', tags: ['meat'], allergens: ['nuts'] },
  { name: 'Ceviche', cuisine: 'Mexican', tags: ['seafood'], allergens: ['shellfish'] },
  { name: 'Churros', cuisine: 'Mexican', tags: ['dessert', 'veg'], allergens: ['gluten', 'eggs', 'dairy'] },

  // Indian
  { name: 'Butter Chicken', cuisine: 'Indian', tags: ['meat'], allergens: ['dairy'] },
  { name: 'Chana Masala', cuisine: 'Indian', tags: ['veg', 'vegan'], allergens: [] },
  { name: 'Saag Paneer', cuisine: 'Indian', tags: ['veg'], allergens: ['dairy'] },
  { name: 'Lamb Rogan Josh', cuisine: 'Indian', tags: ['meat'], allergens: ['dairy'] },
  { name: 'Samosas', cuisine: 'Indian', tags: ['veg', 'vegan'], allergens: ['gluten'] },
  { name: 'Biryani', cuisine: 'Indian', tags: [], allergens: ['dairy'] },
  { name: 'Gulab Jamun', cuisine: 'Indian', tags: ['dessert', 'veg'], allergens: ['dairy', 'gluten'] },

  // Greek
  { name: 'Greek Salad', cuisine: 'Greek', tags: ['veg'], allergens: ['dairy'] },
  { name: 'Moussaka', cuisine: 'Greek', tags: ['meat'], allergens: ['dairy', 'eggs'] },
  { name: 'Souvlaki', cuisine: 'Greek', tags: ['meat'], allergens: [] },
  { name: 'Spanakopita', cuisine: 'Greek', tags: ['veg'], allergens: ['dairy', 'gluten', 'eggs'] },
  { name: 'Tzatziki', cuisine: 'Greek', tags: ['veg'], allergens: ['dairy'] },
  { name: 'Baklava (Greek style)', cuisine: 'Greek', tags: ['dessert', 'veg'], allergens: ['nuts', 'gluten'] },

  // American
  { name: 'Classic Burger', cuisine: 'American', tags: ['meat'], allergens: ['gluten', 'dairy'] },
  { name: 'BBQ Pulled Pork', cuisine: 'American', tags: ['meat'], allergens: [] },
  { name: 'Mac and Cheese', cuisine: 'American', tags: ['veg'], allergens: ['dairy', 'gluten'] },
  { name: 'Cornbread', cuisine: 'American', tags: ['veg'], allergens: ['gluten', 'eggs', 'dairy'] },
  { name: 'Fried Chicken', cuisine: 'American', tags: ['meat'], allergens: ['gluten'] },
  { name: 'Apple Pie', cuisine: 'American', tags: ['dessert', 'veg'], allergens: ['gluten', 'dairy'] },
]
