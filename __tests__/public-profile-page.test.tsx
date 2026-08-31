import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PublicProfilePage from '@/app/(guest)/profile/[userId]/page'
import { createClient } from '@/lib/supabase/client'
import { fetchProfileHistory } from '@/lib/profiles'
import { disconnectConnection, getConnectionContext } from '@/lib/connections'
import { useRouter } from 'next/navigation'

jest.mock('@/lib/supabase/client')
jest.mock('@/lib/profiles', () => ({
  fetchProfileHistory: jest.fn(),
}))
jest.mock('@/lib/connections', () => ({
  getConnectionContext: jest.fn(),
  disconnectConnection: jest.fn(),
  requestConnection: jest.fn(),
  respondToConnectionRequest: jest.fn(),
  isConnectionSchemaUnavailable: (error: { code?: string }) => error?.code === 'PGRST202',
}))
jest.mock('next/navigation', () => ({ useRouter: jest.fn() }))

function profileClient() {
  return {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          maybeSingle: jest.fn().mockResolvedValue({
            data: { id: 'profile-2', name: 'Nadia', photo_url: null, caption: 'Always brings dessert.' },
            error: null,
          }),
        })),
      })),
    })),
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  localStorage.setItem('sofra_user_id', 'viewer-1')
  ;(useRouter as jest.Mock).mockReturnValue({ push: jest.fn() })
  ;(createClient as jest.Mock).mockReturnValue(profileClient())
})

it('does not fetch or render history before a connection is accepted', async () => {
  ;(getConnectionContext as jest.Mock).mockResolvedValue({ status: 'eligible', direction: 'none', originatingEventId: 'event-1', originatingEventTitle: 'Shared Sofra' })
  render(<PublicProfilePage params={{ userId: 'profile-2' }} />)

  await waitFor(() => expect(screen.getByText('Nadia')).toBeInTheDocument())
  expect(screen.getByText('Always brings dessert.')).toBeInTheDocument()
  expect(screen.getByText(/Connect to see their table history/i)).toBeInTheDocument()
  expect(fetchProfileHistory).not.toHaveBeenCalled()
})

it('fetches and displays history after the connection gate passes', async () => {
  ;(getConnectionContext as jest.Mock).mockResolvedValue({ status: 'accepted', direction: 'outgoing', requestId: 'connection-1' })
  ;(fetchProfileHistory as jest.Mock).mockResolvedValue([
    { id: 'event-1', title: 'Garden Sofra', date: 'Aug 12 at Ramla', went: 'Went' },
  ])
  render(<PublicProfilePage params={{ userId: 'profile-2' }} />)

  await waitFor(() => expect(screen.getByText('Garden Sofra')).toBeInTheDocument())
  expect(fetchProfileHistory).toHaveBeenCalledWith(expect.anything(), 'profile-2')
  expect(screen.queryByText(/Connect to see their table history/i)).not.toBeInTheDocument()
})

it('lets either participant unconnect and immediately locks profile history', async () => {
  ;(getConnectionContext as jest.Mock)
    .mockResolvedValueOnce({ status: 'accepted', direction: 'outgoing', requestId: 'connection-1' })
    .mockResolvedValueOnce({ status: 'cooldown', direction: 'none', requestId: 'connection-1' })
  ;(disconnectConnection as jest.Mock).mockResolvedValue(true)
  ;(fetchProfileHistory as jest.Mock).mockResolvedValue([
    { id: 'event-1', title: 'Garden Sofra', date: 'Aug 12 at Ramla', went: 'Went' },
  ])
  const user = userEvent.setup()
  render(<PublicProfilePage params={{ userId: 'profile-2' }} />)

  await screen.findByText('Garden Sofra')
  await user.click(screen.getByRole('button', { name: 'UNCONNECT' }))
  await user.click(screen.getByRole('button', { name: 'CONFIRM UNCONNECT' }))

  await waitFor(() => expect(disconnectConnection).toHaveBeenCalledWith(expect.anything(), 'connection-1', 'viewer-1'))
  expect(screen.queryByText('Garden Sofra')).not.toBeInTheDocument()
  expect(screen.getByText(/Connect to see their table history/i)).toBeInTheDocument()
})

it('still renders the profile when the connection migration is not installed', async () => {
  ;(getConnectionContext as jest.Mock).mockRejectedValue({ code: 'PGRST202', message: 'function missing from schema cache' })
  render(<PublicProfilePage params={{ userId: 'profile-2' }} />)

  await waitFor(() => expect(screen.getByText('Nadia')).toBeInTheDocument())
  expect(screen.queryByText("Couldn't load this profile. Try again.")).not.toBeInTheDocument()
  expect(screen.getByText(/Connections are temporarily unavailable/i)).toBeInTheDocument()
  expect(fetchProfileHistory).not.toHaveBeenCalled()
})
