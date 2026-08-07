import Link from 'next/link'

export function PreviewBottomNav({ current }: { current: 'events' | 'menu' | 'profile' }) {
  return (
    <nav className="sv2-app-nav" aria-label="Preview application">
      <Link className={current === 'events' ? 'sv2-app-nav-current' : ''} href="/design-preview/events">Table</Link>
      <Link className={current === 'menu' ? 'sv2-app-nav-current' : ''} href="/design-preview/menu">Menu</Link>
      <Link className={current === 'profile' ? 'sv2-app-nav-current' : ''} href="/design-preview/profile">Profile</Link>
    </nav>
  )
}
