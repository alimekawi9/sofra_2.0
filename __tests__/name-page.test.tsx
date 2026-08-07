import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import NameOnboardingPage from '@/app/(auth)/name/page'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'

jest.mock('@/lib/supabase/client')
jest.mock('next/navigation', () => ({ useRouter: jest.fn(), useSearchParams: jest.fn() }))

const replace = jest.fn()
let query = new URLSearchParams()

function makeSupabase() {
  const insert = jest.fn().mockResolvedValue({ error: null })
  const from = jest.fn().mockReturnValue({ insert })
  ;(createClient as jest.Mock).mockReturnValue({ from })
  return { from, insert }
}

beforeEach(() => {
  jest.clearAllMocks()
  localStorage.clear()
  query = new URLSearchParams()
  ;(useRouter as jest.Mock).mockReturnValue({ replace })
  ;(useSearchParams as jest.Mock).mockImplementation(() => query)
  Object.defineProperty(globalThis, 'crypto', {
    value: { randomUUID: jest.fn().mockReturnValue('new-name-only-id') },
    configurable: true,
  })
})

afterEach(() => {
  jest.restoreAllMocks()
})

it('creates a new user with a null phone and no phone field is ever shown', async () => {
  const { from, insert } = makeSupabase()
  query.set('next', '/events/ev-1')
  render(<NameOnboardingPage />)

  expect(screen.queryByLabelText(/phone/i)).not.toBeInTheDocument()

  await userEvent.type(screen.getByLabelText(/your name/i), 'Layla')
  await userEvent.click(screen.getByRole('button', { name: /continue/i }))

  await waitFor(() => expect(replace).toHaveBeenCalledWith('/events/ev-1'))
  expect(from).toHaveBeenCalledWith('users')
  expect(insert).toHaveBeenCalledWith({ id: 'new-name-only-id', name: 'Layla', phone: null })
  expect(localStorage.getItem('sofra_user_id')).toBe('new-name-only-id')
})

it('falls back to /events when next is missing', async () => {
  makeSupabase()
  render(<NameOnboardingPage />)
  await userEvent.type(screen.getByLabelText(/your name/i), 'Tarek')
  await userEvent.click(screen.getByRole('button', { name: /continue/i }))
  await waitFor(() => expect(replace).toHaveBeenCalledWith('/events'))
})

it('redirects immediately if an identity is already stored, without inserting a user', async () => {
  localStorage.setItem('sofra_user_id', 'already-logged-in')
  const { insert } = makeSupabase()
  query.set('next', '/events/ev-2')
  render(<NameOnboardingPage />)
  await waitFor(() => expect(replace).toHaveBeenCalledWith('/events/ev-2'))
  expect(insert).not.toHaveBeenCalled()
})

it('does not submit a blank name', async () => {
  const { insert } = makeSupabase()
  render(<NameOnboardingPage />)
  expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled()
  expect(insert).not.toHaveBeenCalled()
})
