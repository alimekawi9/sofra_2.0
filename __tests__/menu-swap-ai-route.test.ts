/** @jest-environment node */

import { POST } from '@/app/api/menu/swap-ai/route'
import { createClient } from '@/lib/supabase/server'
import { callGeminiJson } from '@/lib/gemini'
import { requireAppUser } from '@/lib/auth/server-user'

jest.mock('@/lib/supabase/server')
jest.mock('@/lib/gemini')
jest.mock('@/lib/auth/server-user')

function request(body: unknown) {
  return { json: async () => body } as Request
}

const HOST_ID = 'host-1'
const EVENT_ID = 'event-1'
const MENU_ID = 'menu-1'
const COURSE_ID = 'course-1'

type Options = {
  hostId?: string
  chefId?: string | null
  cohostIds?: string[]
  otherDishNames?: string[]
  guests?: Array<{ userId: string; dietary?: string[]; avoid?: string[] }>
}

function buildSupabase({
  hostId = HOST_ID,
  chefId = null,
  cohostIds = [],
  otherDishNames = ['Existing Starter'],
  guests = [{ userId: 'guest-1' }],
}: Options = {}) {
  const targetCourseRow = { id: COURSE_ID, menu_id: MENU_ID, slot: 'main' }
  const updateCalls: Array<Record<string, unknown>> = []

  const rsvpRows = guests.map((g) => ({ user_id: g.userId, users: { name: g.userId } }))
  const profileRows = guests.map((g) => ({
    user_id: g.userId,
    dietary: g.dietary ?? [],
    avoid: g.avoid ?? [],
    protein_anchor: null,
    protein_preferences: [],
    flavor_preference: [],
    adventurousness: 50,
  }))

  const from = jest.fn((table: string) => {
    if (table === 'events') {
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { host_id: hostId, chef_id: chefId } }) }) }) }
    }
    if (table === 'event_cohosts') {
      return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: cohostIds.length ? { user_id: cohostIds[0] } : null }) }) }) }) }
    }
    if (table === 'menus') {
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { event_id: EVENT_ID } }) }) }) }
    }
    if (table === 'menu_courses') {
      return {
        select: (cols: string) => {
          if (cols === 'id,menu_id,slot') return { eq: () => ({ maybeSingle: async () => ({ data: targetCourseRow }) }) }
          if (cols === 'dish_name') return { eq: async () => ({ data: otherDishNames.map((name) => ({ dish_name: name })) }) }
          throw new Error(`Unexpected menu_courses select: ${cols}`)
        },
        update: (fields: Record<string, unknown>) => ({
          eq: () => ({
            select: () => ({
              single: async () => { updateCalls.push(fields); return { data: { ...targetCourseRow, ...fields } } },
            }),
          }),
        }),
      }
    }
    if (table === 'rsvps') {
      return { select: () => ({ eq: () => ({ in: async () => ({ data: rsvpRows }) }) }) }
    }
    if (table === 'pantry_items') {
      return { select: () => ({ eq: () => ({ eq: async () => ({ data: [] }) }) }) }
    }
    if (table === 'taste_profiles') {
      return { select: () => ({ in: async () => ({ data: profileRows }) }) }
    }
    throw new Error(`Unexpected table in test: ${table}`)
  })
  ;(createClient as jest.Mock).mockReturnValue({ from })
  return { updateCalls }
}

const VALID_DISH = {
  role: 'main',
  finalName: 'Lemon Herb Chicken',
  usedAvailableIngredients: [],
  missingIngredients: [],
  reasoning: '',
  metadata: {
    proteinBase: ['chicken'],
    flavors: ['fresh'],
    textures: ['tender'],
    techniques: ['roasted'],
    temperature: ['hot'],
    richness: ['fresh'],
    noveltyScore: 0.5,
    dietary: ['meat'],
    allergens: [],
    substantial: true,
  },
}

beforeEach(() => { jest.clearAllMocks(); (requireAppUser as jest.Mock).mockResolvedValue({ authUserId: 'auth-host', appUserId: HOST_ID }) })

it('rejects a caller who is neither host, chef, nor co-host', async () => {
  buildSupabase({ hostId: 'someone-else' })
  const response = await POST(request({ eventId: EVENT_ID, userId: HOST_ID, courseId: COURSE_ID }))
  expect(response.status).toBe(403)
})

it('generates and persists one new dish once the deterministic swap has no options left', async () => {
  const { updateCalls } = buildSupabase()
  ;(callGeminiJson as jest.Mock).mockResolvedValue({ signatureRefinements: [], generatedDishes: [VALID_DISH] })
  const response = await POST(request({ eventId: EVENT_ID, userId: HOST_ID, courseId: COURSE_ID }))
  expect(response.status).toBe(200)
  const body = await response.json()
  expect(body.row.dish_name).toBe('Lemon Herb Chicken')
  expect(updateCalls).toHaveLength(1)
  expect(updateCalls[0]).toEqual(expect.objectContaining({ dish_origin: 'pantry-composed', source: null, component_ids: null }))
})

it('never proposes a dish that conflicts with a guest\'s stated diet', async () => {
  const { updateCalls } = buildSupabase({ guests: [{ userId: 'guest-1', dietary: ['vegetarian'] }] })
  ;(callGeminiJson as jest.Mock).mockResolvedValue({ signatureRefinements: [], generatedDishes: [VALID_DISH] })
  const response = await POST(request({ eventId: EVENT_ID, userId: HOST_ID, courseId: COURSE_ID }))
  expect(response.status).toBe(422)
  expect(updateCalls).toHaveLength(0)
})

it('surfaces a clear error instead of persisting anything when Gemini fails', async () => {
  const { updateCalls } = buildSupabase()
  ;(callGeminiJson as jest.Mock).mockRejectedValue(new Error('Gemini is down'))
  const response = await POST(request({ eventId: EVENT_ID, userId: HOST_ID, courseId: COURSE_ID }))
  expect(response.status).toBe(503)
  expect(updateCalls).toHaveLength(0)
})

it('tells the model to avoid every dish name already used elsewhere on the menu', async () => {
  buildSupabase({ otherDishNames: ['Existing Starter', 'Existing Side'] })
  ;(callGeminiJson as jest.Mock).mockResolvedValue({ signatureRefinements: [], generatedDishes: [VALID_DISH] })
  await POST(request({ eventId: EVENT_ID, userId: HOST_ID, courseId: COURSE_ID }))
  const [prompt] = (callGeminiJson as jest.Mock).mock.calls[0]
  expect(prompt).toContain('Existing Starter')
  expect(prompt).toContain('Existing Side')
})
