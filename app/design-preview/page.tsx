import Link from 'next/link'
import '@/components/sofra-v2/sofra-v2.css'
import { sv2Display, sv2Sans } from '@/components/sofra-v2/fonts'

const previewRoutes = [
  { section: 'Onboarding', label: 'Welcome', href: '/design-preview/welcome', available: true },
  { section: 'Onboarding', label: 'Phone sign up', href: '/design-preview/signup', available: true },
  { section: 'Onboarding', label: 'Verification code', href: '/design-preview/code', available: false },
  { section: 'Onboarding', label: 'Name', href: '/design-preview/name', available: true },
  { section: 'Dashboard', label: 'Events', href: '/design-preview/events', available: false },
  { section: 'Dashboard', label: 'Event detail', href: '/design-preview/events/demo', available: false },
  { section: 'Preferences', label: 'Preferences receipt', href: '/design-preview/preferences', available: true },
  { section: 'Invite', label: 'Invitation', href: '/design-preview/invite', available: false },
  { section: 'Invite', label: 'Invitation templates', href: '/design-preview/invite/templates', available: false },
  { section: 'Customization', label: 'Customization', href: '/design-preview/customization', available: false },
  { section: 'Application', label: 'Menu', href: '/design-preview/menu', available: false },
  { section: 'Application', label: 'Profile', href: '/design-preview/profile', available: false },
] as const

export default function DesignPreviewIndexPage() {
  const sections = Array.from(new Set(previewRoutes.map((route) => route.section)))

  return (
    <div className={`sv2-root sv2-gallery-page ${sv2Display.variable} ${sv2Sans.variable}`}>
      <main className="sv2-gallery-shell">
        <header className="sv2-gallery-header">
          <p className="sv2-gallery-eyebrow">SOFRA DESIGN PREVIEW</p>
          <h1>Every seat at the table.</h1>
          <p>Available previews are live. Planned cards document visible board screens that have not been implemented yet.</p>
        </header>

        {sections.map((section) => (
          <section className="sv2-gallery-section" key={section} aria-labelledby={`sv2-gallery-${section}`}>
            <h2 id={`sv2-gallery-${section}`}>{section}</h2>
            <div className="sv2-gallery-grid">
              {previewRoutes.filter((route) => route.section === section).map((route) => (
                <article className="sv2-gallery-card" key={route.href}>
                  <div>
                    <p className="sv2-gallery-status" data-available={route.available}>
                      {route.available ? 'Available' : 'Planned — not implemented'}
                    </p>
                    <h3>{route.label}</h3>
                    <code>{route.href}</code>
                  </div>
                  <Link href={route.href} aria-disabled={!route.available} tabIndex={route.available ? 0 : -1}>
                    {route.available ? 'Open preview' : 'Awaiting implementation'}
                  </Link>
                </article>
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  )
}
