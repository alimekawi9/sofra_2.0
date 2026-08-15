import { NextResponse, type NextRequest } from 'next/server'

export const runtime = 'nodejs'

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
const USER_AGENT = 'Sofra/1.0 (https://joinsofra.vercel.app)'
const MIN_REQUEST_INTERVAL_MS = 1000
const CACHE_TTL_MS = 10 * 60 * 1000

type SearchResult = {
  place_id: number
  display_name: string
  name?: string
  lat: string
  lon: string
}

type CachedSearch = { expiresAt: number; results: ReturnType<typeof normalizeResults> }
const cache = new Map<string, CachedSearch>()
let requestQueue = Promise.resolve()
let lastRequestAt = 0

function normalizeResults(rows: SearchResult[]) {
  return rows.slice(0, 5).map((row) => {
    const text = row.display_name.trim()
    const mainText = row.name?.trim() || text.split(',')[0]?.trim() || text
    const secondaryText = text.startsWith(mainText)
      ? text.slice(mainText.length).replace(/^,\s*/, '')
      : text
    return {
      placeId: String(row.place_id),
      text,
      mainText,
      secondaryText,
      latitude: Number(row.lat),
      longitude: Number(row.lon),
    }
  })
}

async function waitForRateLimit() {
  const waitMs = Math.max(0, MIN_REQUEST_INTERVAL_MS - (Date.now() - lastRequestAt))
  if (waitMs > 0) await new Promise(resolve => setTimeout(resolve, waitMs))
  lastRequestAt = Date.now()
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')?.trim() ?? ''
  if (query.length < 3 || query.length > 200) {
    return NextResponse.json({ results: [] })
  }

  const cacheKey = query.toLocaleLowerCase('en-US')
  const cached = cache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json({ results: cached.results })
  }

  let releaseQueue!: () => void
  const previousRequest = requestQueue
  requestQueue = new Promise<void>(resolve => { releaseQueue = resolve })

  try {
    await previousRequest
    await waitForRateLimit()
    const url = new URL(NOMINATIM_URL)
    url.searchParams.set('q', query)
    url.searchParams.set('format', 'jsonv2')
    url.searchParams.set('addressdetails', '1')
    url.searchParams.set('limit', '5')

    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Referer': 'https://joinsofra.vercel.app/',
        'Accept-Language': 'en',
      },
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) throw new Error(`Nominatim returned HTTP_${response.status}`)

    const results = normalizeResults(await response.json() as SearchResult[])
    cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, results })
    return NextResponse.json({ results })
  } catch {
    return NextResponse.json({ error: 'Location suggestions are temporarily unavailable.' }, { status: 503 })
  } finally {
    releaseQueue()
  }
}
