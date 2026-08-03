import 'server-only'
import { GoogleGenAI } from '@google/genai'

export type GeminiErrorKind = 'no-key' | 'timeout' | 'rate-limit' | 'malformed' | 'api-error'

export class GeminiError extends Error {
  kind: GeminiErrorKind
  constructor(kind: GeminiErrorKind, message: string) {
    super(message)
    this.kind = kind
    this.name = 'GeminiError'
  }
}

const MODEL = 'gemini-2.5-pro'
const TIMEOUT_MS = 30_000

let cached: GoogleGenAI | null = null
function client(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new GeminiError('no-key', 'GEMINI_API_KEY is not set')
  if (!cached) cached = new GoogleGenAI({ apiKey })
  return cached
}

// Calls Gemini and returns parsed JSON. Throws GeminiError with a specific kind
// on any failure so callers can decide how to fall back / surface the error.
export async function callGeminiJson<T = unknown>(prompt: string): Promise<T> {
  const ai = client()

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  let response
  try {
    response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        abortSignal: controller.signal,
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (controller.signal.aborted) {
      throw new GeminiError('timeout', `Gemini request timed out after ${TIMEOUT_MS}ms`)
    }
    if (/429|rate|quota/i.test(msg)) {
      throw new GeminiError('rate-limit', `Gemini rate-limited: ${msg}`)
    }
    throw new GeminiError('api-error', `Gemini call failed: ${msg}`)
  } finally {
    clearTimeout(timer)
  }

  const text = response?.text
  if (!text || typeof text !== 'string') {
    throw new GeminiError('malformed', 'Gemini returned an empty or non-text response')
  }

  try {
    return JSON.parse(text) as T
  } catch {
    throw new GeminiError('malformed', 'Gemini response was not valid JSON')
  }
}
