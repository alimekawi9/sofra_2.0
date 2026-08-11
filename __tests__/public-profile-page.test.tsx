import { render, screen, waitFor } from '@testing-library/react'
import PublicProfilePage from '@/app/(guest)/profile/[userId]/page'
import { createClient } from '@/lib/supabase/client'
import { areMutuals, fetchProfileHistory } from '@/lib/profiles'
import { useRouter } from 'next/navigation'

jest.mock('@/lib/supabase/client')
jest.mock('@/lib/profiles', () => ({
  areMutuals: jest.fn(),
  fetchProfileHistory: jest.fn(),
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

it('does not fetch or render history for a non-mutual viewer', async () => {
  ;(areMutuals as jest.Mock).mockResolvedValue(false)
  render(<PublicProfilePage params={{ userId: 'profile-2' }} />)

  await waitFor(() => expect(screen.getByText('Nadia')).toBeInTheDocument())
  expect(screen.getByText('Always brings dessert.')).toBeInTheDocument()
  expect(screen.getByText(/RSVP to a shared Sofra/i)).toBeInTheDocument()
  expect(fetchProfileHistory).not.toHaveBeenCalled()
})

it('fetches and displays history after the mutual gate passes', async () => {
  ;(areMutuals as jest.Mock).mockResolvedValue(true)
  ;(fetchProfileHistory as jest.Mock).mockResolvedValue([
    { id: 'event-1', title: 'Garden Sofra', date: 'Aug 12 with Ramla', went: 'Went' },
  ])
  render(<PublicProfilePage params={{ userId: 'profile-2' }} />)

  await waitFor(() => expect(screen.getByText('Garden Sofra')).toBeInTheDocument())
  expect(fetchProfileHistory).toHaveBeenCalledWith(expect.anything(), 'profile-2')
  expect(screen.queryByText(/RSVP to a shared Sofra/i)).not.toBeInTheDocument()
})

