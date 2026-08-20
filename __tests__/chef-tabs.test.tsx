import { render, screen, waitFor } from '@testing-library/react'
import ChefTabs from '@/components/ChefTabs'
import { createClient } from '@/lib/supabase/client'

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }))
jest.mock('@/lib/supabase/client')

const HOST_UID = 'uid-host'
const COHOST_UID = 'uid-cohost'
const GUEST_UID = 'uid-guest'

function makeSupabase({ isCohost = false }: { isCohost?: boolean } = {}) {
  const sb = {
    from: jest.fn((table: string) => {
      if (table === 'events') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({ data: { host_id: HOST_UID }, error: null }),
            }),
          }),
        }
      }
      if (table === 'event_cohosts') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                maybeSingle: jest.fn().mockResolvedValue({ data: isCohost ? { user_id: COHOST_UID } : null, error: null }),
              }),
            }),
          }),
        }
      }
      throw new Error(`Unexpected table in test: ${table}`)
    }),
  }
  ;(createClient as jest.Mock).mockReturnValue(sb)
  return sb
}

beforeEach(() => {
  jest.clearAllMocks()
  localStorage.clear()
})

it('limits an assigned chef to Kitchen, Drafted Menu, and Recipes', () => {
  makeSupabase()
  render(<ChefTabs eventId="event-1" active="kitchen" restrictedChef title="Dinner" />)
  expect(screen.getByRole('button', { name: 'Kitchen' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Drafted Menu' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Recipes' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'The Table' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Fill kitchen myself' })).not.toBeInTheDocument()
})

it('shows kitchen-delegation actions to the original host', async () => {
  localStorage.setItem('sofra_user_id', HOST_UID)
  makeSupabase()
  render(<ChefTabs eventId="event-1" active="table" title="Dinner" />)
  expect(await screen.findByRole('button', { name: 'Fill kitchen myself' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Send To A Chef' })).toBeInTheDocument()
})

it('also shows kitchen-delegation actions to an accepted co-host, not just the original host', async () => {
  localStorage.setItem('sofra_user_id', COHOST_UID)
  makeSupabase({ isCohost: true })
  render(<ChefTabs eventId="event-1" active="table" title="Dinner" />)
  expect(await screen.findByRole('button', { name: 'Fill kitchen myself' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Send To A Chef' })).toBeInTheDocument()
})

it('hides kitchen-delegation actions from a guest who is neither host nor co-host', async () => {
  localStorage.setItem('sofra_user_id', GUEST_UID)
  makeSupabase({ isCohost: false })
  render(<ChefTabs eventId="event-1" active="table" title="Dinner" />)
  await waitFor(() => expect(screen.getByRole('button', { name: 'The Table' })).toBeInTheDocument())
  expect(screen.queryByRole('button', { name: 'Fill kitchen myself' })).not.toBeInTheDocument()
})
