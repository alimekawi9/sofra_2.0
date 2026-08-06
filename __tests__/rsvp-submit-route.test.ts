/** @jest-environment node */

import { POST } from '@/app/api/rsvp/submit/route'
import { createClient } from '@/lib/supabase/server'

jest.mock('@/lib/supabase/server')

const validBody = {
  eventId: '11111111-1111-4111-8111-111111111111',
  userId: '22222222-2222-4222-8222-222222222222',
  status: 'going',
  dietary: ['Vegetarian'],
  avoid: ['Nuts'],
  proteinPreferences: ['fish', 'shellfish'],
  flavorPreference: ['Fresh', 'Rich'],
  adventurousness: 70,
}

function request(body: unknown) {
  return { json: async () => body } as Request
}

beforeEach(() => jest.clearAllMocks())

it('calls the atomic idempotent RPC with correctly serialized production fields', async () => {
  const rpc = jest.fn().mockResolvedValue({
    data: { success: true, eventId: validBody.eventId, userId: validBody.userId, nextPath: `/events/${validBody.eventId}` },
    error: null,
  })
  ;(createClient as jest.Mock).mockReturnValue({ rpc })
  const response = await POST(request(validBody))
  expect(response.status).toBe(200)
  expect(rpc).toHaveBeenCalledWith('submit_rsvp_preferences', {
    p_event_id: validBody.eventId,
    p_user_id: validBody.userId,
    p_status: 'going',
    p_dietary: ['Vegetarian'],
    p_avoid: ['Nuts'],
    p_protein_preferences: ['fish', 'shellfish'],
    p_flavor_preference: ['Fresh', 'Rich'],
    p_adventurousness: 70,
  })
})

it('rejects invalid event identity before calling Supabase', async () => {
  const rpc = jest.fn()
  ;(createClient as jest.Mock).mockReturnValue({ rpc })
  const response = await POST(request({ ...validBody, eventId: null }))
  expect(response.status).toBe(400)
  expect(rpc).not.toHaveBeenCalled()
})

it('returns the internal Supabase code and stage without private payload data', async () => {
  const rpc = jest.fn().mockResolvedValue({ data: null, error: { code: '42703', message: 'missing column' } })
  ;(createClient as jest.Mock).mockReturnValue({ rpc })
  const response = await POST(request(validBody))
  expect(response.status).toBe(500)
  expect(await response.json()).toEqual(expect.objectContaining({
    success: false, stage: 'saving_preferences', code: '42703',
  }))
})

it('distinguishes a missing user or event', async () => {
  const rpc = jest.fn().mockResolvedValue({ data: null, error: { code: 'P0002', message: 'user_not_found' } })
  ;(createClient as jest.Mock).mockReturnValue({ rpc })
  const response = await POST(request(validBody))
  expect(response.status).toBe(404)
  expect(await response.json()).toEqual(expect.objectContaining({ stage: 'resolving_user', code: 'P0002' }))
})
