/** @jest-environment node */

import { GET } from '@/app/api/locations/search/route'

afterEach(() => jest.restoreAllMocks())

it('identifies Sofra to Nominatim and returns at most five normalized results', async () => {
  const rows = Array.from({ length: 6 }, (_, index) => ({
    place_id: index + 1,
    display_name: `Venue ${index}, Cairo, Egypt`,
    name: `Venue ${index}`,
    lat: '30.0444',
    lon: '31.2357',
  }))
  const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => rows,
  } as Response)

  const response = await GET({
    nextUrl: new URL('http://localhost/api/locations/search?q=Venue%20Cairo'),
  } as never)
  const body = await response.json()

  expect(response.status).toBe(200)
  expect(body.results).toHaveLength(5)
  const [url, init] = fetchMock.mock.calls[0]
  expect(String(url)).toContain('nominatim.openstreetmap.org/search')
  expect((init?.headers as Record<string, string>)['User-Agent']).toContain('Sofra/1.0')
  expect(body.results[0]).toEqual(expect.objectContaining({
    text: 'Venue 0, Cairo, Egypt',
    mainText: 'Venue 0',
    latitude: 30.0444,
  }))
})
