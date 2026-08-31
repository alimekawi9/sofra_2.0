/** @jest-environment node */

import { POST } from '@/app/api/restaurant-menus/extract/route'
import { callGeminiJson, callGeminiJsonWithInlineData } from '@/lib/gemini'

jest.mock('@/lib/gemini', () => ({
  callGeminiJson: jest.fn(),
  callGeminiJsonWithInlineData: jest.fn(),
}))

const mockedTextGemini = callGeminiJson as jest.MockedFunction<typeof callGeminiJson>
const mockedFileGemini = callGeminiJsonWithInlineData as jest.MockedFunction<typeof callGeminiJsonWithInlineData>

function request(body: unknown) {
  return new Request('http://localhost/api/restaurant-menus/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  mockedTextGemini.mockReset()
  mockedFileGemini.mockReset()
})

test('passes a validated PDF to Gemini as server-side inline data', async () => {
  mockedFileGemini.mockResolvedValue({ dishes: [{
    name: 'Braised Lamb',
    source_text: 'Braised lamb with herbs',
    role: 'main',
    tags: ['lamb', 'braised'],
    allergens: [],
    confidence: 0.96,
    uncertainties: [],
  }] })

  const response = await POST(request({ fileDataUrl: 'data:application/pdf;base64,JVBERi0xLjQ=' }))

  expect(response.status).toBe(200)
  expect(mockedFileGemini).toHaveBeenCalledWith(
    expect.stringContaining('extract every actual orderable dish'),
    { mimeType: 'application/pdf', data: 'JVBERi0xLjQ=' },
    expect.any(Object),
    { maxOutputTokens: 16_000, retryMaxOutputTokens: 32_000, timeoutMs: 45_000 }
  )
  await expect(response.json()).resolves.toMatchObject({ dishes: [{ name: 'Braised Lamb', suggestedRole: 'main' }] })
})

test('rejects unsupported menu file types before calling Gemini', async () => {
  const response = await POST(request({ fileDataUrl: 'data:text/plain;base64,SGVsbG8=' }))
  expect(response.status).toBe(413)
  expect(mockedFileGemini).not.toHaveBeenCalled()
  expect(mockedTextGemini).not.toHaveBeenCalled()
})
