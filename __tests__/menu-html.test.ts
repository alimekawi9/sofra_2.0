// __tests__/menu-html.test.ts
jest.mock('@/lib/supabase/client', () => ({ createClient: () => null }))
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }) }))

import { buildMenuHtml } from '@/app/(chef)/events/[id]/menu/page'
import type { Course } from '@/lib/menu'

const EVENT = { title: 'Summer Feast', event_date: '2026-08-12T18:00:00Z' }

const course = (overrides: Partial<Course>): Course => ({
  slot: 'start',
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
      course({ slot: 'start', slotLabel: 'To Start', dishName: 'Amuse Bouche' }),
      course({ slot: 'finish', slotLabel: 'To Finish', dishName: 'Panna Cotta', sourceId: '2' }),
    ]
    const html = buildMenuHtml(courses, 6, EVENT)
    expect(html).toContain('To Start')
    expect(html).toContain('Amuse Bouche')
    expect(html).toContain('To Finish')
    expect(html).toContain('Panna Cotta')
  })

  test('renders "— TBD —" for empty course', () => {
    const html = buildMenuHtml([course({ dishName: '', origin: 'empty', sourceId: null })], 4, EVENT)
    expect(html).toContain('— TBD —')
  })

  test('includes alternative note when course has exclusions', () => {
    const c = course({
      excludes: [
        { guest: 'Ali', reason: 'contains nuts' },
        { guest: 'Sara', reason: 'not vegetarian' },
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
    const c = course({ excludes: [{ guest: 'A<B', reason: 'x>y' }] })
    const html = buildMenuHtml([c], 4, EVENT)
    expect(html).not.toContain('A<B')
    expect(html).toContain('A&lt;B')
    expect(html).not.toContain('x>y')
    expect(html).toContain('x&gt;y')
  })
})
