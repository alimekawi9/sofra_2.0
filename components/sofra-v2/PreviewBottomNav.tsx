import Link from 'next/link'
export type PreviewNavItem='events'|'host'|'profile'
export function PreviewBottomNav({current}:{current:PreviewNavItem}){return <nav className="sv2-app-nav" aria-label="Preview application"><Link className={current==='events'?'sv2-app-nav-current':''} href="/design-preview/events">SOFRAS</Link><Link className={current==='host'?'sv2-app-nav-current':''} href="/design-preview/host">HOST</Link><Link className={current==='profile'?'sv2-app-nav-current':''} href="/design-preview/profile">PROFILE</Link></nav>}
