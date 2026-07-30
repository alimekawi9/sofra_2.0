import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EventDetailPage from '@/app/(guest)/events/[id]/page'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

jest.mock('@/lib/supabase/client')
jest.mock('next/navigation', () => ({ useRouter: jest.fn() }))

const mockPush = jest.fn()
const HOST_UID  = 'uid-host'
const GUEST_UID = 'uid-guest'

const SAMPLE_EVENT = {
  id: 'ev-1',
  host_id: HOST_UID,
  title: 'Casa Mekawi',
  tagline: 'An intimate gathering',
  event_date: '2026-09-01T19:00:00Z',
  venue: 'The Garden Room',
  address: '123 Main St',
  dress_code: 'Smart casual',
  theme: 'ember',
  cover_url: null,
}

function makeSupabase({
  event      = SAMPLE_EVENT as typeof SAMPLE_EVENT | null,
  rsvpRow    = null as { status: string } | null,
  fetchError = null as { message: string } | null,
} = {}) {
  // rsvps chain 1: .select().eq(event_id).eq(user_id).maybeSingle()
  // rsvps chain 2: .select().eq(event_id).in(status, [...])
  const maybeSingleMock = jest.fn().mockResolvedValue({ data: rsvpRow, error: fetchError })
  const inMock          = jest.fn().mockResolvedValue({ data: [], error: null })
  const innerEqMock     = jest.fn().mockReturnValue({ maybeSingle: maybeSingleMock })
  const outerEqMock     = jest.fn().mockReturnValue({ eq: innerEqMock, in: inMock })

  const sb = {
    from: jest.fn((table: string) => {
      if (table === 'events') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: event, error: fetchError }),
            }),
          }),
        }
      }
      // rsvps
      return {
        select: jest.fn().mockReturnValue({ eq: outerEqMock }),
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

  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: jest.fn().mockResolvedValue(undefined) },
    configurable: true,
    writable: true,
  })
})

const PARAMS = { id: 'ev-1' }

// ─── Copy invite link ───────────────────────────────────────────────────────

describe('Copy invite link button', () => {
  it('shows "Copy invite link" button when user is the host', async () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    makeSupabase()
    render(<EventDetailPage params={PARAMS} />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /copy invite link/i })).toBeInTheDocument()
    )
  })

  it('does not show "Copy invite link" button when user is a guest with RSVP', async () => {
    localStorage.setItem('sofra_user_id', GUEST_UID)
    makeSupabase({ rsvpRow: { status: 'going' } })
    render(<EventDetailPage params={PARAMS} />)
    await waitFor(() => expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /copy invite link/i })).not.toBeInTheDocument()
  })

  it('copies window.location.href to clipboard when clicked', async () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    makeSupabase()
    render(<EventDetailPage params={PARAMS} />)
    await waitFor(() => screen.getByRole('button', { name: /copy invite link/i }))
    await userEvent.click(screen.getByRole('button', { name: /copy invite link/i }))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(window.location.href)
  })

  it('changes button text to "Copied!" immediately after click', async () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    makeSupabase()
    render(<EventDetailPage params={PARAMS} />)
    await waitFor(() => screen.getByRole('button', { name: /copy invite link/i }))
    await userEvent.click(screen.getByRole('button', { name: /copy invite link/i }))
    expect(screen.getByRole('button', { name: /copied!/i })).toBeInTheDocument()
  })

  it('reverts button text to "Copy invite link" after 2 seconds', async () => {
    jest.useFakeTimers()
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime.bind(jest) })
    localStorage.setItem('sofra_user_id', HOST_UID)
    makeSupabase()
    render(<EventDetailPage params={PARAMS} />)
    await waitFor(() => screen.getByRole('button', { name: /copy invite link/i }))
    await user.click(screen.getByRole('button', { name: /copy invite link/i }))
    act(() => { jest.advanceTimersByTime(2000) })
    expect(screen.getByRole('button', { name: /copy invite link/i })).toBeInTheDocument()
    jest.useRealTimers()
  })

  it('does not throw when clipboard API is blocked', async () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: jest.fn().mockRejectedValue(new Error('Permission denied')) },
      configurable: true,
      writable: true,
    })
    makeSupabase()
    render(<EventDetailPage params={PARAMS} />)
    await waitFor(() => screen.getByRole('button', { name: /copy invite link/i }))
    await expect(
      userEvent.click(screen.getByRole('button', { name: /copy invite link/i }))
    ).resolves.not.toThrow()
  })

  it('shows the URL as selectable text when clipboard is blocked', async () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: jest.fn().mockRejectedValue(new Error('Permission denied')) },
      configurable: true,
      writable: true,
    })
    makeSupabase()
    render(<EventDetailPage params={PARAMS} />)
    await waitFor(() => screen.getByRole('button', { name: /copy invite link/i }))
    await userEvent.click(screen.getByRole('button', { name: /copy invite link/i }))
    await waitFor(() =>
      expect(screen.getByDisplayValue(window.location.href)).toBeInTheDocument()
    )
  })
})
