/** @jest-environment node */

import { POST } from '@/app/api/signatures/suggest-metadata/route'
import { callGeminiJson } from '@/lib/gemini'

jest.mock('@/lib/gemini', () => ({ callGeminiJson: jest.fn() }))

const mockedGemini = callGeminiJson as jest.MockedFunction<typeof callGeminiJson>

function request(body: unknown) {
  return new Request('http://localhost/api/signatures/suggest-metadata', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => mockedGemini.mockReset())

test('suggests canonical signature metadata and locally verifies name allergens', async () => {
  mockedGemini.mockResolvedValue({ tags: ['main', 'rich', 'invented'], allergens: [] })
  const response = await POST(request({ name: 'Almond lamb stew', kind: 'signature' }))
  expect(response.status).toBe(200)
  await expect(response.json()).resolves.toEqual({ tags: ['rich', 'main'], allergens: ['nuts'] })
})

test('never permits dish roles in pantry suggestions', async () => {
  mockedGemini.mockResolvedValue({ tags: ['main', 'vegetable', 'fresh'], allergens: [] })
  const response = await POST(request({ name: 'Heirloom tomato', kind: 'pantry' }))
  expect(response.status).toBe(200)
  await expect(response.json()).resolves.toEqual({ tags: ['vegetable', 'fresh'], allergens: [] })
})

test('rejects an invalid suggestion request before calling the model', async () => {
  const response = await POST(request({ name: '', kind: 'pantry' }))
  expect(response.status).toBe(400)
  expect(mockedGemini).not.toHaveBeenCalled()
})
