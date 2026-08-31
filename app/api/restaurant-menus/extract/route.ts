import { NextResponse } from 'next/server'
import { callGeminiJson, callGeminiJsonWithInlineData, GeminiError } from '@/lib/gemini'
import { DISH_ROLES } from '@/lib/dish-presets'
import { KITCHEN_ALLERGENS, tagsForKitchenKind } from '@/lib/kitchen-tags'
import { parseRestaurantMenuFileDataUrl, sanitizeRestaurantMenuExtraction } from '@/lib/restaurant-menu'

type Body = { menuText?: unknown; fileDataUrl?: unknown; imageDataUrl?: unknown }

const responseSchema = {
  type: 'object',
  properties: {
    dishes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          source_text: { type: 'string' },
          role: { type: 'string', enum: [...DISH_ROLES] },
          tags: { type: 'array', items: { type: 'string', enum: tagsForKitchenKind('signature') }, maxItems: 10 },
          allergens: { type: 'array', items: { type: 'string', enum: [...KITCHEN_ALLERGENS] }, maxItems: 8 },
          confidence: { type: 'number' },
          uncertainties: { type: 'array', items: { type: 'string' }, maxItems: 5 },
        },
        required: ['name', 'source_text', 'role', 'tags', 'allergens', 'confidence', 'uncertainties'],
        additionalProperties: false,
      },
    },
  },
  required: ['dishes'],
  additionalProperties: false,
}

const prompt = `Read this restaurant menu and extract every actual orderable dish.
Return the dish's printed name, one concise menu line supporting your interpretation, one role, only the most relevant descriptive tags, and possible allergens.
For each dish also return confidence from 0 to 1 and a short uncertainties array. Use high confidence only when the printed menu clearly supports the proposed identity, role, tags, and allergens. List a concrete uncertainty when an important interpretation is ambiguous; otherwise return an empty array.
Roles and tags must come only from the supplied output enums. Do not invent ingredients or safety claims. If a description does not establish an allergen, omit it. These are AI suggestions that a human will review, not verified dietary facts. Ignore headings, prices, add-ons that are not standalone dishes, contact details, and marketing copy.`

export async function POST(request: Request) {
  let body: Body
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }
  const menuText = typeof body.menuText === 'string' ? body.menuText.trim() : ''
  // imageDataUrl remains accepted for compatibility with an older client.
  const fileDataUrl = typeof body.fileDataUrl === 'string' ? body.fileDataUrl : typeof body.imageDataUrl === 'string' ? body.imageDataUrl : ''
  if (!menuText && !fileDataUrl) return NextResponse.json({ error: 'Paste menu text or choose a menu image or PDF.' }, { status: 400 })
  if (menuText.length > 40_000) return NextResponse.json({ error: 'Menu text must be under 40,000 characters.' }, { status: 413 })

  try {
    let raw: unknown
    if (fileDataUrl) {
      const file = parseRestaurantMenuFileDataUrl(fileDataUrl)
      if (!file) return NextResponse.json({ error: 'Choose a JPG, PNG, WebP, or PDF menu file under 5 MB.' }, { status: 413 })
      raw = await callGeminiJsonWithInlineData(
        prompt + (menuText ? `\nAdditional pasted text:\n${menuText}` : ''),
        { mimeType: file.mimeType, data: file.data },
        responseSchema,
        { maxOutputTokens: 16_000, retryMaxOutputTokens: 32_000, timeoutMs: 45_000 }
      )
    } else {
      try {
        raw = await callGeminiJson(`${prompt}\n\nMENU TEXT:\n${menuText}`, responseSchema, { maxOutputTokens: 16_000, timeoutMs: 45_000 })
      } catch (error) {
        if (!(error instanceof GeminiError) || error.kind !== 'truncated') throw error
        raw = await callGeminiJson(`${prompt}\nKeep each source_text especially concise.\n\nMENU TEXT:\n${menuText}`, responseSchema, { maxOutputTokens: 32_000, timeoutMs: 45_000 })
      }
    }
    const dishes = sanitizeRestaurantMenuExtraction(raw)
    if (!dishes.length) return NextResponse.json({ error: 'No clear dishes were found. Try a clearer file or paste the menu text.' }, { status: 422 })
    return NextResponse.json({ dishes })
  } catch (error) {
    console.error('[restaurant-menu] extraction failed', error)
    if (error instanceof GeminiError && error.kind === 'truncated') {
      return NextResponse.json({
        error: 'This menu contains more dishes than can be extracted in one pass. Try a PDF containing fewer menu pages or paste one section at a time.',
        ...(process.env.NODE_ENV !== 'production' ? { diagnostic: error.message } : {}),
      }, { status: 422 })
    }
    return NextResponse.json({
      error: 'Menu extraction is temporarily unavailable. Try again or paste clearer menu text.',
      ...(process.env.NODE_ENV !== 'production' && error instanceof Error ? { diagnostic: error.message } : {}),
    }, { status: 503 })
  }
}
