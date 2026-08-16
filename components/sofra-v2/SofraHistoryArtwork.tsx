import Image from 'next/image'

const SOFRA_HISTORY_ARTWORK = [
  '/sofra/profile-lace/burgundy.png',
  '/sofra/profile-lace/dusty-rose.png',
  '/sofra/profile-lace/black.png',
  '/sofra/profile-lace/navy-gold.png',
  '/sofra/profile-lace/forest.png',
  '/sofra/profile-lace/sage.png',
  '/sofra/profile-lace/charcoal.png',
  '/sofra/profile-lace/linen.png',
] as const

export function sofraHistoryArtwork(index: number): string {
  return SOFRA_HISTORY_ARTWORK[index % SOFRA_HISTORY_ARTWORK.length]
}

export function SofraHistoryArtwork({ index }: { index: number }) {
  return <span className="sv2-profile-history-icon" aria-hidden="true">
    <Image src={sofraHistoryArtwork(index)} alt="" fill sizes="(max-width: 420px) 92px, 120px" />
  </span>
}
