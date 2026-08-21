import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import ProfilePage from '@/app/(guest)/profile/page'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

jest.mock('@/lib/supabase/client')
jest.mock('next/navigation', () => ({ useRouter: jest.fn() }))

const push = jest.fn()

type UserRow = { name: string; phone: string | null; photo_url: string | null; caption?: string | null }
type HistoryEvent = { id: string; title: string; event_date: string; venue: string | null }

function makeSupabase(
  user: UserRow,
  hostedEventId: string | null = null,
  historyEvents: HistoryEvent[] = [],
  cohostEvents: HistoryEvent[] = []
) {
  const updateEq = jest.fn().mockResolvedValue({ error: null })
  const update = jest.fn().mockReturnValue({ eq: updateEq })
  const allEvents = [...historyEvents, ...cohostEvents]
  const from = jest.fn((table: string) => {
    if (table === 'users') {
      return {
        update,
        select: () => ({
          eq: () => ({ maybeSingle: jest.fn().mockResolvedValue({ data: user, error: null }) }),
        }),
      }
    }
    if (table === 'rsvps') {
      // fetchUserEventIds (lib/profiles.ts): .select('event_id').eq('user_id', uid).in('status', [...])
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            in: jest.fn().mockResolvedValue({ data: historyEvents.map((e) => ({ event_id: e.id })), error: null }),
          }),
        }),
      }
    }
    if (table === 'event_cohosts') {
      // fetchUserEventIds: .select('event_id').eq('user_id', uid), awaited directly.
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ data: cohostEvents.map((e) => ({ event_id: e.id })), error: null }),
        }),
      }
    }
    if (table === 'taste_profiles') {
      return {
        select: () => ({
          eq: () => ({ maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }) }),
        }),
      }
    }
    if (table === 'events') {
      return {
        select: jest.fn((cols: string) => {
          if (cols === 'id,title,event_date,venue') {
            // fetchProfileHistory's final lookup: .in('id', eventIds)
            return { in: jest.fn().mockResolvedValue({ data: allEvents, error: null }) }
          }
          // Shared by the host-preference-reminder check (chains
          // .order().limit().maybeSingle()) and fetchUserEventIds' hosted-events
          // lookup (.eq('host_id', uid), awaited directly with no further chain).
          return {
            eq: jest.fn().mockReturnValue({
              order: jest.fn().mockReturnValue({
                limit: jest.fn().mockReturnValue({
                  maybeSingle: jest.fn().mockResolvedValue({
                    data: hostedEventId ? { id: hostedEventId } : null,
                    error: null,
                  }),
                }),
              }),
              then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
                resolve({ data: hostedEventId ? [{ id: hostedEventId }] : [], error: null }),
            }),
          }
        }),
      }
    }
    throw new Error(`unexpected table ${table}`)
  })
  ;(createClient as jest.Mock).mockReturnValue({ from })
  return { from, update }
}

beforeEach(() => {
  jest.clearAllMocks()
  localStorage.clear()
  document.documentElement.setAttribute('data-theme', 'light')
  ;(useRouter as jest.Mock).mockReturnValue({ push })
})

it('defaults to light mode and persists the profile dark-mode toggle', async () => {
  localStorage.setItem('sofra_user_id', 'theme-user')
  makeSupabase({ name: 'Layla', phone: null, photo_url: null })
  const { container } = render(<ProfilePage />)

  const toggle = await screen.findByRole('switch', { name: 'Switch to dark mode' })
  expect(toggle).toHaveAttribute('aria-checked', 'false')
  expect(container.querySelector('.sv2-profile-page')).toHaveClass('sv2-profile-page--light')

  fireEvent.click(toggle)
  await waitFor(() => expect(screen.getByRole('switch', { name: 'Switch to light mode' })).toHaveAttribute('aria-checked', 'true'))
  expect(localStorage.getItem('sofra_theme')).toBe('dark')
  expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
  expect(container.querySelector('.sv2-profile-page')).toHaveClass('sv2-profile-page--dark')
})

afterEach(() => {
  jest.restoreAllMocks()
})

it('loads and displays an existing phone-based user unchanged', async () => {
  localStorage.setItem('sofra_user_id', 'phone-user-id')
  makeSupabase({ name: 'Layla', phone: '+201234567890', photo_url: null })
  render(<ProfilePage />)

  await waitFor(() => expect(screen.getByText('Layla')).toBeInTheDocument())
  expect(screen.getByText(/\+201234567890/)).toBeInTheDocument()
})

