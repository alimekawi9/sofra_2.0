export const C = {
  ink: '#140E10',
  ink2: '#1E1518',
  burgundy: '#5C1A1B',
  burgundyLit: '#7A2324',
  cream: '#F3E9DD',
  dim: '#B7A493',
  faint: '#7C6B5F',
  gold: '#D9A15B',
  rose: '#C97B6E',
  sage: '#8AA06E',
  danger: '#E0776B',
  panel: '#211A1D',
  line: 'rgba(243,233,221,0.1)',
} as const

export type ThemeId = 'ember' | 'olive' | 'midnight' | 'saffron' | 'plum'

export interface Theme {
  id: ThemeId
  name: string
  bg: string
  accent: string
}

export const THEMES: Theme[] = [
  { id: 'ember',    name: 'Ember',    bg: 'radial-gradient(120% 80% at 50% 0%, #7A2324 0%, #3A1416 45%, #140E10 100%)', accent: '#D9A15B' },
  { id: 'olive',    name: 'Olive',    bg: 'radial-gradient(120% 80% at 50% 0%, #5B6B4E 0%, #2E3826 50%, #14140E 100%)', accent: '#D9C05B' },
  { id: 'midnight', name: 'Midnight', bg: 'radial-gradient(120% 80% at 50% 0%, #26304A 0%, #161C2E 50%, #0C0E14 100%)', accent: '#C97B6E' },
  { id: 'saffron',  name: 'Saffron',  bg: 'radial-gradient(120% 80% at 50% 0%, #B5701E 0%, #6E4212 50%, #17100A 100%)', accent: '#F3D9A0' },
  { id: 'plum',     name: 'Plum',     bg: 'radial-gradient(120% 80% at 50% 0%, #4A2540 0%, #2A162A 50%, #120A12 100%)', accent: '#D98FB0' },
]

export const getTheme = (id?: string | null): Theme =>
  THEMES.find((t) => t.id === id) || THEMES[0]

export const DIETARY = ['Vegetarian', 'Vegan', 'No pork/alcohol', 'Kosher', 'Gluten-free', 'No dairy', 'Pescatarian']
export const NOGOS = ['Nuts', 'Shellfish', 'Pork', 'Eggs', 'Cilantro', 'Mushrooms']
export const DRINKS = ['Cocktails', 'Wine', 'Beer', 'Alcohol-free']
