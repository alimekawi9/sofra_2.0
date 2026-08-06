/** Flat table-mood colours used behind event covers. The cover is the colour
 *  itself, so an uploaded photo is always optional and never load-bearing. */
export type TableMood = { label: string; color: string; ink: string }

export const MOODS: Record<string, TableMood> = {
  vanilla: { label: 'Vanilla Silk', color: '#EAE2D4', ink: '#3A322A' },
  oat: { label: 'Alpine Oat', color: '#CFC5B6', ink: '#3A322A' },
  greige: { label: 'Warm Greige', color: '#A99C90', ink: '#241E1A' },
  khaki: { label: 'Khaki', color: '#A49250', ink: '#241E1A' },
  haze: { label: 'Blue Grey', color: '#9DBCD1', ink: '#1E2A31' },
  clay: { label: 'Burgundy', color: '#74362D', ink: '#F4EFE4' },
  cherry: { label: 'Cherry Velvet', color: '#4A1B1E', ink: '#F4EFE4' },
  wine: { label: 'Deep Wine', color: '#452928', ink: '#F4EFE4' },
  bordeaux: { label: 'Bordeaux Noir', color: '#2E1518', ink: '#F4EFE4' },
}

/** events.theme still stores the original gradient-era ids — map them on. */
const LEGACY: Record<string, string> = {
  ember: 'cherry',
  olive: 'khaki',
  midnight: 'wine',
  saffron: 'oat',
  plum: 'bordeaux',
}

export function mood(key?: string | null): TableMood {
  if (key && MOODS[key]) return MOODS[key]
  const legacy = key ? LEGACY[key] : undefined
  return (legacy ? MOODS[legacy] : undefined) ?? MOODS.cherry
}
