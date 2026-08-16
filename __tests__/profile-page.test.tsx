import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import ProfilePage from '@/app/(guest)/profile/page'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

jest.mock('@/lib/supabase/client')
jest.mock('next/navigation', () => ({ useRouter: jest.fn() }))

const push = jest.fn()

type UserRow = { name: string; phone: string | null; photo_url: string | null; caption?: string | null }

function makeSupabase(user: UserRow, hostedEventId: string | null = null) {
  const updateEq = jest.fn().mockResolvedValue({ error: null })
  const update = jest.fn().mockReturnValue({ eq: updateEq })
  const from = jest.fn((table: string) => {
    if (table === 'users') {
      return {
        update,
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
    if (table === 'events') {
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: jest.fn().mockResolvedValue({
                  data: hostedEventId ? { id: hostedEventId } : null,
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }
    }
    throw new Error(`unexpected table ${table}`)
  })
  ;(createClient as jest.Mock).mockReturnValue({ from })
  return { from, update }
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

it('prompts a host with no preferences on Profile and allows dismissal', async () => {
  localStorage.setItem('sofra_user_id', 'host-id')
  makeSupabase({ name: 'Layla', phone: null, photo_url: null }, 'event-id')
  render(<ProfilePage />)

  const addLink = await screen.findByRole('link', { name: /add my preferences/i })
  expect(addLink).toHaveAttribute('href', '/events/event-id/rsvp?preferences=1')

  fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: /my table preferences/i })).toBeInTheDocument()
  expect(localStorage.getItem('sofra_dismiss_host_preferences:host-id')).toBe('1')
})

it('locks a saved caption until Edit caption is pressed', async () => {
  localStorage.setItem('sofra_user_id', 'caption-user')
  const sb = makeSupabase({ name: 'Layla', phone: null, photo_url: null, caption: null })
  render(<ProfilePage />)

  const caption = await screen.findByLabelText(/about me/i)
  fireEvent.change(caption, { target: { value: 'Always brings dessert.' } })
  fireEvent.click(screen.getByRole('button', { name: /save caption/i }))

  await waitFor(() => expect(sb.update).toHaveBeenCalledWith({ caption: 'Always brings dessert.' }))
  await waitFor(() => expect(screen.queryByRole('textbox', { name: /about me/i })).not.toBeInTheDocument())
  expect(screen.getByText('Always brings dessert.')).toHaveClass('sv2-caption-locked')
  expect(screen.getByRole('button', { name: /edit caption/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /edit caption/i })).toHaveClass('sv2-caption-edit')

  fireEvent.click(screen.getByRole('button', { name: /edit caption/i }))
  expect(screen.getByRole('textbox', { name: /about me/i })).toHaveValue('Always brings dessert.')
  expect(screen.getByRole('button', { name: /save caption/i })).toBeInTheDocument()
})
