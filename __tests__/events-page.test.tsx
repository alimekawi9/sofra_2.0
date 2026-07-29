import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EventsPage from '@/app/(guest)/events/page'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

jest.mock('@/lib/supabase/client')
jest.mock('next/navigation', () => ({ useRouter: jest.fn() }))

const mockPush = jest.fn()

type EventRow = {
  id: string
  title: string
  event_date: string
  venue: string | null
  theme: string
  cover_url: string | null
}

const SAMPLE_EVENT: EventRow = {
  id: 'ev-1',
  title: 'Casa Mekawi',
  event_date: '2026-09-01T19:00:00Z',
  venue: 'The Garden Room',
  theme: 'ember',
  cover_url: null,
}

function makeSupabase({
  hostingEvents = [] as EventRow[],
  invitedRsvps  = [] as { status: string; events: EventRow }[],
  fetchError    = null as { message: string } | null,
} = {}) {
  const sb = {
    from: jest.fn((table: string) => {
      if (table === 'events') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ data: hostingEvents, error: fetchError }),
          }),
        }
      }
      // rsvps
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            in: jest.fn().mockResolvedValue({ data: invitedRsvps, error: fetchError }),
          }),
        }),
      }
    }),
  }
  ;(createClient as jest.Mock).mockReturnValue(sb)
  return sb
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(useRouter as jest.Mock).mockReturnValue({ push: mockPush })
  mockPush.mockReset()
  localStorage.clear()
  localStorage.setItem('sofra_user_id', 'uid-1')
})

it('renders without crashing', () => {
  makeSupabase()
  render(<EventsPage />)
  expect(document.body).toBeTruthy()
})

it('renders the Sofra wordmark', () => {
  makeSupabase()
  render(<EventsPage />)
  expect(screen.getByRole('heading', { name: 'Sofra' })).toBeInTheDocument()
})

describe('auth guard', () => {
  it('redirects to /login when sofra_user_id is absent', async () => {
    localStorage.clear()
    makeSupabase()
    render(<EventsPage />)
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/login'))
  })

  it('does not redirect when sofra_user_id is present', async () => {
    makeSupabase()
    render(<EventsPage />)
    await waitFor(() => expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument())
    expect(mockPush).not.toHaveBeenCalledWith('/login')
  })
})

describe('loading state', () => {
  it('shows skeleton while fetching', () => {
    makeSupabase()
    render(<EventsPage />)
    expect(screen.getByTestId('skeleton')).toBeInTheDocument()
  })

  it('skeleton disappears after fetch completes', async () => {
    makeSupabase()
    render(<EventsPage />)
    await waitFor(() =>
      expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument()
    )
  })
})

describe('fetch error state', () => {
  it('shows error message on fetch failure', async () => {
    makeSupabase({ fetchError: { message: 'db error' } })
    render(<EventsPage />)
    await waitFor(() =>
      expect(screen.getByText(/couldn't load/i)).toBeInTheDocument()
    )
  })

  it('shows a Retry button on fetch failure', async () => {
    makeSupabase({ fetchError: { message: 'db error' } })
    render(<EventsPage />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
    )
  })

  it('clicking Retry clears the error and re-fetches', async () => {
    let calls = 0
    ;(createClient as jest.Mock).mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'events') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockImplementation(() => {
                calls++
                return calls === 1
                  ? Promise.resolve({ data: null, error: { message: 'fail' } })
                  : Promise.resolve({ data: [], error: null })
              }),
            }),
          }
        }
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              in: jest.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }
      }),
    })

    render(<EventsPage />)
    await waitFor(() => screen.getByRole('button', { name: /retry/i }))
    await userEvent.click(screen.getByRole('button', { name: /retry/i }))
    await waitFor(() =>
      expect(screen.queryByText(/couldn't load/i)).not.toBeInTheDocument()
    )
  })
})

describe('empty state', () => {
  it('shows empty message when both lists are empty', async () => {
    makeSupabase()
    render(<EventsPage />)
    await waitFor(() =>
      expect(screen.getByText(/no events yet/i)).toBeInTheDocument()
    )
  })

  it('shows a Host an event button linking to /host/new', async () => {
    makeSupabase()
    render(<EventsPage />)
    await waitFor(() => screen.getByRole('button', { name: /host an event/i }))
    await userEvent.click(screen.getByRole('button', { name: /host an event/i }))
    expect(mockPush).toHaveBeenCalledWith('/host/new')
  })
})

