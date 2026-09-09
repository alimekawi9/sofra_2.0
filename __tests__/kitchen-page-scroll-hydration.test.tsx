// Deliberately does NOT mock framer-motion (unlike kitchen-page.test.tsx), because this test exists
// specifically to catch a class of bug the mocked suite structurally cannot see: Framer Motion's real
// useScroll({ target }) throws "Target ref is defined but not hydrated" if the target ref's DOM node
// isn't mounted within one microtask of the hook running (node_modules/framer-motion/dist/es/value/use-scroll.mjs).
// The Kitchen page's scroll-track ref used to only mount once an async Supabase fetch resolved --
// always slower than one microtask -- so this crashed on every real page load despite the full mocked
// suite passing. Confirmed by temporarily reverting the fix and observing this exact test fail with
// the exact error a user reported in production.
import { render, screen, waitFor } from '@testing-library/react'
import KitchenPage from '@/app/(chef)/kitchen/page'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

function builder() {
  const chain: Record<string, jest.Mock> = {
    select: jest.fn(() => chain),
    eq: jest.fn(() => chain),
    order: jest.fn(() => new Promise((resolve) => {
      // A real macrotask delay, simulating an actual network round-trip -- far longer than framer
      // motion's single-microtask ref-hydration grace period, matching real-world timing.
      setTimeout(() => resolve({ data: [], error: null }), 50)
    })),
  }
  return chain
}

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ from: () => builder() }),
}))

beforeEach(() => {
  localStorage.setItem('sofra_user_id', 'chef-1')
})

test('does not throw framer-motion\'s "target ref not hydrated" error while the page is loading', async () => {
  const onError = jest.fn()
  const originalOnError = window.onerror
  window.onerror = onError

  render(<KitchenPage />)
  expect(screen.getByText('Loading…')).toBeInTheDocument()

  await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument(), { timeout: 2000 })
  // Framer Motion's retry is microtask-scheduled; give it a beat past the fetch resolving too.
  await new Promise((r) => setTimeout(r, 50))

  window.onerror = originalOnError
  expect(onError).not.toHaveBeenCalled()
})
