import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RestaurantMenusPage from '@/app/(chef)/events/[id]/out/page'
import { createClient } from '@/lib/supabase/client'
import { isEventManager } from '@/lib/event-access'
import { fetchEventTasteAttendees } from '@/lib/event-attendees'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}))
jest.mock('@/lib/supabase/client')
jest.mock('@/lib/event-access', () => ({ isEventManager: jest.fn() }))
jest.mock('@/lib/event-attendees', () => ({ fetchEventTasteAttendees: jest.fn() }))

type SimilarMatch = { restaurant_name: string; dishes: { name: string; role: string; tags: string[]; contains_allergens: string[] }[] }

function makeSupabase({
  menus = [] as unknown[],
  similar = null as SimilarMatch | null,
  reuseMenuId = 'reused-menu-id' as string | null,
} = {}) {
  const maybeSingle = jest.fn().mockResolvedValue({ data: { host_id: 'host-1', chef_id: null, title: 'Sunday Table' }, error: null })
  const eq = jest.fn().mockReturnValue({ maybeSingle })
  const select = jest.fn().mockReturnValue({ eq })
  const from = jest.fn().mockReturnValue({ select })
  const rpc: jest.Mock = jest.fn((fn: string) => {
    if (fn === 'get_event_restaurant_menus') return Promise.resolve({ data: menus, error: null })
    if (fn === 'search_similar_restaurant_menu') return Promise.resolve({ data: similar, error: null })
    if (fn === 'reuse_restaurant_menu') return Promise.resolve({ data: reuseMenuId, error: reuseMenuId ? null : new Error('nope') })
    return Promise.resolve({ data: null, error: null })
  })
  const sb = { from, rpc }
  ;(createClient as jest.Mock).mockReturnValue(sb)
  return sb
}

beforeEach(() => {
  jest.clearAllMocks()
  localStorage.clear()
  localStorage.setItem('sofra_user_id', 'host-1')
  ;(isEventManager as jest.Mock).mockResolvedValue(true)
  ;(fetchEventTasteAttendees as jest.Mock).mockResolvedValue([])
})

afterEach(() => {
  delete (global as unknown as { fetch?: typeof fetch }).fetch
})

it('shows a reuse suggestion once a close match is found while typing the restaurant name', async () => {
  makeSupabase({
    similar: { restaurant_name: 'Tanoreen', dishes: [
      { name: 'Baba Ghanouj', role: 'starter', tags: ['vegetable'], contains_allergens: [] },
      { name: 'Lamb Shank', role: 'main', tags: ['lamb'], contains_allergens: [] },
    ] },
  })
  render(<RestaurantMenusPage params={{ id: 'event-1' }} />)

  await userEvent.type(await screen.findByLabelText(/restaurant name/i), 'Tanoreem')
  await waitFor(() => expect(screen.getByText(/previously reviewed menu for/i)).toBeInTheDocument(), { timeout: 1000 })
  expect(screen.getByText('Tanoreen')).toBeInTheDocument()
  expect(screen.getByText(/2 dishes/i)).toBeInTheDocument()
})

it('shows no suggestion when nothing matches', async () => {
  makeSupabase({ similar: null })
  render(<RestaurantMenusPage params={{ id: 'event-1' }} />)

  await userEvent.type(await screen.findByLabelText(/restaurant name/i), 'Brand New Place')
  await new Promise((resolve) => window.setTimeout(resolve, 600))
  expect(screen.queryByText(/previously reviewed menu for/i)).not.toBeInTheDocument()
})

it('dismissing the suggestion hides it without touching the rest of the form', async () => {
  makeSupabase({
    similar: { restaurant_name: 'Tanoreen', dishes: [{ name: 'Baba Ghanouj', role: 'starter', tags: [], contains_allergens: [] }] },
  })
  render(<RestaurantMenusPage params={{ id: 'event-1' }} />)

  await userEvent.type(await screen.findByLabelText(/restaurant name/i), 'Tanoreen')
  await waitFor(() => expect(screen.getByText(/previously reviewed menu for/i)).toBeInTheDocument(), { timeout: 1000 })

  await userEvent.click(screen.getByRole('button', { name: /upload a new menu instead/i }))
  expect(screen.queryByText(/previously reviewed menu for/i)).not.toBeInTheDocument()
  expect(screen.getByLabelText(/restaurant name/i)).toHaveValue('Tanoreen')
})

