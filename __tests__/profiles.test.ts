import { fetchMutuals, transformProfileHistory } from '@/lib/profiles'

it('derives unique mutuals from qualifying shared RSVP rows and excludes the subject', async () => {
  const statusCalls: string[][] = []
  const client = {
    from: jest.fn(() => ({
      select: jest.fn((selection: string) => {
        if (selection === 'event_id') {
          const chain: Record<string, jest.Mock> = {
            eq: jest.fn(() => chain),
            in: jest.fn((_field: string, statuses: string[]) => {
              statusCalls.push(statuses)
              return Promise.resolve({ data: [{ event_id: 'event-1' }], error: null })
            }),
          }
          return chain
        }
        const chain: Record<string, jest.Mock> = {
          in: jest.fn((_field: string, values: string[]) => {
            if (_field === 'status') {
              statusCalls.push(values)
              return Promise.resolve({
                data: [
                  { user_id: 'viewer-1', users: { id: 'viewer-1', name: 'Viewer', photo_url: null } },
                  { user_id: 'mutual-2', users: { id: 'mutual-2', name: 'Mutual', photo_url: '/avatar.jpg' } },
                  { user_id: 'mutual-2', users: { id: 'mutual-2', name: 'Mutual', photo_url: '/avatar.jpg' } },
                ],
                error: null,
              })
            }
            return chain
          }),
        }
        return chain
      }),
    })),
  }

  const mutuals = await fetchMutuals(client as never, 'viewer-1')
  expect(mutuals).toEqual([{ id: 'mutual-2', name: 'Mutual', photoUrl: '/avatar.jpg' }])
  expect(statusCalls).toEqual([['going', 'maybe'], ['going', 'maybe']])
})

it('only transforms going and maybe rows into profile history', () => {
  const event = { id: 'event-1', title: 'Sofra', event_date: '2020-01-01T00:00:00Z', venue: null }
  expect(transformProfileHistory([
    { id: '1', status: 'going', events: event },
    { id: '2', status: 'cant', events: { ...event, id: 'event-2' } },
  ], Date.parse('2026-01-01'))).toHaveLength(1)
})
