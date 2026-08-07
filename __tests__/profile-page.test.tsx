import { render, screen, waitFor } from '@testing-library/react'
import ProfilePage from '@/app/(guest)/profile/page'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

jest.mock('@/lib/supabase/client')
jest.mock('next/navigation', () => ({ useRouter: jest.fn() }))

const push = jest.fn()

type UserRow = { name: string; phone: string | null; photo_url: string | null }

function makeSupabase(user: UserRow) {
  const from = jest.fn((table: string) => {
    if (table === 'users') {
      return {
        select: () => ({
          eq: () => ({ maybeSingle: jest.fn().mockResolvedValue({ data: user, error: null }) }),
        }),
      }
    }
    if (table === 'rsvps') {
      return {
        select: () => ({
          eq: jest.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }
    }
    if (table === 'taste_profiles') {
      return {
        select: () => ({
          eq: () => ({ maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }) }),
        }),
      }
    }
    throw new Error(`unexpected table ${table}`)
  })
  ;(createClient as jest.Mock).mockReturnValue({ from })
  return { from }
}

beforeEach(() => {
  jest.clearAllMocks()
  localStorage.clear()
  ;(useRouter as jest.Mock).mockReturnValue({ push })
})

afterEach(() => {
  jest.restoreAllMocks()
})

it('loads and displays an existing phone-based user unchanged', async () => {
  localStorage.setItem('sofra_user_id', 'phone-user-id')
  makeSupabase({ name: 'Layla', phone: '+201234567890', photo_url: null })
  render(<ProfilePage />)

  await waitFor(() => expect(screen.getByText('Layla')).toBeInTheDocument())
  expect(screen.getByText(/\+201234567890/)).toBeInTheDocument()
})

it('loads a name-only user with a null phone without crashing or showing a phone', async () => {
  localStorage.setItem('sofra_user_id', 'name-only-id')
  makeSupabase({ name: 'Tarek', phone: null, photo_url: null })
  render(<ProfilePage />)

  await waitFor(() => expect(screen.getByText('Tarek')).toBeInTheDocument())
  expect(screen.queryByText(/\+\d/)).not.toBeInTheDocument()
})

it('redirects to /login when no identity is stored', async () => {
  render(<ProfilePage />)
  await waitFor(() => expect(push).toHaveBeenCalledWith('/login'))
})
