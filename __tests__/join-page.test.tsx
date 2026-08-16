import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import JoinPage from '@/app/(auth)/join/page'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'

jest.mock('@/lib/supabase/client')
jest.mock('next/navigation', () => ({ useRouter: jest.fn(), useSearchParams: jest.fn() }))

const replace = jest.fn()
let query = new URLSearchParams('next=%2Fevents%2Fev-1%2Frsvp')

function makeSupabase(existingId: string | null = null) {
  const insert = jest.fn().mockResolvedValue({ error: null })
  const maybeSingle = jest.fn().mockResolvedValue({ data: existingId ? { id: existingId } : null, error: null })
  const from = jest.fn().mockReturnValue({
    select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ maybeSingle }) }),
    insert,
  })
  ;(createClient as jest.Mock).mockReturnValue({ from })
  return { from, insert, maybeSingle }
}

beforeEach(() => {
  jest.clearAllMocks()
  localStorage.clear()
  query = new URLSearchParams('next=%2Fevents%2Fev-1%2Frsvp')
  ;(useRouter as jest.Mock).mockReturnValue({ replace })
  ;(useSearchParams as jest.Mock).mockImplementation(() => query)
  Object.defineProperty(globalThis, 'crypto', { value: { randomUUID: jest.fn().mockReturnValue('new-id') }, configurable: true })
})

async function openForm() {
  await userEvent.click(screen.getByRole('button', { name: /yalla/i }))
}

it('requires a name and presents phone as optional in the same flow', async () => {
  makeSupabase()
  render(<JoinPage />)
  await openForm()
  expect(screen.getByLabelText('Your name')).toBeRequired()
  expect(screen.getByLabelText(/international phone number/i)).not.toBeRequired()
})

it('a name-only submission creates and never searches by name', async () => {
  const { from, insert, maybeSingle } = makeSupabase()
  render(<JoinPage />)
  await openForm()
  await userEvent.type(screen.getByLabelText('Your name'), 'Alex')
  await userEvent.click(screen.getByRole('button', { name: /continue/i }))
  await waitFor(() => expect(insert).toHaveBeenCalledWith({ id: 'new-id', name: 'Alex', phone: null }))
  expect(maybeSingle).not.toHaveBeenCalled()
  expect(from).toHaveBeenCalledWith('users')
  expect(replace).toHaveBeenCalledWith('/events/ev-1/rsvp')
})

it('uses a supplied normalized phone to resume an existing identity', async () => {
  const { insert, maybeSingle } = makeSupabase('existing-id')
  render(<JoinPage />)
  await openForm()
  await userEvent.type(screen.getByLabelText('Your name'), 'Any display name')
  await userEvent.type(screen.getByLabelText(/international phone number/i), '+20 10 1234 5678')
  await userEvent.click(screen.getByRole('button', { name: /continue/i }))
  await waitFor(() => expect(maybeSingle).toHaveBeenCalled())
  expect(insert).not.toHaveBeenCalled()
  expect(localStorage.getItem('sofra_user_id')).toBe('existing-id')
})

it('creates with name and normalized phone when the phone is unknown', async () => {
  const { insert } = makeSupabase()
  render(<JoinPage />)
  await openForm()
  await userEvent.type(screen.getByLabelText('Your name'), 'Layla')
  await userEvent.type(screen.getByLabelText(/international phone number/i), '+20 (10) 1234-5678')
  await userEvent.click(screen.getByRole('button', { name: /continue/i }))
  await waitFor(() => expect(insert).toHaveBeenCalledWith({ id: 'new-id', name: 'Layla', phone: '+201012345678' }))
})
