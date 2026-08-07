export interface PreviewMenuDish {
  name: string
  description: string
  indicator: string
  mark: string
}

export const PREVIEW_MENU_DISHES: readonly PreviewMenuDish[] = [
  { name: 'Heirloom Tomato & Labneh', description: 'Mint, toasted seeds, and good olive oil.', indicator: 'Serves the whole table', mark: 'T' },
  { name: 'Whole Grilled Sea Bass', description: 'Charred lemon, herbs, and a bright green sauce.', indicator: 'Pescatarian', mark: 'F' },
  { name: 'Lamb Shoulder with Freekeh', description: 'Slow-cooked lamb, smoky grains, and pan jus.', indicator: 'Signature', mark: 'L' },
  { name: 'Burnt Basque Cheesecake', description: 'Dark caramel top with a soft, creamy center.', indicator: 'To share', mark: 'S' },
] as const
