import {
  disconnectConnection,
  getConnectionContext,
  isConnectionSchemaUnavailable,
  listPendingConnectionRequests,
  requestConnection,
  respondToConnectionRequest,
} from '@/lib/connections'

it('recognizes a missing PostgREST connection function without masking other failures', () => {
  expect(isConnectionSchemaUnavailable({ code: 'PGRST202' })).toBe(true)
  expect(isConnectionSchemaUnavailable({ code: '42501', message: 'permission denied' })).toBe(false)
})

function rpcClient(responses: Record<string, { data: unknown; error: unknown }>) {
  return {
    rpc: jest.fn((name: string) => Promise.resolve(responses[name] ?? { data: null, error: null })),
  }
}

it('maps an eligible shared-Sofra context without granting visibility', async () => {
  const client = rpcClient({
    get_connection_context: { data: [{ request_id: null, connection_status: 'eligible', direction: 'none', originating_event_id: 'event-1', originating_event_title: 'Dinner', retry_after: null }], error: null },
  })
  await expect(getConnectionContext(client as never, 'viewer', 'profile')).resolves.toEqual({
    requestId: null,
    status: 'eligible',
    direction: 'none',
    originatingEventId: 'event-1',
    originatingEventTitle: 'Dinner',
    retryAfter: null,
  })
})

it('uses bounded RPCs to send and respond to requests', async () => {
  const client = rpcClient({
    request_connection: { data: 'pending', error: null },
    respond_to_connection_request: { data: true, error: null },
  })
  await expect(requestConnection(client as never, 'requester', 'recipient', 'event-1')).resolves.toBe('pending')
  await expect(respondToConnectionRequest(client as never, 'connection-1', 'recipient', false)).resolves.toBe(true)
  expect(client.rpc).toHaveBeenCalledWith('request_connection', expect.objectContaining({ p_originating_event_id: 'event-1' }))
})

it('uses a bounded RPC to disconnect either participant', async () => {
  const client = rpcClient({
    disconnect_connection: { data: true, error: null },
  })
  await expect(disconnectConnection(client as never, 'connection-1', 'viewer-1')).resolves.toBe(true)
  expect(client.rpc).toHaveBeenCalledWith('disconnect_connection', {
    p_connection_id: 'connection-1',
    p_user_id: 'viewer-1',
  })
})

it('maps pending requests for the recipient profile', async () => {
  const client = rpcClient({
    list_pending_connection_requests: { data: [{ request_id: 'connection-1', requester_id: 'requester', requester_name: 'Nadia', requester_photo_url: null, originating_event_id: 'event-1', originating_event_title: 'Dinner', created_at: '2026-08-28T00:00:00Z' }], error: null },
  })
  const requests = await listPendingConnectionRequests(client as never, 'recipient')
  expect(requests).toEqual([expect.objectContaining({ id: 'connection-1', requesterName: 'Nadia', originatingEventTitle: 'Dinner' })])
})
