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
}

const SAMPLE_EVENT: EventRow = {
  id: 'ev-1',
  title: 'Casa Mekawi',
  event_date: '2026-09-01T19:00:00Z',
  venue: 'The Garden Room',
  theme: 'ember',
}

function makeSupabase({
  hostingEvents = [] as EventRow[],
  invitedRsvps  = [] as { status: string; events: (EventRow & { host?: { name: string } }) }[],
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
      if (table === 'users') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({ data: { name: 'Demo Host' }, error: null }),
            }),
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
    await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument())
    expect(mockPush).not.toHaveBeenCalledWith('/login')
  })
})

describe('fetch error state', () => {
  it('shows error message on fetch failure', async () => {
    makeSupabase({ fetchError: { message: 'db error' } })
    render(<EventsPage />)
    await waitFor(() => expect(screen.getByText(/couldn't load/i)).toBeInTheDocument())
  })

  it('shows a Retry button on fetch failure and clears the error when clicked', async () => {
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
        if (table === 'users') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                maybeSingle: jest.fn().mockResolvedValue({ data: { name: 'Demo Host' }, error: null }),
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
    await waitFor(() => expect(screen.queryByText(/couldn't load/i)).not.toBeInTheDocument())
  })
})

describe('empty state', () => {
  it('shows empty message and a Host an event button linking to /host/new', async () => {
    makeSupabase()
    render(<EventsPage />)
    await waitFor(() => expect(screen.getByText(/no events yet/i)).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /host an event/i }))
    expect(mockPush).toHaveBeenCalledWith('/host/new')
  })
})

describe('Hosting events', () => {
  it('shows a HOSTING filter and the hosted event under it', async () => {
    makeSupabase({ hostingEvents: [SAMPLE_EVENT] })
    render(<EventsPage />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'HOSTING' })).toBeInTheDocument())
    expect(screen.getByText('Casa Mekawi')).toBeInTheDocument()
    expect(screen.getByText('The Garden Room')).toBeInTheDocument()
  })

  it('clicking View event navigates to /events/[id]', async () => {
    makeSupabase({ hostingEvents: [SAMPLE_EVENT] })
    render(<EventsPage />)
    await waitFor(() => screen.getByText('Casa Mekawi'))
    expect(screen.getByRole('link', { name: /view event/i })).toHaveAttribute('href', '/events/ev-1')
  })

  it('queries events table scoped to host_id', async () => {
    const sb = makeSupabase({ hostingEvents: [SAMPLE_EVENT] })
    render(<EventsPage />)
    await waitFor(() => screen.getByText('Casa Mekawi'))
    expect(sb.from).toHaveBeenCalledWith('events')
  })
})

describe('Invited events', () => {
  it('a going RSVP for a future event shows a GOING filter with the event and host name', async () => {
    makeSupabase({
      invitedRsvps: [{ status: 'going', events: { ...SAMPLE_EVENT, id: 'ev-2', title: 'Rooftop Night', host: { name: 'Layla' } } }],
    })
    render(<EventsPage />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'GOING' })).toBeInTheDocument())
    expect(screen.getByText('Rooftop Night')).toBeInTheDocument()
    expect(screen.getByText('Hosted by Layla')).toBeInTheDocument()
  })

  it('a maybe RSVP for a future event is categorized as INVITED', async () => {
    makeSupabase({
      invitedRsvps: [{ status: 'maybe', events: { ...SAMPLE_EVENT, id: 'ev-2', title: 'Rooftop Night' } }],
    })
    render(<EventsPage />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'INVITED' })).toBeInTheDocument())
  })

  it('an RSVP for a past event is categorized as WENT', async () => {
    makeSupabase({
      invitedRsvps: [{ status: 'going', events: { ...SAMPLE_EVENT, id: 'ev-2', title: 'Old Dinner', event_date: '2020-01-01T19:00:00Z' } }],
    })
    render(<EventsPage />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'WENT' })).toBeInTheDocument())
  })

  it('queries rsvps table scoped to the user id', async () => {
    const sb = makeSupabase({
      invitedRsvps: [{ status: 'going', events: { ...SAMPLE_EVENT, id: 'ev-2', title: 'Rooftop Night' } }],
    })
    render(<EventsPage />)
    await waitFor(() => screen.getByText('Rooftop Night'))
    expect(sb.from).toHaveBeenCalledWith('rsvps')
  })
})

it('shows both HOSTING and GOING filters when the user has both', async () => {
  makeSupabase({
    hostingEvents: [SAMPLE_EVENT],
    invitedRsvps: [{ status: 'going', events: { ...SAMPLE_EVENT, id: 'ev-2', title: 'Rooftop Night' } }],
  })
  render(<EventsPage />)
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'HOSTING' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'GOING' })).toBeInTheDocument()
  })
})
