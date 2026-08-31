/** @jest-environment node */
jest.mock('server-only', () => ({}))
jest.mock('@google/genai')

import { GoogleGenAI } from '@google/genai'
import { callGeminiJson, callGeminiJsonWithInlineData, GeminiError } from '@/lib/gemini'

const mockGenerateContent = jest.fn()
;(GoogleGenAI as unknown as jest.Mock).mockImplementation(() => ({
  models: { generateContent: mockGenerateContent },
}))

beforeEach(() => {
  jest.clearAllMocks()
  process.env.GEMINI_API_KEY = 'test-key'
})

const ok = { text: '{"ok":true}', candidates: [{ finishReason: 'STOP' }] }
const unavailable = new Error('{"error":{"code":503,"message":"This model is currently experiencing high demand. Please try again later.","status":"UNAVAILABLE"}}')

it('retries once on a transient 503/UNAVAILABLE failure and succeeds on the second attempt', async () => {
  mockGenerateContent.mockRejectedValueOnce(unavailable).mockResolvedValueOnce(ok)
  const result = await callGeminiJson('prompt')
  expect(result).toEqual({ ok: true })
  expect(mockGenerateContent).toHaveBeenCalledTimes(2)
})

it('propagates a GeminiError with kind rate-limit if the retry also fails', async () => {
  mockGenerateContent.mockRejectedValue(unavailable)
  await expect(callGeminiJson('prompt')).rejects.toMatchObject({ kind: 'rate-limit' })
  expect(mockGenerateContent).toHaveBeenCalledTimes(2)
})

it('does not retry a non-transient failure', async () => {
  mockGenerateContent.mockRejectedValue(new Error('some other unexpected failure'))
  await expect(callGeminiJson('prompt')).rejects.toBeInstanceOf(GeminiError)
  expect(mockGenerateContent).toHaveBeenCalledTimes(1)
})

it('retries a truncated menu extraction with the expanded output budget', async () => {
  mockGenerateContent
    .mockResolvedValueOnce({ text: '{"dishes":[', candidates: [{ finishReason: 'MAX_TOKENS' }] })
    .mockResolvedValueOnce({ text: '{"dishes":[]}', candidates: [{ finishReason: 'STOP' }] })

  await expect(callGeminiJsonWithInlineData(
    'menu',
    { mimeType: 'application/pdf', data: 'JVBERg==' },
    {},
    { maxOutputTokens: 16_000, retryMaxOutputTokens: 32_000, timeoutMs: 45_000 }
  )).resolves.toEqual({ dishes: [] })

  expect(mockGenerateContent).toHaveBeenCalledTimes(2)
  expect(mockGenerateContent.mock.calls[0][0].config.maxOutputTokens).toBe(16_000)
  expect(mockGenerateContent.mock.calls[1][0].config.maxOutputTokens).toBe(32_000)
})
