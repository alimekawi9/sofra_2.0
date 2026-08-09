'use client'

import { initials } from '@/lib/sofra/format'

export interface AlbumAvatarProps {
  name: string
  photoUrl: string | null
}

export function AlbumAvatar({ name, photoUrl }: AlbumAvatarProps) {
  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="sv2-album-avatar" src={photoUrl} alt="" />
  }
  return <span className="sv2-album-avatar sv2-album-avatar-initials">{initials(name)}</span>
}
