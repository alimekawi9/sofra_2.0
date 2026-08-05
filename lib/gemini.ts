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
// Timeout calibration:
//   At ~5966-char prompt (commit b6975b5): 44194ms, 44343ms, 45020ms — moved
//   45s → 60s to clear the tail with ~35% headroom.
//   At ~6983-char prompt (post allergy/preference split, commit 5fbf895):
//   60006ms (TIMEOUT), 37111ms, 34907ms — 1/3 attempts hit the ceiling.
//   At ~4732-char prompt (post shortlistSignaturesForAI + compressed prose):
//   37511ms, 29760ms, 39551ms — 0 timeouts, max ~40s. Headroom is back to
//   ~50%. See scripts/measure-ai-prompt.mjs + scripts/measure-gemini-timing.mjs
//   to re-measure whenever the prompt grows again.
const TIMEOUT_MS = 60_000

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

  // Rough token estimate only (chars/4) — no tokenizer dependency. Good enough
  // to spot whether prompt growth correlates with the observed latency/timeouts.
  const promptChars = prompt.length
  const promptTokensEst = Math.round(promptChars / 4)
  console.log(`[gemini] sending prompt: ${promptChars} chars (~${promptTokensEst} tokens est.)`)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  const startedAt = Date.now()

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
    console.log(`[gemini] request succeeded in ${Date.now() - startedAt}ms`)
  } catch (err) {
    const elapsedMs = Date.now() - startedAt
    const msg = err instanceof Error ? err.message : String(err)
    if (controller.signal.aborted) {
      console.error(`[gemini] request timed out after ${elapsedMs}ms (limit ${TIMEOUT_MS}ms)`)
      throw new GeminiError('timeout', `Gemini request timed out after ${TIMEOUT_MS}ms`)
    }
    console.error(`[gemini] request failed after ${elapsedMs}ms: ${msg}`)
    if (/429|rate|quota/i.test(msg)) {
      throw new GeminiError('rate-limit', `Gemini rate-limited: ${msg}`)
    }
    throw new GeminiError('api-error', `Gemini call failed: ${msg}`)
  } finally {
    clearTimeout(timer)
  }

  const text = response?.text
  if (process.env.NODE_ENV !== 'production') {
    console.log('[gemini] raw response:', text)
  }

  if (!text || typeof text !== 'string') {
    throw new GeminiError('malformed', 'Gemini returned an empty or non-text response')
  }

  try {
    return JSON.parse(text) as T
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[gemini] failed to parse response as JSON:', msg, '\nraw text:', text)
    throw new GeminiError('malformed', 'Gemini response was not valid JSON')
  }
}
