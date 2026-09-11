import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import NamePage from '@/app/(auth)/name/page'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'

jest.mock('@/lib/supabase/client')
jest.mock('next/navigation', () => ({ useRouter: jest.fn(), useSearchParams: jest.fn() }))
const replace = jest.fn(), getUser = jest.fn(), rpc = jest.fn()
let query = new URLSearchParams()

beforeEach(() => {
  jest.clearAllMocks(); query = new URLSearchParams(); getUser.mockResolvedValue({ data: { user: { id: 'auth-1' } } }); rpc.mockResolvedValue({ data: { userId: 'profile-1', needsName: false }, error: null })
  ;(createClient as jest.Mock).mockReturnValue({ auth: { getUser }, rpc }); (useRouter as jest.Mock).mockReturnValue({ replace }); (useSearchParams as jest.Mock).mockImplementation(() => query)
})

it('completes an authenticated email profile using the existing name plate', async () => {
  query.set('next', '/events/ev-1'); render(<NamePage />)
  await userEvent.type(await screen.findByLabelText(/your name/i), 'Layla')
  await userEvent.click(screen.getByRole('button', { name: /continue/i }))
  await waitFor(() => expect(rpc).toHaveBeenCalledWith('claim_current_user', { p_name: 'Layla', p_photo_url: null }))
  expect(replace).toHaveBeenCalledWith('/events/ev-1')
  expect(localStorage.getItem('sofra_user_id')).toBeNull()
})

it('rejects direct unauthenticated access', async () => {
  getUser.mockResolvedValue({ data: { user: null } }); render(<NamePage />)
  await waitFor(() => expect(replace).toHaveBeenCalledWith('/login?next=%2Fevents'))
})
