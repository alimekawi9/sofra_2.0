import { areMutuals, fetchMutuals, fetchProfileHistory, transformProfileHistory } from '@/lib/profiles'

function profileClient(rows: Record<string, unknown[]>) {
  return {
    from: jest.fn((table: string) => ({
      select: jest.fn((selection: string) => {
        const result = { data: rows[`${table}:${selection}`] ?? [], error: null }
        type QueryChain = {
          eq: jest.Mock<QueryChain>
          in: jest.Mock<QueryChain>
          then: (resolve: (value: typeof result) => unknown) => Promise<unknown>
        }
        const chain = {} as QueryChain
        chain.eq = jest.fn(() => chain)
        chain.in = jest.fn(() => chain)
        chain.then = (resolve) => Promise.resolve(result).then(resolve)
        return chain
      }),
    })),
  }
}

it('derives mutuals from RSVP, original-host, and co-host event membership', async () => {
  const client = profileClient({
    'rsvps:event_id': [{ event_id: 'event-1' }],
    'events:id': [{ id: 'event-2' }],
    'event_cohosts:event_id': [{ event_id: 'event-3' }],
    'rsvps:user_id': [{ user_id: 'guest-2' }],
    'events:host_id': [{ host_id: 'host-2' }],
    'event_cohosts:user_id': [{ user_id: 'cohost-2' }, { user_id: 'cohost-2' }],
    'users:id,name,photo_url': [
      { id: 'guest-2', name: 'Guest', photo_url: null },
      { id: 'host-2', name: 'Host', photo_url: '/host.jpg' },
      { id: 'cohost-2', name: 'Co-host', photo_url: '/cohost.jpg' },
    ],
  })

  const mutuals = await fetchMutuals(client as never, 'viewer-1')
  expect(mutuals.map((user) => user.id)).toEqual(['guest-2', 'host-2', 'cohost-2'])
})

it('treats an original host and accepted co-host on the same event as mutuals', async () => {
  const client = profileClient({
    'rsvps:event_id': [],
    'events:id': [{ id: 'shared-event' }],
    'event_cohosts:event_id': [{ event_id: 'shared-event' }],
  })
  await expect(areMutuals(client as never, 'host-1', 'cohost-1')).resolves.toBe(true)
})

it('includes hosted and co-hosted events in profile history without an RSVP', async () => {
  const client = profileClient({
    'rsvps:event_id': [],
    'events:id': [{ id: 'hosted-event' }],
    'event_cohosts:event_id': [{ event_id: 'cohosted-event' }],
    'events:id,title,event_date,venue': [
      { id: 'hosted-event', title: 'Hosted Sofra', event_date: '2027-01-01T00:00:00Z', venue: null },
      { id: 'cohosted-event', title: 'Co-hosted Sofra', event_date: '2027-02-01T00:00:00Z', venue: null },
    ],
  })
  const history = await fetchProfileHistory(client as never, 'host-1')
  expect(history.map((event) => event.title)).toEqual(['Hosted Sofra', 'Co-hosted Sofra'])
})

it('only transforms going and maybe rows into profile history', () => {
  const event = { id: 'event-1', title: 'Sofra', event_date: '2020-01-01T00:00:00Z', venue: null }
  expect(transformProfileHistory([
    { id: '1', status: 'going', events: event },
    { id: '2', status: 'cant', events: { ...event, id: 'event-2' } },
  ], Date.parse('2026-01-01'))).toHaveLength(1)
})

it('formats a history venue with at rather than with', () => {
  const [entry] = transformProfileHistory([{ id: '1', status: 'going', events: { id: 'event-1', title: 'Sofra', event_date: '2020-01-01T00:00:00Z', venue: 'Ramla' } }], Date.parse('2026-01-01'))
  expect(entry.date).toContain(' at Ramla')
  expect(entry.date).not.toContain(' with Ramla')
})
