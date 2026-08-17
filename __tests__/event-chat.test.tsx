import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { EventChat } from '@/components/sofra-v2/EventChat'
import { countUnreadEventMessages, markEventChatRead } from '@/lib/event-chat'

beforeAll(() => {
  Element.prototype.scrollIntoView = jest.fn()
})

beforeEach(() => localStorage.clear())

const messages = [
  {
    id: 'message-1', eventId: 'event-1', userId: 'guest-1', body: 'I can bring dessert.',
    createdAt: '2026-08-17T18:00:00.000Z', senderName: 'Mona', senderPhotoUrl: '/mona.jpg',
  },
  {
    id: 'message-2', eventId: 'event-1', userId: 'me', body: 'Perfect, thank you!',
    createdAt: '2026-08-17T18:01:00.000Z', senderName: 'Layla', senderPhotoUrl: null,
  },
]

it('shows sender profiles and distinguishes the current user message', () => {
  render(<EventChat messages={messages} currentUserId="me" loading={false} sending={false} error=""
    onRetry={jest.fn()} onSend={jest.fn()} />)

  expect(screen.getByRole('link', { name: 'Mona' })).toHaveAttribute('href', '/profile/guest-1')
  expect(screen.getByRole('link', { name: /Layla/ })).toHaveAttribute('href', '/profile/me')
  expect(screen.getByRole('heading', { name: 'Chat' })).toBeInTheDocument()
  expect(screen.getByText('I can bring dessert.').closest('article')).not.toHaveClass('sv2-chat-message-mine')
  expect(screen.getByText('Perfect, thank you!').closest('article')).toHaveClass('sv2-chat-message-mine')
})

it('sends a trimmed message and clears the composer after success', async () => {
  const onSend = jest.fn().mockResolvedValue(true)
  render(<EventChat messages={[]} currentUserId="me" loading={false} sending={false} error=""
    onRetry={jest.fn()} onSend={onSend} />)

  const field = screen.getByLabelText('Message this Sofra')
  fireEvent.change(field, { target: { value: '  See you soon  ' } })
  fireEvent.click(screen.getByRole('button', { name: 'SEND' }))

  await waitFor(() => expect(onSend).toHaveBeenCalledWith('See you soon'))
  expect(field).toHaveValue('')
})

it('counts only other people messages received after this user last opened chat', () => {
  const unreadMessages = [
    { ...messages[0], id: 'old', createdAt: '2026-08-17T17:00:00.000Z' },
    { ...messages[0], id: 'new', createdAt: '2026-08-17T19:00:00.000Z' },
    { ...messages[1], id: 'mine', createdAt: '2026-08-17T20:00:00.000Z' },
  ]
  markEventChatRead(localStorage, 'event-1', 'me', new Date('2026-08-17T18:00:00.000Z'))
  expect(countUnreadEventMessages(unreadMessages, 'event-1', 'me', localStorage)).toBe(1)
})

it('clears the unread count when chat is marked read', () => {
  expect(countUnreadEventMessages(messages, 'event-1', 'me', localStorage)).toBe(1)
  markEventChatRead(localStorage, 'event-1', 'me', new Date('2026-08-18T00:00:00.000Z'))
  expect(countUnreadEventMessages(messages, 'event-1', 'me', localStorage)).toBe(0)
})
