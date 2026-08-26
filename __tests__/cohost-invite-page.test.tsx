import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CohostInvitePage from '@/app/(guest)/events/[id]/cohost/page'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'

jest.mock('@/lib/supabase/client')
jest.mock('next/navigation', () => ({ useRouter: jest.fn(), useSearchParams: jest.fn() }))

const replace = jest.fn()
const push = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  localStorage.clear()
  ;(useRouter as jest.Mock).mockReturnValue({ replace, push })
  ;(useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('token=cohost-token'))
  ;(createClient as jest.Mock).mockReturnValue({
    from: jest.fn((table: string) => {
      if (table === 'events') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: {
                  id: 'event-1',
                  title: 'The Odyssey',
                  tagline: 'Dinner together',
                  event_date: '2027-08-11T19:00:00.000Z',
                  venue: 'Krasi',
                  dress_code: null,
                  host_id: 'host-1',
                  chef_id: null,
                  host: { id: 'host-1', name: 'Ali', photo_url: null },
                },
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'event_cohost_invites') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                maybeSingle: jest.fn().mockResolvedValue({ data: { event_id: 'event-1', status: 'pending' }, error: null }),
              }),
            }),
          }),
        }
      }
      throw new Error(`Unexpected table in test: ${table}`)
    }),
  })
})

it('shows the co-host landing before asking a logged-out recipient to sign in', async () => {
  render(<CohostInvitePage params={{ id: 'event-1' }} />)

  expect(await screen.findByText('You are invited to co-host!')).toBeInTheDocument()
  expect(screen.getByText('The Odyssey')).toBeInTheDocument()
  expect(replace).not.toHaveBeenCalled()

  await userEvent.click(screen.getByRole('button', { name: 'See the co-host invitation' }))
  expect(replace).toHaveBeenCalledWith(
    '/login?invite=1&next=%2Fevents%2Fevent-1%2Fcohost%3Ftoken%3Dcohost-token%26claim%3D1'
  )
})
