import Link from 'next/link'
import { sv2Display, sv2Sans } from './fonts'
import { PREVIEW_MENU_DISHES } from './menu-fixtures'
import { PreviewBottomNav } from './PreviewBottomNav'

export function MenuPreview({ theme }: { theme: 'light' | 'dark' }) {
  return (
    <div className={`sv2-root sv2-device-page sv2-app-page sv2-menu-page sv2-menu-page--${theme} ${sv2Display.variable} ${sv2Sans.variable}`}>
      <main className="sv2-device-shell sv2-app-shell sv2-menu-shell">
        <header className="sv2-menu-topline">
          <p>Sofra.</p>
          <div><span aria-hidden="true">⌕</span><span>Cart</span><span aria-hidden="true">☰</span></div>
        </header>

        <nav className="sv2-menu-tabs" aria-label="Menu preview sections">
          <span className="sv2-menu-tab-current">The Table</span>
          <span>Curated Menus</span>
          <span>My Kitchen</span>
        </nav>

        <section className="sv2-menu-theme-links" aria-label="Menu appearance variants">
          <Link aria-current={theme === 'light' ? 'page' : undefined} href="/design-preview/menu?theme=light">Light</Link>
          <Link aria-current={theme === 'dark' ? 'page' : undefined} href="/design-preview/menu?theme=dark">Dark</Link>
        </section>

        <section className="sv2-menu-list" aria-labelledby="sv2-menu-heading">
          <p className="sv2-menu-breadcrumb">Sofra · Kitchen</p>
          <h1 id="sv2-menu-heading">Tonight&apos;s highlights</h1>
          {PREVIEW_MENU_DISHES.map((dish) => (
            <article key={dish.name}>
              <div className="sv2-menu-image-placeholder" data-asset-fidelity="placeholder" aria-label={`${dish.name} image placeholder`}>{dish.mark}</div>
              <div>
                <h2>{dish.name}</h2>
                <p>{dish.description}</p>
                <span>{dish.indicator}</span>
              </div>
            </article>
          ))}
          <button type="button" className="sv2-menu-action">Explore menu <span aria-hidden="true">→</span></button>
        </section>

        <PreviewBottomNav current="menu" />
      </main>
    </div>
  )
}
