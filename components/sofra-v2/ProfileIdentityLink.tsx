import Link from 'next/link'
import { AlbumAvatar } from './AlbumAvatar'

export function ProfileIdentityLink({
  userId,
  name,
  photoUrl,
  prefix,
  className = '',
}: {
  userId: string
  name: string
  photoUrl: string | null
  prefix?: string
  className?: string
}) {
  return (
    <Link className={`sv2-profile-identity-link ${className}`.trim()} href={`/profile/${userId}`}>
      <AlbumAvatar name={name} photoUrl={photoUrl} />
      <span>{prefix}{name}</span>
    </Link>
  )
}
