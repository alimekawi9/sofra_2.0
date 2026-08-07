import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EventDetailPage from '@/app/(guest)/events/[id]/page'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

jest.mock('@/lib/supabase/client')
jest.mock('next/navigation', () => ({ useRouter: jest.fn() }))

const mockPush = jest.fn()
const mockReplace = jest.fn()
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
    storage: {
      from: jest.fn().mockReturnValue({
        list: jest.fn().mockResolvedValue({ data: [], error: null }),
        upload: jest.fn().mockResolvedValue({ data: null, error: null }),
        getPublicUrl: jest.fn().mockReturnValue({ data: { publicUrl: 'https://example.test/photo.jpg' } }),
      }),
    },
  }
  ;(createClient as jest.Mock).mockReturnValue(sb)
  return sb
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(useRouter as jest.Mock).mockReturnValue({ push: mockPush, replace: mockReplace })
  mockPush.mockReset()
  mockReplace.mockReset()
  localStorage.clear()

  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: jest.fn().mockResolvedValue(undefined) },
    configurable: true,
    writable: true,
  })
})

const PARAMS = { id: 'ev-1' }

describe('fresh-browser initialization', () => {
  it('redirects to name-only onboarding with the original event as next, without querying or showing an error', async () => {
    const sb = makeSupabase()
    render(<EventDetailPage params={PARAMS} />)

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith('/name?next=%2Fevents%2Fev-1')
    )
    expect(sb.from).not.toHaveBeenCalled()
    expect(screen.queryByText(/couldn't load this event/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/invalid or unavailable/i)).not.toBeInTheDocument()
  })
})

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

  it('copies the canonical event URL without query or hash state', async () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    makeSupabase()
    render(<EventDetailPage params={PARAMS} />)
    await waitFor(() => screen.getByRole('button', { name: /copy invite link/i }))
    await userEvent.click(screen.getByRole('button', { name: /copy invite link/i }))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      new URL('/events/ev-1', window.location.origin).toString()
    )
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
      expect(
        screen.getByDisplayValue(new URL('/events/ev-1', window.location.origin).toString())
      ).toBeInTheDocument()
    )
  })

  it('opens WhatsApp with the complete canonical invitation message encoded', async () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    const open = jest.spyOn(window, 'open').mockImplementation(() => null)
    makeSupabase()
    render(<EventDetailPage params={PARAMS} />)
    await waitFor(() => screen.getByRole('button', { name: /share via whatsapp/i }))
    await userEvent.click(screen.getByRole('button', { name: /share via whatsapp/i }))

    const eventUrl = new URL('/events/ev-1', window.location.origin).toString()
    const message = `You're invited to ${SAMPLE_EVENT.title}! ${eventUrl}`
    expect(open).toHaveBeenCalledWith(
      `https://wa.me/?text=${encodeURIComponent(message)}`,
      '_blank'
    )
    open.mockRestore()
  })
})

describe('Shared album', () => {
  it('is hidden before the guest has RSVPed', async () => {
    localStorage.setItem('sofra_user_id', GUEST_UID)
    makeSupabase()
    render(<EventDetailPage params={PARAMS} />)
    await waitFor(() => expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument())
    expect(screen.queryByText('Shared Album')).not.toBeInTheDocument()
  })

  it('shows an upload control once unlocked, and uploads to the event-photos bucket', async () => {
    localStorage.setItem('sofra_user_id', GUEST_UID)
    const sb = makeSupabase({ rsvpRow: { status: 'going' } })
    render(<EventDetailPage params={PARAMS} />)
    await waitFor(() => expect(screen.getByText('Shared Album')).toBeInTheDocument())

    const file = new File(['x'], 'memory.jpg', { type: 'image/jpeg' })
    const input = screen.getByLabelText(/add a photo/i, { selector: 'input' })
    await userEvent.upload(input, file)

    await waitFor(() => expect(sb.storage.from).toHaveBeenCalledWith('event-photos'))
    const bucket = sb.storage.from.mock.results[0].value
    expect(bucket.upload).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`^ev-1/\\d+-${GUEST_UID}\\.jpg$`)),
      file,
      { contentType: 'image/jpeg' }
    )
  })
})

describe('Locked table preview', () => {
  it('shows the locked card with exact copy for a guest with no RSVP', async () => {
    localStorage.setItem('sofra_user_id', GUEST_UID)
    makeSupabase()
    render(<EventDetailPage params={PARAMS} />)
    await waitFor(() => expect(screen.getByText('The table')).toBeInTheDocument())
    expect(screen.getByText('🔒 RSVP to see who')).toBeInTheDocument()
    expect(screen.getByText("The table’s filling up. Reply to meet them.")).toBeInTheDocument()
    expect(screen.queryByText('Around this Sofra')).not.toBeInTheDocument()
  })

  it('renders 6 blurred decorative dots, not real guest data', async () => {
    localStorage.setItem('sofra_user_id', GUEST_UID)
    makeSupabase()
    const { container } = render(<EventDetailPage params={PARAMS} />)
    await waitFor(() => expect(screen.getByText('The table')).toBeInTheDocument())
    expect(container.querySelectorAll('.sv2-table-preview-dots span')).toHaveLength(6)
  })

  it('is replaced by the real guest grid once unlocked', async () => {
    localStorage.setItem('sofra_user_id', GUEST_UID)
    makeSupabase({ rsvpRow: { status: 'going' } })
    render(<EventDetailPage params={PARAMS} />)
    await waitFor(() => expect(screen.getByText('Around this Sofra')).toBeInTheDocument())
    expect(screen.queryByText('The table')).not.toBeInTheDocument()
    expect(screen.queryByText('🔒 RSVP to see who')).not.toBeInTheDocument()
  })
})
