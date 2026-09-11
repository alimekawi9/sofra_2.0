import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LoginPage from '@/app/(auth)/login/page'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'

jest.mock('@/lib/supabase/client')
jest.mock('next/navigation', () => ({ useRouter: jest.fn(), useSearchParams: jest.fn() }))
const replace = jest.fn()
let query = new URLSearchParams()
const getUser = jest.fn(), signInWithOAuth = jest.fn(), signInWithOtp = jest.fn()

beforeEach(() => {
  jest.clearAllMocks(); query = new URLSearchParams()
  getUser.mockResolvedValue({ data: { user: null } }); signInWithOAuth.mockResolvedValue({ error: null }); signInWithOtp.mockResolvedValue({ error: null })
  ;(createClient as jest.Mock).mockReturnValue({ auth: { getUser, signInWithOAuth, signInWithOtp } })
  ;(useRouter as jest.Mock).mockReturnValue({ replace }); (useSearchParams as jest.Mock).mockImplementation(() => query)
})

it('preserves the welcome splash then offers Google and email below the plate', async () => {
  render(<LoginPage />)
  await waitFor(() => expect(screen.getByRole('button', { name: /yalla/i })).toBeInTheDocument())
  await userEvent.click(screen.getByRole('button', { name: /yalla/i }))
  expect(screen.getByRole('button', { name: /continue with google/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /continue with email/i })).toBeInTheDocument()
  expect(screen.queryByLabelText(/phone/i)).not.toBeInTheDocument()
})

it('starts Google OAuth with the safe return destination', async () => {
  query.set('invite', '1'); query.set('next', '/events/ev-1/rsvp')
  render(<LoginPage />)
  await userEvent.click(await screen.findByRole('button', { name: /continue with google/i }))
  expect(signInWithOAuth).toHaveBeenCalledWith(expect.objectContaining({ provider: 'google', options: expect.objectContaining({ redirectTo: expect.stringContaining(encodeURIComponent('/events/ev-1/rsvp')) }) }))
})

it('sends a magic link and shows confirmation', async () => {
  query.set('invite', '1'); render(<LoginPage />)
  await userEvent.click(await screen.findByRole('button', { name: /continue with email/i }))
  await userEvent.type(screen.getByLabelText('EMAIL'), 'guest@example.com')
  await userEvent.click(screen.getByRole('button', { name: /email me a link/i }))
  await waitFor(() => expect(signInWithOtp).toHaveBeenCalledWith(expect.objectContaining({ email: 'guest@example.com' })))
  expect(screen.getByText(/check your email/i)).toBeInTheDocument()
})

it('redirects an authenticated Supabase user without using localStorage', async () => {
  query.set('next', '/events/ev-2'); getUser.mockResolvedValue({ data: { user: { id: 'auth-1' } } })
  render(<LoginPage />)
  await waitFor(() => expect(replace).toHaveBeenCalledWith('/events/ev-2'))
  expect(localStorage.getItem('sofra_user_id')).toBeNull()
})