it('loads a name-only user with a null phone without crashing or showing a phone', async () => {
  localStorage.setItem('sofra_user_id', 'name-only-id')
  makeSupabase({ name: 'Tarek', phone: null, photo_url: null })
  render(<ProfilePage />)

  await waitFor(() => expect(screen.getByText('Tarek')).toBeInTheDocument())
  expect(screen.queryByText(/\+\d/)).not.toBeInTheDocument()
})

it('redirects to /login when no identity is stored', async () => {
  render(<ProfilePage />)
  await waitFor(() => expect(push).toHaveBeenCalledWith('/login'))
})

it('prompts a host with no preferences on Profile and allows dismissal', async () => {
  localStorage.setItem('sofra_user_id', 'host-id')
  makeSupabase({ name: 'Layla', phone: null, photo_url: null }, 'event-id')
  render(<ProfilePage />)

  const addLink = await screen.findByRole('link', { name: /add my preferences/i })
  expect(addLink).toHaveAttribute('href', '/profile/preferences')

  fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: /edit my preferences/i })).toBeInTheDocument()
  expect(localStorage.getItem('sofra_dismiss_host_preferences:host-id')).toBe('1')
})

it('lets a non-host edit preferences directly from the profile', async () => {
  localStorage.setItem('sofra_user_id', 'guest-id')
  makeSupabase({ name: 'Mona', phone: null, photo_url: null })
  render(<ProfilePage />)

  const link = await screen.findByRole('link', { name: /add my preferences/i })
  expect(link).toHaveAttribute('href', '/profile/preferences')
})

it('locks a saved caption until Edit caption is pressed', async () => {
  localStorage.setItem('sofra_user_id', 'caption-user')
  const sb = makeSupabase({ name: 'Layla', phone: null, photo_url: null, caption: null })
  render(<ProfilePage />)

  const caption = await screen.findByLabelText(/about me/i)
  fireEvent.change(caption, { target: { value: 'Always brings dessert.' } })
  fireEvent.click(screen.getByRole('button', { name: /save caption/i }))

  await waitFor(() => expect(sb.update).toHaveBeenCalledWith({ caption: 'Always brings dessert.' }))
  await waitFor(() => expect(screen.queryByRole('textbox', { name: /about me/i })).not.toBeInTheDocument())
  expect(screen.getByText('Always brings dessert.')).toHaveClass('sv2-caption-locked')
  expect(screen.getByRole('button', { name: /edit caption/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /edit caption/i })).toHaveClass('sv2-caption-edit')

  fireEvent.click(screen.getByRole('button', { name: /edit caption/i }))
  expect(screen.getByRole('textbox', { name: /about me/i })).toHaveValue('Always brings dessert.')
  expect(screen.getByRole('button', { name: /save caption/i })).toBeInTheDocument()
})

it('opens an event when its profile-history title is clicked', async () => {
  localStorage.setItem('sofra_user_id', 'history-user')
  makeSupabase({ name: 'Layla', phone: null, photo_url: null }, null, [{ id: 'event-1', title: 'Garden Sofra', event_date: '2030-08-12T18:00:00Z', venue: 'Ramla' }])
  render(<ProfilePage />)

  fireEvent.click(await screen.findByRole('button', { name: 'Garden Sofra' }))
  expect(push).toHaveBeenCalledWith('/events/event-1')
  expect(screen.getByText(/at Ramla/)).toBeInTheDocument()
})

it('shows an accepted co-hosted event under Your Sofras even with no RSVP row', async () => {
  localStorage.setItem('sofra_user_id', 'cohost-user')
  // Mirrors the real "Sofra x Moga" case: the user accepted a co-host
  // invite (a row in event_cohosts) but never separately RSVP'd, so a
  // history query scoped only to the rsvps table would miss it entirely.
  makeSupabase({ name: 'Ali', phone: null, photo_url: null }, null, [], [
    { id: 'cohost-event-1', title: 'Sofra x Moga', event_date: '2030-08-12T18:00:00Z', venue: 'Downtown' },
  ])
  render(<ProfilePage />)

  expect(await screen.findByRole('button', { name: 'Sofra x Moga' })).toBeInTheDocument()
})
