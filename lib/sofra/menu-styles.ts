import { ART } from './assets'

export type MenuStyleKey = 'salon' | 'sun' | 'bloom' | 'stripe' | 'doily' | 'deco'

export type MenuStyle = {
  label: string
  note: string
  url: string
  ink: string
  /** aspect ratio (w / h) of the card artwork */
  ratio: number
  /** content inset as % of the card, so text never lands on the border art */
  pad: { top: number; side: number; bottom: number }
}

export const MENU_STYLES: Record<MenuStyleKey, MenuStyle> = {
  salon: { label: 'Salon', note: 'Bare cream card with a drawn long table laid along the foot.', url: ART.menuSalon, ink: '#5C1515', ratio: 508 / 1070, pad: { top: 8, side: 12, bottom: 46 } },
  doily: { label: 'Doily', note: "Paper lace edge — the one that looks like your teta's table.", url: ART.menuDoily, ink: '#141210', ratio: 770 / 1095, pad: { top: 15, side: 21, bottom: 15 } },
  bloom: { label: 'Bloom', note: 'Block-printed carnations, deep red rule.', url: ART.menuBloom, ink: '#A5122E', ratio: 1122 / 1402, pad: { top: 12, side: 18, bottom: 12 } },
  sun: { label: 'Sun', note: 'Painted vines and a gold sun on aged parchment.', url: ART.menuSun, ink: '#6B4A16', ratio: 1122 / 1402, pad: { top: 26, side: 24, bottom: 20 } },
  stripe: { label: 'Stripe', note: 'Green and pink awning stripes around a butter-yellow centre.', url: ART.menuStripe, ink: '#4A5A31', ratio: 827 / 1200, pad: { top: 13, side: 14, bottom: 13 } },
  deco: { label: 'Deco', note: 'Powder-blue notch card with a dotted chocolate rule. Tall and narrow.', url: ART.menuDeco, ink: '#3A2A1C', ratio: 340 / 832, pad: { top: 12, side: 16, bottom: 12 } },
}

export function menuStyleKey(v?: string | null): MenuStyleKey {
  return v && v in MENU_STYLES ? (v as MenuStyleKey) : 'salon'
}
