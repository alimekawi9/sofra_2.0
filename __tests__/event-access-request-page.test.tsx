import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RequestEventAccessPage from '@/app/(guest)/events/[id]/request-access/page'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

jest.mock('@/lib/supabase/client')
jest.mock('next/navigation', () => ({ useRouter: jest.fn() }))

const mockReplace = jest.fn()
const EVENT = {
  id: 'event-1',
  host_id: 'host-1',
  chef_id: null,
  title: 'Garden Supper',
  tagline: 'Dinner under the stars',
  cover_url: null,
}

function makeSupabase({
  event = EVENT as typeof EVENT | null,
  rsvp = null as { user_id: string } | null,
  cohost = null as { user_id: string } | null,
  requestStatus = null as 'pending' | 'accepted' | 'rejected' | null,
  rpcData = 'pending' as string,
  rpcError = null as { message: string } | null,
} = {}) {
  const sb = {
    from: jest.fn((table: string) => ({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockImplementation(() => {
          if (table === 'events') {
            const result = jest.fn().mockResolvedValue({ data: event, error: null })
            return { single: result, maybeSingle: result }
          }
          return {
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({
                data: table === 'rsvps'
                  ? rsvp
                  : table === 'event_cohosts'
                    ? cohost
                    : requestStatus ? { status: requestStatus } : null,
                error: null,
              }),
            }),
          }
        }),
      }),
    })),
    rpc: jest.fn((name: string) => Promise.resolve(name === 'get_event_access_request_status'
      ? { data: requestStatus, error: null }
      : { data: rpcData, error: rpcError })),
  }
  ;(createClient as jest.Mock).mockReturnValue(sb)
  return sb
}

beforeEach(() => {
  jest.clearAllMocks()
  mockReplace.mockReset()
  ;(useRouter as jest.Mock).mockReturnValue({ replace: mockReplace })
  localStorage.clear()
  localStorage.setItem('sofra_user_id', 'guest-1')
})

it('sends a logged-out visitor to login while preserving the request page', async () => {
  localStorage.clear()
  const sb = makeSupabase()
  render(<RequestEventAccessPage params={{ id: 'event-1' }} />)

  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/login?invite=1&next=%2Fevents%2Fevent-1%2Frequest-access'))
  expect(sb.from).not.toHaveBeenCalled()
})

it('returns to Your Sofras when a stale request URL points to a deleted event', async () => {
  makeSupabase({ event: null })
  render(<RequestEventAccessPage params={{ id: 'event-1' }} />)

  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/events'))
})

it('shows a request button to a logged-in nonmember and sends the request', async () => {
  const sb = makeSupabase()
  render(<RequestEventAccessPage params={{ id: 'event-1' }} />)

  expect(await screen.findByRole('heading', { name: 'Garden Supper' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'REQUEST ACCESS' }))

  await waitFor(() => expect(sb.rpc).toHaveBeenCalledWith('request_event_access', {
    p_event_id: 'event-1',
    p_user_id: 'guest-1',
  }))
  expect(screen.getByText('REQUEST SENT')).toBeInTheDocument()
})

it('sends an accepted requester into the normal RSVP flow', async () => {
  makeSupabase({ requestStatus: 'accepted' })
  render(<RequestEventAccessPage params={{ id: 'event-1' }} />)

  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/events/event-1/rsvp'))
})

it('sends an existing member directly to the event', async () => {
  makeSupabase({ rsvp: { user_id: 'guest-1' } })
  render(<RequestEventAccessPage params={{ id: 'event-1' }} />)

  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/events/event-1'))
})
