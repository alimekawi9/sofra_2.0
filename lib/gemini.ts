import 'server-only'
import { GoogleGenAI } from '@google/genai'

export type GeminiErrorKind = 'no-key' | 'timeout' | 'rate-limit' | 'truncated' | 'markdown-wrapper' | 'malformed' | 'api-error'

export class GeminiError extends Error {
  kind: GeminiErrorKind
  constructor(kind: GeminiErrorKind, message: string) {
    super(message)
    this.kind = kind
    this.name = 'GeminiError'
  }
}

const MODEL = process.env.GEMINI_MENU_MODEL || 'gemini-3.5-flash-lite'

// 2026-08-07: gemini-2.5-flash-lite returned 404 "no longer available to new
// users" on every attempt (real measure-gemini-timing.mjs run against the
// demo event) — that was the actual cause of the AI-generation fallback, not
// a timeout. Re-measured against the same ~4892-char demo-event prompt:
//   gemini-3.5-flash-lite: 2212ms, 1831ms, 1833ms (fast, but generic
//     allergen reasoning, e.g. "respects all dietary restrictions").
//   gemini-3.6-flash: 14518ms, 15991ms, 13204ms (7-8x slower but still
//     ~27% of the 60s budget at worst; reasoning names specific allergens
//     per dish, e.g. "mushroom-free", "nut ingredients").
// Chose gemini-3.6-flash for the more specific deficit-weighting reasoning
// this prompt depends on. See scripts/measure-ai-prompt.mjs +
// scripts/measure-gemini-timing.mjs to re-measure whenever the prompt or
// model catalog changes.
const TIMEOUT_MS = 8_000
export const GEMINI_MAX_OUTPUT_TOKENS = 1_600

let cached: GoogleGenAI | null = null
function client(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new GeminiError('no-key', 'GEMINI_API_KEY is not set')
  if (!cached) cached = new GoogleGenAI({ apiKey })
  return cached
}

// 429 (quota) and 503 (UNAVAILABLE/"high demand") are both the kind of
// transient, load-related failure Gemini's own error message describes as
// "usually temporary" -- worth one short retry. Timeouts, missing keys, and
// other API errors are not retried: a timeout already spent the whole budget,
// and other failures are unlikely to resolve within one request.
const isRetryable = (msg: string) => /429|rate|quota|503|unavailable|overloaded|high demand/i.test(msg)
const RETRY_DELAY_MS = 500

async function attemptGeminiCall(ai: GoogleGenAI, prompt: string, responseJsonSchema?: object) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  const startedAt = Date.now()
  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseJsonSchema,
        maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
        thinkingConfig: { thinkingBudget: 1 },
        abortSignal: controller.signal,
      },
    })
    console.log(`[gemini] request succeeded in ${Date.now() - startedAt}ms`)
    return response
  } catch (err) {
    const elapsedMs = Date.now() - startedAt
    const msg = err instanceof Error ? err.message : String(err)
    if (controller.signal.aborted) {
      console.error(`[gemini] request timed out after ${elapsedMs}ms (limit ${TIMEOUT_MS}ms)`)
      throw new GeminiError('timeout', `Gemini request timed out after ${TIMEOUT_MS}ms`)
    }
    console.error(`[gemini] request failed after ${elapsedMs}ms: ${msg}`)
    if (isRetryable(msg)) {
      throw new GeminiError('rate-limit', `Gemini rate-limited: ${msg}`)
    }
    throw new GeminiError('api-error', `Gemini call failed: ${msg}`)
  } finally {
    clearTimeout(timer)
  }
}

// Calls Gemini and returns parsed JSON. Throws GeminiError with a specific kind
// on any failure so callers can decide how to fall back / surface the error.
export async function callGeminiJson<T = unknown>(prompt: string, responseJsonSchema?: object): Promise<T> {
  const ai = client()

  // Rough token estimate only (chars/4) — no tokenizer dependency. Good enough
  // to spot whether prompt growth correlates with the observed latency/timeouts.
  const promptChars = prompt.length
  const promptTokensEst = Math.round(promptChars / 4)
  console.log(`[gemini] sending prompt: ${promptChars} chars (~${promptTokensEst} tokens est.)`)

  let response
  try {
    response = await attemptGeminiCall(ai, prompt, responseJsonSchema)
  } catch (err) {
    if (!(err instanceof GeminiError) || err.kind !== 'rate-limit') throw err
    console.log(`[gemini] retrying once after a transient failure (waiting ${RETRY_DELAY_MS}ms): ${err.message}`)
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
    response = await attemptGeminiCall(ai, prompt, responseJsonSchema)
  }

  const text = response?.text
  const finishReason=response?.candidates?.[0]?.finishReason
  const outputTokens=response?.usageMetadata?.candidatesTokenCount
  const trimmed=text?.trim()??''
  const fenced=/^```(?:json)?\s*[\s\S]*\s*```$/i.test(trimmed)
  const diagnostic={model:response?.modelVersion??MODEL,finishReason:finishReason??null,responseMimeType:'application/json',rawLength:text?.length??0,outputTokens:outputTokens??null,beginsWithObject:trimmed.startsWith('{'),markdownFence:fenced,first300:trimmed.slice(0,300),last300:trimmed.slice(-300)}
  if(process.env.NODE_ENV!=='production')console.log('[gemini] response diagnostic:',JSON.stringify(diagnostic))

  if(finishReason==='MAX_TOKENS')throw new GeminiError('truncated',`Gemini structured response was truncated at ${outputTokens??GEMINI_MAX_OUTPUT_TOKENS} output tokens`)

  if (!text || typeof text !== 'string') {
    throw new GeminiError('malformed', 'Gemini returned an empty or non-text response')
  }

  const jsonText=fenced?trimmed.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim():trimmed
  if(fenced&&process.env.NODE_ENV==='production')throw new GeminiError('markdown-wrapper','Gemini wrapped structured JSON in Markdown')
  if(!jsonText.startsWith('{')||!jsonText.endsWith('}'))throw new GeminiError('malformed','Gemini structured response contained non-JSON prose or was incomplete')
  try {
    return JSON.parse(jsonText) as T
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[gemini] failed to parse structured JSON:',JSON.stringify({finishReason:finishReason??null,outputTokens:outputTokens??null,rawLength:text.length,message:msg}))
    throw new GeminiError('malformed', `Gemini returned malformed structured JSON (${finishReason??'unknown finish reason'})`)
  }
}
