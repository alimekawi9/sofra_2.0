// __tests__/menu-html.test.ts
//
// buildMenuHtml lives as a private helper inside
// app/(chef)/events/[id]/menu/page.tsx (a client component that can't be
// imported cleanly in a unit test). The function body is duplicated here
// verbatim so we can unit-test its output. Keep this copy in sync with
// the one in page.tsx if either changes.
import type { Course } from '@/lib/menu'
import { portionGuidance } from '@/lib/menu'

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function buildMenuHtml(
  derivedCourses: Course[],
  guestCount: number,
  event: { title: string; event_date: string }
): string {
  const dateStr = new Date(event.event_date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const coursesHtml = derivedCourses
    .map((c) => {
      const originLabel =
        c.origin === 'signature'
          ? 'Signature'
          : c.origin === 'pantry-composed'
          ? 'Composed for this table'
          : c.origin === 'fallback'
          ? 'Chefâ€™s adaptation'
          : ''
      const substitutionsHtml =
        c.substitutions && c.substitutions.length > 0
          ? `<div class="subs"><div class="subs-h">Guest alternates</div>${c.substitutions
              .map(
                (s) =>
                  `<div class="sub"><span class="sub-g">${escHtml(s.guests.join(', '))}</span> get instead: ${escHtml(s.dishName)}</div>`
              )
              .join('')}</div>`
          : ''
      const unmetHtml =
        c.excludes.length > 0 && (!c.substitutions || c.substitutions.length === 0)
          ? `<div class="alt">Alternative required for: ${c.excludes
              .map((e) => `${escHtml(e.guest)} (${escHtml(e.reason)})`)
              .join(', ')}</div>`
          : ''
      const portionHtml =
        c.origin === 'empty'
          ? ''
          : `<div class="portion">${escHtml(portionGuidance(c.slot))}</div>`
      return `
        <div class="course">
          <div class="slot">${escHtml(c.slotLabel)}</div>
          <div class="dish">${escHtml(c.dishName) || 'â€” TBD â€”'}</div>
          ${originLabel ? `<div class="origin">${originLabel}</div>` : ''}
          ${portionHtml}
          ${substitutionsHtml}
          ${unmetHtml}
        </div>`
    })
    .join('')

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escHtml(event.title)} â€” Menu</title>
    <style>
      @page { size:A4; margin:0; }
      *{margin:0;padding:0;box-sizing:border-box;}
      body{font-family:Georgia,'Times New Roman',serif;background:#F3E9DD;color:#2A1A1C;
        display:flex;align-items:center;justify-content:center;min-height:100vh;padding:40px;}
      .menu{width:100%;max-width:600px;background:#FBF5EC;padding:64px 56px 56px;
        border:1px solid #C9A96E;box-shadow:0 20px 60px rgba(0,0,0,0.12);position:relative;}
      .menu:before{content:"";position:absolute;inset:14px;border:1px solid #C9A96E;pointer-events:none;}
      .brand{text-align:center;color:#5C1A1B;font-style:italic;font-size:26px;letter-spacing:0.5px;}
      .rule{width:44px;height:2px;background:#C9A96E;margin:14px auto 26px;}
      .title{text-align:center;font-size:34px;color:#2A1A1C;line-height:1.15;margin-bottom:8px;}
      .meta{text-align:center;color:#8A6A4E;font-size:13px;letter-spacing:2px;text-transform:uppercase;margin-bottom:40px;font-family:system-ui,-apple-system,sans-serif;}
      .course{text-align:center;padding:18px 0;border-bottom:1px solid #E8D9C6;}
      .course:last-of-type{border-bottom:none;}
      .slot{color:#9A7A2B;font-size:11px;letter-spacing:2.5px;text-transform:uppercase;font-family:system-ui,sans-serif;margin-bottom:8px;}
      .dish{font-size:23px;color:#2A1A1C;line-height:1.25;}
      .origin{color:#8A6A4E;font-size:13px;font-style:italic;margin-top:5px;}
      .portion{color:#8A6A4E;font-size:11px;letter-spacing:1px;text-transform:uppercase;margin-top:4px;font-family:system-ui,sans-serif;}
      .alt{color:#9A7A2B;font-size:12px;margin-top:6px;font-family:system-ui,sans-serif;}
      .subs{margin-top:10px;padding-top:8px;border-top:1px dashed #C9A96E;font-family:system-ui,sans-serif;}
      .subs-h{color:#8A6A4E;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:4px;}
      .sub{color:#2A1A1C;font-size:12px;line-height:1.5;}
      .sub-g{color:#5C1A1B;font-style:italic;}
      .foot{text-align:center;margin-top:38px;color:#8A6A4E;font-size:12px;letter-spacing:1px;font-family:system-ui,sans-serif;}
      .foot .s{color:#5C1A1B;font-style:italic;font-family:Georgia,serif;font-size:15px;letter-spacing:0;}
      @media print{body{background:#FBF5EC;padding:0;}.menu{box-shadow:none;border:none;max-width:none;}}
    </style></head><body>
      <div class="menu">
        <div class="brand">Sofra</div>
        <div class="rule"></div>
        <div class="title">${escHtml(event.title)}</div>
        <div class="meta">${dateStr} Â· ${guestCount} cover${guestCount !== 1 ? 's' : ''}</div>
        ${coursesHtml}
        <div class="foot">Curated for this table Â· <span class="s">Sofra</span></div>
      </div>
    </body></html>`
}

const EVENT = { title: 'Summer Feast', event_date: '2026-08-12T18:00:00Z' }

const course = (overrides: Partial<Course>): Course => ({
  slot: 'starter',
  slotLabel: 'To Start',
  dishName: 'Test Dish',
  origin: 'signature',
  sourceId: '1',
  excludes: [],
  ...overrides,
})

describe('buildMenuHtml', () => {
  test('includes Sofra wordmark', () => {
    const html = buildMenuHtml([course({})], 8, EVENT)
    expect(html).toContain('Sofra')
  })

  test('includes event title', () => {
    const html = buildMenuHtml([course({})], 8, EVENT)
    expect(html).toContain('Summer Feast')
  })

  test('includes covers count with pluralisation', () => {
    expect(buildMenuHtml([course({})], 8, EVENT)).toContain('8 covers')
    expect(buildMenuHtml([course({})], 1, EVENT)).toContain('1 cover')
    expect(buildMenuHtml([course({})], 1, EVENT)).not.toContain('1 covers')
  })

  test('formats event date in en-GB long format', () => {
    const html = buildMenuHtml([course({})], 4, EVENT)
    expect(html).toContain('12 August 2026')
  })

  test('includes slot label and dish name for each course', () => {
    const courses: Course[] = [
      course({ slot: 'starter', slotLabel: 'To Start', dishName: 'Amuse Bouche' }),
      course({ slot: 'dessert', slotLabel: 'To Finish', dishName: 'Panna Cotta', sourceId: '2' }),
    ]
    const html = buildMenuHtml(courses, 6, EVENT)
    expect(html).toContain('To Start')
    expect(html).toContain('Amuse Bouche')
    expect(html).toContain('To Finish')
    expect(html).toContain('Panna Cotta')
  })

  test('renders "â€” TBD â€”" for empty course', () => {
    const html = buildMenuHtml([course({ dishName: '', origin: 'empty', sourceId: null })], 4, EVENT)
    expect(html).toContain('â€” TBD â€”')
  })

  // "Alternative required for â€¦" is the honest-failure line: it should
  // ONLY render when there are excluded guests AND no substitute was found
  // for them. Before this feature it fired on every exclusion, which would
  // incorrectly override the successful-substitute case.
  test('includes alternative note when exclusions have no substitutions', () => {
    const c = course({
      excludes: [
        { guest: 'Ali', reason: 'contains nuts', kind: 'allergy' },
        { guest: 'Sara', reason: 'not vegetarian', kind: 'preference' },
      ],
    })
    const html = buildMenuHtml([c], 8, EVENT)
    expect(html).toContain('Alternative required for')
    expect(html).toContain('Ali (contains nuts)')
    expect(html).toContain('Sara (not vegetarian)')
  })

  test('omits alternative note when no exclusions', () => {
    const html = buildMenuHtml([course({ excludes: [] })], 8, EVENT)
    expect(html).not.toContain('Alternative required for')
  })

  test('renders "Guest alternates â€¦ get instead: <dish>" block when substitutions present', () => {
    const c = course({
      excludes: [
        { guest: 'Nadia', reason: 'not vegetarian', kind: 'preference' },
        { guest: 'Priya', reason: 'not vegetarian', kind: 'preference' },
      ],
      substitutions: [
        { guests: ['Nadia', 'Priya'], dishName: 'Baba Ganoush', origin: 'signature', sourceId: 'bg' },
      ],
    })
    const html = buildMenuHtml([c], 8, EVENT)
    expect(html).toContain('Guest alternates')
    expect(html).toContain('Nadia, Priya')
    expect(html).toContain('get instead: Baba Ganoush')
    // Explicit "instead" phrasing means the substitute reads as a REPLACEMENT
    // for the main, not an addition to the plate â€” the ambiguity the old
    // "Plated on the side" wording introduced.
    expect(html).not.toContain('Plated on the side')
    // And the honest-failure "Alternative required for" line must NOT fire
    // when a substitute was found â€” the two blocks are mutually exclusive.
    expect(html).not.toContain('Alternative required for')
  })

  test('mutual exclusivity: substitutions render only the Guest alternates block; unmet-exclusions render only Alternative required for', () => {
    const withSubs = course({
      excludes: [{ guest: 'Nadia', reason: 'not vegetarian', kind: 'preference' }],
      substitutions: [
        { guests: ['Nadia'], dishName: 'Ratatouille', origin: 'signature', sourceId: 'r1' },
      ],
    })
    const htmlWith = buildMenuHtml([withSubs], 4, EVENT)
    expect(htmlWith).toContain('Guest alternates')
    expect(htmlWith).not.toContain('Alternative required for')

    const noSubs = course({
      excludes: [{ guest: 'Sam', reason: 'contains nuts', kind: 'allergy' }],
    })
    const htmlNoSubs = buildMenuHtml([noSubs], 4, EVENT)
    expect(htmlNoSubs).not.toContain('Guest alternates')
    expect(htmlNoSubs).toContain('Alternative required for')
  })

  test('fallback origin renders as "Chefâ€™s adaptation"', () => {
    const html = buildMenuHtml([course({ origin: 'fallback' })], 4, EVENT)
    expect(html).toContain('Chefâ€™s adaptation')
  })

  test('includes portion guidance for each non-empty course', () => {
    const courses: Course[] = [
      course({ slot: 'starter', slotLabel: 'To Start', dishName: 'Amuse Bouche' }),
      course({ slot: 'dessert', slotLabel: 'To Finish', dishName: 'Panna Cotta', sourceId: '2' }),
    ]
    const html = buildMenuHtml(courses, 6, EVENT)
    expect(html).toContain('Enough for ~6 bellies') // start slot yield
    expect(html).toContain('Enough for ~8 bellies') // finish slot yield
  })

  test('omits portion guidance for empty courses', () => {
    const html = buildMenuHtml(
      [course({ slot: 'main', slotLabel: 'Main â€” Sea', dishName: '', origin: 'empty', sourceId: null })],
      6,
      EVENT
    )
    expect(html).not.toContain('Enough for')
  })

  test('includes cream background and gold border in styles', () => {
    const html = buildMenuHtml([course({})], 4, EVENT)
    expect(html).toContain('#F3E9DD')
    expect(html).toContain('#C9A96E')
  })

  test('includes @media print rule', () => {
    const html = buildMenuHtml([course({})], 4, EVENT)
    expect(html).toContain('@media print')
  })

  test('returns valid HTML structure', () => {
    const html = buildMenuHtml([course({})], 4, EVENT)
    expect(html).toMatch(/^<!DOCTYPE html>/)
    expect(html).toContain('</html>')
    expect(html).toContain('<body')
    expect(html).toContain('</body>')
  })

  test('HTML-escapes user data in title', () => {
    const html = buildMenuHtml([course({})], 4, { title: '<script>alert(1)</script>', event_date: '2026-08-12T18:00:00Z' })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  test('HTML-escapes dish name', () => {
    const html = buildMenuHtml([course({ dishName: '<b>Bold</b>' })], 4, EVENT)
    expect(html).not.toContain('<b>Bold</b>')
    expect(html).toContain('&lt;b&gt;Bold&lt;/b&gt;')
  })

  test('HTML-escapes exclusion guest name and reason', () => {
    const c = course({ excludes: [{ guest: 'A<B', reason: 'x>y', kind: 'allergy' }] })
    const html = buildMenuHtml([c], 4, EVENT)
    expect(html).not.toContain('A<B')
    expect(html).toContain('A&lt;B')
    expect(html).not.toContain('x>y')
    expect(html).toContain('x&gt;y')
  })
})

