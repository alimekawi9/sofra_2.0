import Link from 'next/link'
import { AlbumAvatar } from './AlbumAvatar'

export function ProfileIdentityLink({
  userId,
  name,
  photoUrl,
  prefix,
  className = '',
  hideFallbackAvatar = false,
}: {
  userId: string
  name: string
  photoUrl: string | null
  prefix?: string
  className?: string
  hideFallbackAvatar?: boolean
}) {
  return (
    <Link className={`sv2-profile-identity-link ${className}`.trim()} href={`/profile/${userId}`}>
      {(photoUrl || !hideFallbackAvatar) && <AlbumAvatar name={name} photoUrl={photoUrl} />}
      <span>{prefix}{name}</span>
    </Link>
  )
}
