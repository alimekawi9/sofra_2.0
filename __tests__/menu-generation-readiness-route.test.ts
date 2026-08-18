/** @jest-environment node */

import { POST } from '@/app/api/menu/generate-ai/route'
import { createClient } from '@/lib/supabase/server'

jest.mock('@/lib/supabase/server')

function request(body: unknown) {
  return { json: async () => body } as Request
}

function pendingEventClient(event: { host_id: string; chef_id: string | null }) {
  const from = jest.fn((table: string) => {
    if (table !== 'events') throw new Error(`Unexpected table ${table}`)
    return {
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { ...event, kitchen_status: 'pending' } }) }),
      }),
    }
  })
  ;(createClient as jest.Mock).mockReturnValue({ from })
  return from
}

beforeEach(() => jest.clearAllMocks())

it('requires an explicit confirmation before a host generates without Kitchen data', async () => {
  pendingEventClient({ host_id: 'host-1', chef_id: null })
  const response = await POST(request({ eventId: 'event-1', userId: 'host-1' }))
  expect(response.status).toBe(409)
  expect(await response.json()).toEqual(expect.objectContaining({ code: 'KITCHEN_UNFILLED' }))
})

it('shows the same warning handshake to the assigned chef', async () => {
  pendingEventClient({ host_id: 'host-1', chef_id: 'chef-1' })
  const response = await POST(request({ eventId: 'event-1', userId: 'chef-1' }))
  expect(response.status).toBe(409)
  expect(await response.json()).toEqual(expect.objectContaining({ code: 'KITCHEN_UNFILLED' }))
})
