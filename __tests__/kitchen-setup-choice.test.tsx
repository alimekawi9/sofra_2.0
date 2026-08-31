import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import KitchenSetupChoicePage from '@/app/(chef)/events/[id]/kitchen-setup/page'
import { createClient } from '@/lib/supabase/client'
import { isEventManager } from '@/lib/event-access'

const mockPush = jest.fn()
const mockReplace = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => new URLSearchParams('from_page=table'),
}))
jest.mock('@/lib/supabase/client')
jest.mock('@/lib/event-access', () => ({ isEventManager: jest.fn() }))

function makeSupabase(chefId: string | null = null) {
  const updateEq = jest.fn().mockResolvedValue({ error: null })
  const update = jest.fn().mockReturnValue({ eq: updateEq })
  const sb = {
    from: jest.fn((table: string) => {
      if (table !== 'events') throw new Error(`Unexpected table: ${table}`)
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({
              data: { host_id: 'host-1', chef_id: chefId, title: 'Sunday Table' },
              error: null,
            }),
          }),
        }),
        update,
      }
    }),
  }
  ;(createClient as jest.Mock).mockReturnValue(sb)
  return { update, updateEq }
}

beforeEach(() => {
  jest.clearAllMocks()
  localStorage.clear()
})

it('asks a host for the kitchen type and opens restaurant review only after Restaurant is chosen', async () => {
  localStorage.setItem('sofra_user_id', 'host-1')
  const db = makeSupabase()
  ;(isEventManager as jest.Mock).mockResolvedValue(true)

  render(<KitchenSetupChoicePage params={{ id: 'event-1' }} />)

  await userEvent.click(await screen.findByRole('button', { name: /restaurant/i }))
  expect(db.update).toHaveBeenCalledWith({ chef_id: null, kitchen_status: 'pending' })
  expect(db.updateEq).toHaveBeenCalledWith('id', 'event-1')
  expect(mockPush).toHaveBeenCalledWith('/events/event-1/out?from_page=table')
})

it('gives an assigned chef the same choice without removing their assignment', async () => {
  localStorage.setItem('sofra_user_id', 'chef-1')
  const db = makeSupabase('chef-1')
  ;(isEventManager as jest.Mock).mockResolvedValue(false)

  render(<KitchenSetupChoicePage params={{ id: 'event-1' }} />)

  await userEvent.click(await screen.findByRole('button', { name: /home \/ other/i }))
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/kitchen?from=event-1&from_page=table&delegate=1'))
  expect(db.update).not.toHaveBeenCalled()
})
