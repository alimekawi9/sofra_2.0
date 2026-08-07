import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LoginPage from '@/app/(auth)/login/page'
import { safeNext } from '@/lib/navigation'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'

jest.mock('@/lib/supabase/client')
jest.mock('next/navigation', () => ({ useRouter: jest.fn(), useSearchParams: jest.fn() }))

const replace = jest.fn()
let query = new URLSearchParams()

function makeSupabase(existingId: string | null) {
  const insert = jest.fn().mockResolvedValue({ error: null })
  const maybeSingle = jest.fn().mockResolvedValue({
    data: existingId ? { id: existingId } : null,
    error: null,
  })
  const from = jest.fn().mockReturnValue({
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({ maybeSingle }),
    }),
    insert,
  })
  ;(createClient as jest.Mock).mockReturnValue({ from })
  return { insert }
}

beforeEach(() => {
  jest.clearAllMocks()
  localStorage.clear()
  query = new URLSearchParams()
  ;(useRouter as jest.Mock).mockReturnValue({ replace })
  ;(useSearchParams as jest.Mock).mockImplementation(() => query)
  Object.defineProperty(globalThis, 'crypto', {
    value: { randomUUID: jest.fn().mockReturnValue('new-user-id') },
    configurable: true,
  })
})

afterEach(() => {
  jest.restoreAllMocks()
})

async function goToPhoneStep() {
  await userEvent.click(screen.getByRole('button', { name: /yalla/i }))
}

it('shows the welcome splash first, with no form fields', async () => {
  makeSupabase(null)
  render(<LoginPage />)
  expect(screen.getByRole('button', { name: /yalla/i })).toBeInTheDocument()
  expect(screen.queryByLabelText(/phone/i)).not.toBeInTheDocument()
})

it('an existing phone logs the user in directly, without ever asking for a name', async () => {
  const setItem = jest.spyOn(Storage.prototype, 'setItem')
  query.set('next', '/events/ev-1')
  makeSupabase('existing-user-id')
  render(<LoginPage />)
  await goToPhoneStep()
  await userEvent.type(screen.getByLabelText(/phone number/i), '+201234567890')
  await userEvent.click(screen.getByRole('button', { name: /continue/i }))
  await waitFor(() => expect(replace).toHaveBeenCalledWith('/events/ev-1'))
  expect(localStorage.getItem('sofra_user_id')).toBe('existing-user-id')
  expect(setItem.mock.invocationCallOrder[0]).toBeLessThan(replace.mock.invocationCallOrder[0])
  expect(screen.queryByLabelText(/your name/i)).not.toBeInTheDocument()
})

it('a new phone number advances to the name step, then creates the user with both fields', async () => {
  const setItem = jest.spyOn(Storage.prototype, 'setItem')
  query.set('next', '/events/ev-1')
  const { insert } = makeSupabase(null)
  render(<LoginPage />)
  await goToPhoneStep()
  await userEvent.type(screen.getByLabelText(/phone number/i), '+201234567890')
  await userEvent.click(screen.getByRole('button', { name: /continue/i }))

  await waitFor(() => expect(screen.getByLabelText(/your name/i)).toBeInTheDocument())
  await userEvent.type(screen.getByLabelText(/your name/i), 'Layla')
  await userEvent.click(screen.getByRole('button', { name: /continue/i }))

  await waitFor(() => expect(replace).toHaveBeenCalledWith('/events/ev-1'))
  expect(insert).toHaveBeenCalledWith({ id: 'new-user-id', name: 'Layla', phone: '+201234567890' })
  expect(localStorage.getItem('sofra_user_id')).toBe('new-user-id')
  expect(replace.mock.invocationCallOrder[0]).toBeGreaterThan(insert.mock.invocationCallOrder[0])
  expect(setItem.mock.invocationCallOrder[0]).toBeLessThan(replace.mock.invocationCallOrder[0])
})

it('falls back to /events when next is missing', async () => {
  makeSupabase('existing-user-id')
  render(<LoginPage />)
  await goToPhoneStep()
  await userEvent.type(screen.getByLabelText(/phone number/i), '+201234567890')
  await userEvent.click(screen.getByRole('button', { name: /continue/i }))
  await waitFor(() => expect(replace).toHaveBeenCalledWith('/events'))
})

it('redirects immediately to next if an identity is already stored', async () => {
  localStorage.setItem('sofra_user_id', 'already-logged-in')
  query.set('next', '/events/ev-2')
  makeSupabase(null)
  render(<LoginPage />)
  await waitFor(() => expect(replace).toHaveBeenCalledWith('/events/ev-2'))
})

it('offers a name-only path from the phone step, preserving next', async () => {
  query.set('next', '/events/ev-1')
  makeSupabase(null)
  render(<LoginPage />)
  await goToPhoneStep()
  expect(screen.getByRole('link', { name: /continue with just your name/i })).toHaveAttribute(
    'href',
    '/name?next=%2Fevents%2Fev-1'
  )
})

it.each(['https://evil.example/path', '//evil.example/path', 'events/ev-1'])(
  'rejects unsafe next destination %s',
  (destination) => expect(safeNext(destination)).toBe('/events')
)

it('accepts an internal application path', () => {
  expect(safeNext('/events/ev-1')).toBe('/events/ev-1')
})