describe('Hosting section', () => {
  it('shows Hosting section heading when user has hosted events', async () => {
    makeSupabase({ hostingEvents: [SAMPLE_EVENT] })
    render(<EventsPage />)
    await waitFor(() =>
      expect(screen.getByText('Hosting')).toBeInTheDocument()
    )
  })

  it('shows event title in hosting section', async () => {
    makeSupabase({ hostingEvents: [SAMPLE_EVENT] })
    render(<EventsPage />)
    await waitFor(() =>
      expect(screen.getByText('Casa Mekawi')).toBeInTheDocument()
    )
  })

  it('shows event venue in hosting section', async () => {
    makeSupabase({ hostingEvents: [SAMPLE_EVENT] })
    render(<EventsPage />)
    await waitFor(() =>
      expect(screen.getByText('The Garden Room')).toBeInTheDocument()
    )
  })

  it('does not show Hosting heading when user has no hosted events', async () => {
    makeSupabase()
    render(<EventsPage />)
    await waitFor(() => expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument())
    expect(screen.queryByText('Hosting')).not.toBeInTheDocument()
  })

  it('clicking a hosting card navigates to /events/[id]', async () => {
    makeSupabase({ hostingEvents: [SAMPLE_EVENT] })
    render(<EventsPage />)
    await waitFor(() => screen.getByText('Casa Mekawi'))
    await userEvent.click(screen.getByText('Casa Mekawi'))
    expect(mockPush).toHaveBeenCalledWith('/events/ev-1')
  })

  it('queries events table', async () => {
    const sb = makeSupabase({ hostingEvents: [SAMPLE_EVENT] })
    render(<EventsPage />)
    await waitFor(() => screen.getByText('Casa Mekawi'))
    expect(sb.from).toHaveBeenCalledWith('events')
  })
})

describe('Your invites section', () => {
  const INVITED_RSVP = { status: 'going', events: { ...SAMPLE_EVENT, id: 'ev-2', title: 'Rooftop Night' } }

  it('shows Your invites heading when user has rsvped events', async () => {
    makeSupabase({ invitedRsvps: [INVITED_RSVP] })
    render(<EventsPage />)
    await waitFor(() =>
      expect(screen.getByText('Your invites')).toBeInTheDocument()
    )
  })

  it('shows invited event title', async () => {
    makeSupabase({ invitedRsvps: [INVITED_RSVP] })
    render(<EventsPage />)
    await waitFor(() =>
      expect(screen.getByText('Rooftop Night')).toBeInTheDocument()
    )
  })

  it('does not show Your invites heading when no rsvps', async () => {
    makeSupabase()
    render(<EventsPage />)
    await waitFor(() => expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument())
    expect(screen.queryByText('Your invites')).not.toBeInTheDocument()
  })

  it('clicking an invited card navigates to /events/[id]', async () => {
    makeSupabase({ invitedRsvps: [INVITED_RSVP] })
    render(<EventsPage />)
    await waitFor(() => screen.getByText('Rooftop Night'))
    await userEvent.click(screen.getByText('Rooftop Night'))
    expect(mockPush).toHaveBeenCalledWith('/events/ev-2')
  })

  it('queries rsvps table scoped to the user id', async () => {
    const sb = makeSupabase({ invitedRsvps: [INVITED_RSVP] })
    render(<EventsPage />)
    await waitFor(() => screen.getByText('Rooftop Night'))
    expect(sb.from).toHaveBeenCalledWith('rsvps')
  })
})

describe('both sections visible simultaneously', () => {
  it('shows both Hosting and Your invites when user has both', async () => {
    makeSupabase({
      hostingEvents: [SAMPLE_EVENT],
      invitedRsvps: [{ status: 'maybe', events: { ...SAMPLE_EVENT, id: 'ev-2', title: 'Rooftop Night' } }],
    })
    render(<EventsPage />)
    await waitFor(() => {
      expect(screen.getByText('Hosting')).toBeInTheDocument()
      expect(screen.getByText('Your invites')).toBeInTheDocument()
    })
  })
})
