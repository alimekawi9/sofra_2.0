import type { SupabaseClient } from '@supabase/supabase-js'

export const MAX_EVENT_MESSAGE_LENGTH = 1000
const CHAT_LAST_READ_PREFIX = 'sofra_chat_last_read:'

export interface EventChatMessage {
  id: string
  eventId: string
  userId: string
  body: string
  createdAt: string
  senderName: string
  senderPhotoUrl: string | null
}

export function chatLastReadKey(eventId: string, userId: string): string {
  return `${CHAT_LAST_READ_PREFIX}${eventId}:${userId}`
}

export function markEventChatRead(storage: Pick<Storage, 'setItem'>, eventId: string, userId: string, readAt = new Date()): void {
  storage.setItem(chatLastReadKey(eventId, userId), readAt.toISOString())
}

export function countUnreadEventMessages(
  messages: EventChatMessage[],
  eventId: string,
  currentUserId: string,
  storage: Pick<Storage, 'getItem'>
): number {
  const stored = storage.getItem(chatLastReadKey(eventId, currentUserId))
  const lastRead = stored ? Date.parse(stored) : Number.NEGATIVE_INFINITY
  return messages.filter((message) =>
    message.userId !== currentUserId && new Date(message.createdAt).getTime() > lastRead
  ).length
}

type MessageRow = {
  id: string
  event_id: string
  user_id: string
  body: string
  created_at: string
  users: { name: string; photo_url: string | null } | null
}

const MESSAGE_SELECT = 'id,event_id,user_id,body,created_at,users(name,photo_url)'

function toMessage(row: MessageRow): EventChatMessage {
  return {
    id: row.id,
    eventId: row.event_id,
    userId: row.user_id,
    body: row.body,
    createdAt: row.created_at,
    senderName: row.users?.name ?? 'Sofra guest',
    senderPhotoUrl: row.users?.photo_url ?? null,
  }
}

export async function fetchEventMessages(supabase: SupabaseClient, eventId: string) {
  try {
    const { data, error } = await supabase
      .from('event_messages')
      .select(MESSAGE_SELECT)
      .eq('event_id', eventId)
      .order('created_at', { ascending: true })
      .limit(200)

    if (error) return { messages: [] as EventChatMessage[], error: error.message }
    return { messages: ((data ?? []) as unknown as MessageRow[]).map(toMessage), error: null }
  } catch (caught) {
    return { messages: [] as EventChatMessage[], error: caught instanceof Error ? caught.message : 'Unexpected request failure' }
  }
}

export async function sendEventMessage(
  supabase: SupabaseClient,
  params: { eventId: string; userId: string; body: string }
) {
  const body = params.body.trim()
  if (!body || body.length > MAX_EVENT_MESSAGE_LENGTH) {
    return { message: null as EventChatMessage | null, error: 'Messages must be between 1 and 1000 characters.' }
  }

  try {
    const { data, error } = await supabase
      .from('event_messages')
      .insert({ event_id: params.eventId, user_id: params.userId, body })
      .select(MESSAGE_SELECT)
      .single()

    if (error || !data) return { message: null, error: error?.message ?? 'Could not send that message.' }
    return { message: toMessage(data as unknown as MessageRow), error: null }
  } catch (caught) {
    return { message: null, error: caught instanceof Error ? caught.message : 'Unexpected request failure' }
  }
}
