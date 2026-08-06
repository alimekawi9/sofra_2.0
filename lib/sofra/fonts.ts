export type MenuFontKey = 'caslon' | 'playfair' | 'baskerville' | 'grotesk'

export const MENU_FONTS: Record<MenuFontKey, { label: string; note: string; stack: string; italic: boolean }> = {
  caslon: { label: 'Caslon', note: 'Thin, high-contrast italic — the house voice.', stack: '"Cormorant Garamond", Georgia, serif', italic: true },
  playfair: { label: 'Playfair', note: 'Rounder, heavier serif with a warmer italic.', stack: '"Playfair Display", Georgia, serif', italic: true },
  baskerville: { label: 'Baskerville', note: 'Bookish and steady — reads best in print.', stack: '"Libre Baskerville", Georgia, serif', italic: false },
  grotesk: { label: 'Grotesk', note: 'Plain and modern, no serif at all.', stack: '"Space Grotesk", system-ui, sans-serif', italic: false },
}

export function fontKey(v?: string | null): MenuFontKey {
  return v && v in MENU_FONTS ? (v as MenuFontKey) : 'caslon'
}

export function fontStyle(k: MenuFontKey) {
  const f = MENU_FONTS[k]
  return { fontFamily: f.stack, fontStyle: f.italic ? ('italic' as const) : ('normal' as const) }
}
