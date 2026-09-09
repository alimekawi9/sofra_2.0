import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import ProfilePreferencesPage from '@/app/(guest)/profile/preferences/page'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

jest.mock('@/lib/supabase/client')
jest.mock('next/navigation', () => ({ useRouter: jest.fn() }))

const push = jest.fn()
const replace = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  localStorage.clear()
  ;(useRouter as jest.Mock).mockReturnValue({ push, replace })
})

function makeSupabase(profile: Record<string, unknown> | null = null) {
  const upsert = jest.fn().mockResolvedValue({ error: null })
  const maybeSingle = jest.fn().mockResolvedValue({ data: profile, error: null })
  const from = jest.fn().mockReturnValue({
    select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ maybeSingle }) }),
    upsert,
  })
  ;(createClient as jest.Mock).mockReturnValue({ from })
  return { upsert }
}

it('loads and saves profile preferences without requiring an event or RSVP', async () => {
  localStorage.setItem('sofra_user_id', 'guest-1')
  const sb = makeSupabase({
    dietary: ['Vegetarian'],
    avoid: [],
    protein_anchor: null,
    protein_preferences: ['fish'],
    flavor_preference: ['Bright'],
    adventurousness: 65,
  })
  render(<ProfilePreferencesPage />)

  await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Vegetarian' })).toBeChecked())
  fireEvent.click(screen.getByRole('checkbox', { name: 'No dairy' }))
  fireEvent.click(screen.getByRole('button', { name: 'SAVE MY PREFERENCES' }))

  await waitFor(() => expect(sb.upsert).toHaveBeenCalledWith(expect.objectContaining({
    user_id: 'guest-1',
    dietary: ['Vegetarian', 'No dairy'],
    adventurousness: 65,
  }), { onConflict: 'user_id' }))
  expect(push).toHaveBeenCalledWith('/profile')
})

it('round-trips the optional avoid-other text field', async () => {
  localStorage.setItem('sofra_user_id', 'guest-1')
  const sb = makeSupabase({
    dietary: [],
    avoid: ['Nuts'],
    avoid_other: 'no cilantro please',
    protein_anchor: null,
    protein_preferences: ['fish'],
    flavor_preference: [],
    adventurousness: 50,
  })
  render(<ProfilePreferencesPage />)

  const input = await screen.findByPlaceholderText('Anything else to avoid? (optional)')
  expect(input).toHaveValue('no cilantro please')
  fireEvent.change(input, { target: { value: 'also no raw onions' } })
  fireEvent.click(screen.getByRole('button', { name: 'SAVE MY PREFERENCES' }))

  await waitFor(() => expect(sb.upsert).toHaveBeenCalledWith(expect.objectContaining({
    user_id: 'guest-1',
    avoid_other: 'also no raw onions',
  }), { onConflict: 'user_id' }))
})

it('returns signed-out users to login with the preference destination preserved', async () => {
  makeSupabase()
  render(<ProfilePreferencesPage />)
  await waitFor(() => expect(replace).toHaveBeenCalledWith('/login?next=%2Fprofile%2Fpreferences'))
})