it('does not resurface a dismissed match while a new search is still debouncing', async () => {
  makeSupabase({
    similar: { restaurant_name: 'Tanoreen', dishes: [{ name: 'Baba Ghanouj', role: 'starter', tags: [], contains_allergens: [] }] },
  })
  render(<RestaurantMenusPage params={{ id: 'event-1' }} />)

  const input = await screen.findByLabelText(/restaurant name/i)
  await userEvent.type(input, 'Tanoreen')
  await waitFor(() => expect(screen.getByText(/previously reviewed menu for/i)).toBeInTheDocument(), { timeout: 1000 })

  await userEvent.click(screen.getByRole('button', { name: /upload a new menu instead/i }))
  expect(screen.queryByText(/previously reviewed menu for/i)).not.toBeInTheDocument()

  await userEvent.type(input, 'n')
  expect(screen.queryByText(/previously reviewed menu for/i)).not.toBeInTheDocument()
})

it('a failed search silently falls back to the plain upload form', async () => {
  const sb = makeSupabase({ similar: null })
  sb.rpc.mockImplementation((fn: string) => {
    if (fn === 'get_event_restaurant_menus') return Promise.resolve({ data: [], error: null })
    if (fn === 'search_similar_restaurant_menu') return Promise.reject(new Error('network down'))
    return Promise.resolve({ data: null, error: null })
  })
  render(<RestaurantMenusPage params={{ id: 'event-1' }} />)

  await userEvent.type(await screen.findByLabelText(/restaurant name/i), 'Any Restaurant')
  await new Promise((resolve) => window.setTimeout(resolve, 600))
  expect(screen.queryByText(/previously reviewed menu for/i)).not.toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('using a suggested menu calls the reuse RPC and skips AI extraction entirely', async () => {
  const fetchMock = jest.fn()
  global.fetch = fetchMock as unknown as typeof fetch
  const sb = makeSupabase({
    similar: { restaurant_name: 'Tanoreen', dishes: [
      { name: 'Baba Ghanouj', role: 'starter', tags: ['vegetable'], contains_allergens: [] },
      { name: 'Lamb Shank', role: 'main', tags: ['lamb'], contains_allergens: [] },
    ] },
  })
  render(<RestaurantMenusPage params={{ id: 'event-1' }} />)

  await userEvent.type(await screen.findByLabelText(/restaurant name/i), 'Tanoreem')
  await waitFor(() => expect(screen.getByText(/previously reviewed menu for/i)).toBeInTheDocument(), { timeout: 1000 })

  await userEvent.click(screen.getByRole('button', { name: /use this menu/i }))

  await waitFor(() => expect(sb.rpc).toHaveBeenCalledWith('reuse_restaurant_menu', {
    p_event_id: 'event-1',
    p_user_id: 'host-1',
    p_restaurant_name: 'Tanoreen',
    p_dishes: [
      { name: 'Baba Ghanouj', role: 'starter', tags: ['vegetable'], contains_allergens: [] },
      { name: 'Lamb Shank', role: 'main', tags: ['lamb'], contains_allergens: [] },
    ],
  }))
  expect(screen.getByText(/2 dishes reused from a previously reviewed 'Tanoreen' menu/i)).toBeInTheDocument()
  expect(fetchMock).not.toHaveBeenCalled()
})

it('shows an error banner and keeps the suggestion visible when the reuse RPC fails', async () => {
  makeSupabase({
    similar: { restaurant_name: 'Tanoreen', dishes: [{ name: 'Baba Ghanouj', role: 'starter', tags: [], contains_allergens: [] }] },
    reuseMenuId: null,
  })
  render(<RestaurantMenusPage params={{ id: 'event-1' }} />)

  await userEvent.type(await screen.findByLabelText(/restaurant name/i), 'Tanoreen')
  await waitFor(() => expect(screen.getByText(/previously reviewed menu for/i)).toBeInTheDocument(), { timeout: 1000 })

  await userEvent.click(screen.getByRole('button', { name: /use this menu/i }))

  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/could not reuse this menu/i))
  expect(screen.getByText(/previously reviewed menu for/i)).toBeInTheDocument()
})

it('renders REUSED MENU for a menu with source_type reused', async () => {
  makeSupabase({
    menus: [{
      id: 'menu-1', event_id: 'event-1', created_by: 'host-1', restaurant_name: 'Tanoreen',
      source_type: 'reused', raw_menu_text: null, status: 'confirmed', created_at: '2026-08-31T00:00:00Z', confirmed_at: '2026-08-31T00:00:00Z',
      dishes: [],
    }],
  })
  render(<RestaurantMenusPage params={{ id: 'event-1' }} />)
  expect(await screen.findByText('REUSED MENU')).toBeInTheDocument()
})
