import { render, screen, waitFor, act, within } from '@testing-library/react'
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
  chef_id: null as string | null,
  title: 'Casa Mekawi',
  tagline: 'An intimate gathering',
  event_date: '2026-09-01T19:00:00Z',
  venue: 'The Garden Room',
  address: '123 Main St',
  dress_code: 'Smart casual',
  custom_details: [] as Array<{ id: string; label: string; body: string }>,
  theme: 'ember',
  cover_url: null,
  is_published: true,
  kitchen_status: 'complete' as 'pending' | 'complete',
  kitchen_plan: null as 'now' | 'later' | 'chef' | null,
}

function makeSupabase({
  event      = SAMPLE_EVENT as typeof SAMPLE_EVENT | null,
  rsvpRow    = null as { status: string } | null,
  fetchError = null as { message: string } | null,
  guestRows  = [] as Array<{ status: string; users: { id: string; name: string; photo_url?: string | null } | null }>,
  deleteError = null as { message: string } | null,
  photoRows  = [] as Array<{ id: string; event_id: string; uploaded_by: string; storage_path: string; created_at: string }>,
  photoFetchError = null as { message: string } | null,
  photoInsertError = null as { message: string } | null,
  photoUploadError = null as { message: string } | null,
  tasteProfile = { user_id: HOST_UID } as { user_id: string } | null,
  cohostRows = [] as Array<{ users: { id: string; name: string; photo_url: string | null } | null }>,
  viewerIsCohost = false,
  pendingAccessRequests = [] as Array<{ id: string; user_id: string; created_at: string; users: { id: string; name: string; photo_url: string | null } }>,
  updateNoticeKinds = [] as Array<'date' | 'time' | 'location' | 'photos'>,
  playlistRows = [] as Array<{ id: string; event_id: string; user_id: string; song: string; spotify_track_id?: string | null; created_at: string; users: { name: string; photo_url: string | null } | null }>,
  feedbackSubmitted = true,
} = {}) {
  // rsvps chain 1: .select().eq(event_id).eq(user_id).maybeSingle()
  // rsvps chain 2: .select().eq(event_id).in(status, [...])
  const maybeSingleMock = jest.fn().mockResolvedValue({ data: rsvpRow, error: fetchError })
  const inMock          = jest.fn().mockResolvedValue({ data: guestRows, error: null })
  const innerEqMock     = jest.fn().mockReturnValue({ maybeSingle: maybeSingleMock })
  const outerEqMock     = jest.fn().mockReturnValue({ eq: innerEqMock, in: inMock })

  // rsvps delete chain: .delete().eq(event_id).eq(user_id)
  const deleteEqMock2 = jest.fn().mockResolvedValue({ error: deleteError })
  const deleteEqMock1 = jest.fn().mockReturnValue({ eq: deleteEqMock2 })
  const deleteMock    = jest.fn().mockReturnValue({ eq: deleteEqMock1 })

  const photoOrderMock = jest.fn().mockResolvedValue({ data: photoRows, error: photoFetchError })
  const photoEqMock = jest.fn().mockReturnValue({ order: photoOrderMock })
  const insertedPhoto = {
    id: 'photo-new', event_id: SAMPLE_EVENT.id, uploaded_by: GUEST_UID,
    storage_path: `ev-1/new-${GUEST_UID}.jpg`, created_at: '2026-08-07T12:00:00Z',
  }
  const photoSingleMock = jest.fn().mockResolvedValue({ data: insertedPhoto, error: photoInsertError })
  const photoInsertSelectMock = jest.fn().mockReturnValue({ single: photoSingleMock })
  const photoInsertMock = jest.fn().mockReturnValue({ select: photoInsertSelectMock })
  const bucket = {
    upload: jest.fn().mockResolvedValue({ data: { path: insertedPhoto.storage_path }, error: photoUploadError }),
    remove: jest.fn().mockResolvedValue({ data: [], error: null }),
    getPublicUrl: jest.fn((path: string) => ({ data: { publicUrl: `https://example.test/${path}` } })),
  }

  const sb = {
    from: jest.fn((table: string) => {
      if (table === 'events') {
        const eventResult = jest.fn().mockResolvedValue({ data: event, error: fetchError })
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: eventResult,
              maybeSingle: eventResult,
            }),
          }),
        }
      }
      if (table === 'event_photos') {
        return {
          select: jest.fn().mockReturnValue({ eq: photoEqMock }),
          insert: photoInsertMock,
        }
      }
      if (table === 'playlist_suggestions') {
        const secondOrder = jest.fn().mockResolvedValue({ data: playlistRows, error: null })
        const firstOrder = jest.fn().mockReturnValue({ order: secondOrder })
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({ order: firstOrder }),
          }),
          insert: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: playlistRows[0] ?? null, error: playlistRows[0] ? null : { message: 'missing fixture' } }),
            }),
          }),
        }
      }
      if (table === 'taste_profiles') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({ data: tasteProfile, error: null }),
            }),
          }),
        }
      }
      if (table === 'event_cohosts') {
        return {
          select: jest.fn((columns: string) => columns.startsWith('users') ? {
            eq: jest.fn().mockResolvedValue({ data: cohostRows, error: null }),
          } : {
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                maybeSingle: jest.fn().mockResolvedValue({
                  data: viewerIsCohost ? { user_id: GUEST_UID } : null,
                  error: null,
                }),
              }),
            }),
          }),
        }
      }
      if (table === 'event_cohost_invites') {
        return {
          insert: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: { token: 'cohost-token' }, error: null }),
            }),
          }),
        }
      }
      // rsvps
      return {
        select: jest.fn().mockReturnValue({ eq: outerEqMock }),
        delete: deleteMock,
      }
    }),
    storage: {
      from: jest.fn().mockReturnValue(bucket),
    },
    rpc: jest.fn((name: string) => Promise.resolve(name === 'list_pending_event_access_requests'
      ? {
          data: pendingAccessRequests.map((row) => ({
            request_id: row.id,
            user_id: row.user_id,
            requester_name: row.users.name,
            requester_photo_url: row.users.photo_url,
            created_at: row.created_at,
          })),
          error: null,
        }
      : name === 'get_pending_event_update_notice'
        ? { data: updateNoticeKinds.length > 0 ? [{ notice_kinds: updateNoticeKinds, changed_at: '2026-08-26T10:00:00Z' }] : [], error: null }
        : name === 'has_sofra_feedback'
          ? { data: feedbackSubmitted, error: null }
        : { data: true, error: null })),
    _photoEqMock: photoEqMock,
    _photoOrderMock: photoOrderMock,
    _bucket: bucket,
    _deleteMock: deleteMock,
    _deleteEqMock1: deleteEqMock1,
    _deleteEqMock2: deleteEqMock2,
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
  it('clears a stale event link and returns to Your Sofras when the event no longer exists', async () => {
    localStorage.setItem('sofra_user_id', GUEST_UID)
    localStorage.setItem('sofra_pending_invites', JSON.stringify([{ id: 'ev-1', title: 'Deleted event' }]))
    makeSupabase({ event: null })
    render(<EventDetailPage params={PARAMS} />)

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/events'))
    expect(localStorage.getItem('sofra_pending_invites')).not.toContain('ev-1')
  })

  it('shows a logged-out visitor the invitation landing before login and preserves RSVP as the destination', async () => {
    const sb = makeSupabase({ event: { ...SAMPLE_EVENT, is_published: false } })
    render(<EventDetailPage params={PARAMS} />)
    const yalla = await screen.findByRole('button', { name: 'YALLA' })
    expect(sb.from).toHaveBeenCalledWith('events')
    expect(mockReplace).not.toHaveBeenCalledWith(expect.stringContaining('/login'))
    await userEvent.click(yalla)
    expect(mockPush).toHaveBeenCalledWith('/login?invite=1&next=%2Fevents%2Fev-1%2Frsvp')
  })

  it('shows an authenticated non-member the invitation landing before normal RSVP', async () => {
    localStorage.setItem('sofra_user_id', GUEST_UID)
    makeSupabase()
    render(<EventDetailPage params={PARAMS} />)
    await userEvent.click(await screen.findByRole('button', { name: 'YALLA' }))
    expect(mockPush).toHaveBeenCalledWith('/events/ev-1/rsvp')
    expect(localStorage.getItem('sofra_pending_invites')).toContain('ev-1')
    expect(mockReplace).not.toHaveBeenCalledWith('/events/ev-1/request-access')
  })

  it('sends the assigned chef directly to delegated Kitchen without RSVP', async () => {
    localStorage.setItem('sofra_user_id', GUEST_UID)
    makeSupabase({ event: { ...SAMPLE_EVENT, chef_id: GUEST_UID } })
    render(<EventDetailPage params={PARAMS} />)
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/kitchen?from=ev-1&delegate=1'))
    expect(mockReplace).not.toHaveBeenCalledWith('/events/ev-1/rsvp')
  })
})

// ─── Copy invite link ───────────────────────────────────────────────────────

describe('Copy invite link button', () => {
  async function openInviteMenu() {
    await userEvent.click(await screen.findByRole('button', { name: /^send$/i }))
  }

  it('keeps co-host sharing choices collapsed until the host asks for them', async () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    makeSupabase()
    render(<EventDetailPage params={PARAMS} />)
    const cohost = await screen.findByRole('button', { name: 'CO-HOST' })
    expect(screen.queryByRole('button', { name: /copy co-host link/i })).not.toBeInTheDocument()
    await userEvent.click(cohost)
    expect(await screen.findByRole('button', { name: /copy co-host link/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send via whatsapp/i })).toBeInTheDocument()
  })

  it('lets an accepted co-host also invite further co-hosts, not just the original host', async () => {
    localStorage.setItem('sofra_user_id', GUEST_UID)
    makeSupabase({ viewerIsCohost: true })
    render(<EventDetailPage params={PARAMS} />)
    expect(await screen.findByRole('button', { name: 'CO-HOST' })).toBeInTheDocument()
  })

  it('shows "Copy invite link" button when user is the host', async () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    makeSupabase()
    render(<EventDetailPage params={PARAMS} />)
    await openInviteMenu()
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
    await openInviteMenu()
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
    await openInviteMenu()
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
    await user.click(await screen.findByRole('button', { name: /^send$/i }))
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
    await openInviteMenu()
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
    await openInviteMenu()
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
    await openInviteMenu()
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

  it('lets the host navigate to the update composer', async () => {
    makeSupabase()
    localStorage.setItem('sofra_user_id', HOST_UID)
    render(<EventDetailPage params={PARAMS} />)

    await openInviteMenu()
    const sendUpdateButton = await screen.findByRole('button', { name: 'SEND AN UPDATE' })
    await userEvent.click(sendUpdateButton)

    expect(mockPush).toHaveBeenCalledWith('/events/ev-1/update')
  })

  it('proactively prompts the host to send or dismiss an update after event details change', async () => {
    const sb = makeSupabase({ updateNoticeKinds: ['date'] })
    localStorage.setItem('sofra_user_id', HOST_UID)
    render(<EventDetailPage params={PARAMS} />)

    const reminder = await screen.findByRole('complementary', { name: 'Event update reminder' })
    expect(reminder).toHaveTextContent('Date changed to Tuesday, September 1, 2026.')
    await userEvent.click(within(reminder).getByRole('button', { name: 'SEND UPDATE' }))

    await waitFor(() => expect(sb.rpc).toHaveBeenCalledWith('dismiss_event_update_notice', {
      p_event_id: 'ev-1',
      p_manager_id: HOST_UID,
    }))
    expect(mockPush).toHaveBeenCalledWith('/events/ev-1/update?template=details')
  })

  it('lists only the exact changed fields and their current values', async () => {
    makeSupabase({ updateNoticeKinds: ['time', 'location'] })
    localStorage.setItem('sofra_user_id', HOST_UID)
    render(<EventDetailPage params={PARAMS} />)

    const reminder = await screen.findByRole('complementary', { name: 'Event update reminder' })
    expect(reminder).toHaveTextContent('Time changed to 7:00 PM.')
    expect(reminder).toHaveTextContent('Location changed to The Garden Room — 123 Main St.')
    expect(reminder).not.toHaveTextContent('Date changed')
  })

  it('lets the host dismiss a new-photo update reminder without opening the composer', async () => {
    makeSupabase({ updateNoticeKinds: ['photos'] })
    localStorage.setItem('sofra_user_id', HOST_UID)
    render(<EventDetailPage params={PARAMS} />)

    const reminder = await screen.findByRole('complementary', { name: 'Event update reminder' })
    expect(reminder).toHaveTextContent('New photos were uploaded')
    await userEvent.click(within(reminder).getByRole('button', { name: 'DISMISS' }))
    await waitFor(() => expect(screen.queryByRole('complementary', { name: 'Event update reminder' })).not.toBeInTheDocument())
    expect(mockPush).not.toHaveBeenCalledWith(expect.stringContaining('/update'))
  })
})

describe('EDIT EVENT button', () => {
  it('shows for the host on an upcoming event, and navigates to the host edit route', async () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    makeSupabase()
    render(<EventDetailPage params={PARAMS} />)
    await waitFor(() => expect(screen.getByRole('button', { name: /edit event/i })).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /edit event/i }))
    expect(mockPush).toHaveBeenCalledWith('/host/ev-1/edit')
  })

  it('is never shown to a guest, even one with an RSVP', async () => {
    localStorage.setItem('sofra_user_id', GUEST_UID)
    makeSupabase({ rsvpRow: { status: 'going' } })
    render(<EventDetailPage params={PARAMS} />)
    await waitFor(() => expect(screen.getByText('Around this Sofra')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /edit event/i })).not.toBeInTheDocument()
  })

  it('keeps editing available but removes planning actions once the event is in the past', async () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    makeSupabase({ event: { ...SAMPLE_EVENT, event_date: '2020-01-01T00:00:00Z', kitchen_status: 'pending', kitchen_plan: 'later' } })
    render(<EventDetailPage params={PARAMS} />)
    await waitFor(() => expect(screen.getByRole('button', { name: /^send$/i })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /edit event/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /set the sofra/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /fill kitchen now/i })).not.toBeInTheDocument()
  })
})

function rowAt(i: number) {
  return {
    id: `photo-${i}`, event_id: SAMPLE_EVENT.id, uploaded_by: GUEST_UID,
    storage_path: `ev-1/photo-${i}.jpg`, created_at: `2026-08-0${(i % 9) + 1}T10:00:00Z`,
  }
}

describe('Shared album', () => {
  it('is hidden before the guest has RSVPed', async () => {
    localStorage.setItem('sofra_user_id', GUEST_UID)
    makeSupabase()
    render(<EventDetailPage params={PARAMS} />)
    await waitFor(() => expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument())
    expect(screen.queryByText('Shared Album')).not.toBeInTheDocument()
  })

  it('shows a multi-select ADD PHOTOS control once unlocked', async () => {
    localStorage.setItem('sofra_user_id', GUEST_UID)
    makeSupabase({ rsvpRow: { status: 'going' } })
    render(<EventDetailPage params={PARAMS} />)
    await waitFor(() => expect(screen.getByText('Shared Album')).toBeInTheDocument())

    const input = screen.getByLabelText('ADD PHOTOS', { selector: 'input' })
    expect(input).toHaveAttribute('multiple')
    expect(input).toHaveAttribute('accept', 'image/*')
  })

  it('blurs the preview and requires feedback for a guest after the event', async () => {
    localStorage.setItem('sofra_user_id', GUEST_UID)
    makeSupabase({
      event: { ...SAMPLE_EVENT, event_date: '2020-01-01T00:00:00Z' },
      rsvpRow: { status: 'going' },
      photoRows: [rowAt(1)],
      feedbackSubmitted: false,
    })
    const { container } = render(<EventDetailPage params={PARAMS} />)

    await waitFor(() => expect(screen.getByRole('button', { name: 'TAKE THE SURVEY' })).toBeInTheDocument())
    expect(container.querySelector('.sv2-album-preview-grid')).toHaveClass('is-feedback-locked')
    expect(screen.queryByRole('button', { name: 'VIEW ALBUM' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('ADD PHOTOS', { selector: 'input' })).not.toBeInTheDocument()
  })

  it('opens a caption sheet after selecting photos, then uploads to the event-photos bucket with the note attached', async () => {
    localStorage.setItem('sofra_user_id', GUEST_UID)
    const sb = makeSupabase({ rsvpRow: { status: 'going' } })
    render(<EventDetailPage params={PARAMS} />)
    await waitFor(() => expect(screen.getByText('Shared Album')).toBeInTheDocument())

    const file = new File(['x'], 'memory.jpg', { type: 'image/jpeg' })
    await userEvent.upload(screen.getByLabelText('ADD PHOTOS', { selector: 'input' }), file)

    expect(screen.getByText('1 photo selected')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText(/say something about these/i), 'Best table of the night')
    await userEvent.click(screen.getByRole('button', { name: /^upload 1 photo$/i }))

    await waitFor(() => expect(sb.storage.from).toHaveBeenCalledWith('event-photos'))
    const bucket = sb.storage.from.mock.results[0].value
    expect(bucket.upload).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`^ev-1/\\d+-${GUEST_UID}-0\\.jpg$`)),
      file,
      { contentType: 'image/jpeg' }
    )
    const eventPhotosResult = sb.from.mock.results.find(
      (_r: unknown, i: number) => sb.from.mock.calls[i][0] === 'event_photos'
    )
    expect(eventPhotosResult!.value.insert).toHaveBeenCalledWith(
      expect.objectContaining({ caption: 'Best table of the night' })
    )
  })

  it('redirects to the dedicated album page once the upload succeeds', async () => {
    localStorage.setItem('sofra_user_id', GUEST_UID)
    makeSupabase({ rsvpRow: { status: 'going' } })
    render(<EventDetailPage params={PARAMS} />)
    await waitFor(() => expect(screen.getByText('Shared Album')).toBeInTheDocument())

    await userEvent.upload(
      screen.getByLabelText('ADD PHOTOS', { selector: 'input' }),
      new File(['x'], 'memory.jpg', { type: 'image/jpeg' })
    )
    await userEvent.click(screen.getByRole('button', { name: /^upload 1 photo$/i }))

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/events/ev-1/album'))
  })

  it('rejects a selection of more than 20 photos before opening the caption sheet', async () => {
    localStorage.setItem('sofra_user_id', GUEST_UID)
    makeSupabase({ rsvpRow: { status: 'going' } })
    render(<EventDetailPage params={PARAMS} />)
    await waitFor(() => expect(screen.getByText('Shared Album')).toBeInTheDocument())

    const files = Array.from({ length: 21 }, (_, i) => new File(['x'], `p${i}.jpg`, { type: 'image/jpeg' }))
    await userEvent.upload(screen.getByLabelText('ADD PHOTOS', { selector: 'input' }), files)

    expect(screen.getByRole('alert')).toHaveTextContent('You can upload up to 20 photos at a time.')
    expect(screen.queryByText(/photos selected/)).not.toBeInTheDocument()
  })

  it('loads persisted photo rows for the same event in newest-first order', async () => {
    localStorage.setItem('sofra_user_id', GUEST_UID)
    const rows = [rowAt(1)]
    const sb = makeSupabase({ rsvpRow: { status: 'going' }, photoRows: rows })
    render(<EventDetailPage params={PARAMS} />)

    await waitFor(() => expect(screen.getByText('1 memory')).toBeInTheDocument())
    expect(sb._photoEqMock).toHaveBeenCalledWith('event_id', SAMPLE_EVENT.id)
    expect(sb._photoOrderMock).toHaveBeenCalledWith('created_at', { ascending: false })
  })

  it('preserves existing photos and shows a retry state when refresh fails', async () => {
    localStorage.setItem('sofra_user_id', GUEST_UID)
    makeSupabase({ rsvpRow: { status: 'going' }, photoFetchError: { message: 'denied' } })
    render(<EventDetailPage params={PARAMS} />)

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/could not refresh/i))
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.getByText('0 memories')).toBeInTheDocument()
  })

  it('rolls storage back and reports an error when the row insert fails for every file', async () => {
    localStorage.setItem('sofra_user_id', GUEST_UID)
    const sb = makeSupabase({ rsvpRow: { status: 'going' }, photoInsertError: { message: 'insert denied' } })
    render(<EventDetailPage params={PARAMS} />)
    await waitFor(() => expect(screen.getByText('Shared Album')).toBeInTheDocument())

    await userEvent.upload(
      screen.getByLabelText('ADD PHOTOS', { selector: 'input' }),
      new File(['x'], 'memory.jpg', { type: 'image/jpeg' })
    )
    await userEvent.click(screen.getByRole('button', { name: /^upload 1 photo$/i }))

    await waitFor(() => expect(screen.getByText('Upload failed')).toBeInTheDocument())
    expect(sb._bucket.remove).toHaveBeenCalledWith([expect.stringMatching(/^ev-1\//)])
    expect(screen.getByText('0 memories')).toBeInTheDocument()
    expect(mockPush).not.toHaveBeenCalledWith('/events/ev-1/album')
  })

  it('increments an existing persisted album from one to two memories', async () => {
    localStorage.setItem('sofra_user_id', GUEST_UID)
    makeSupabase({ rsvpRow: { status: 'going' }, photoRows: [rowAt(1)] })
    render(<EventDetailPage params={PARAMS} />)
    await waitFor(() => expect(screen.getByText('1 memory')).toBeInTheDocument())

    await userEvent.upload(
      screen.getByLabelText('ADD PHOTOS', { selector: 'input' }),
      new File(['x'], 'second.jpg', { type: 'image/jpeg' })
    )
    await userEvent.click(screen.getByRole('button', { name: /^upload 1 photo$/i }))

    await waitFor(() => expect(screen.getByText('2 memories')).toBeInTheDocument())
  })

  it('shows every photo as a compact preview tile up to 6, with no overflow tile', async () => {
    localStorage.setItem('sofra_user_id', GUEST_UID)
    const rows = Array.from({ length: 6 }, (_, i) => rowAt(i))
    makeSupabase({ rsvpRow: { status: 'going' }, photoRows: rows })
    const { container } = render(<EventDetailPage params={PARAMS} />)

    await waitFor(() => expect(screen.getByText('6 memories')).toBeInTheDocument())
    expect(container.querySelectorAll('.sv2-album-preview-tile')).toHaveLength(6)
    expect(container.querySelector('.sv2-album-preview-overflow')).not.toBeInTheDocument()
  })

  it('caps the preview at 5 real tiles plus one overflow tile once the album exceeds 6 photos', async () => {
    localStorage.setItem('sofra_user_id', GUEST_UID)
    const rows = Array.from({ length: 23 }, (_, i) => rowAt(i))
    makeSupabase({ rsvpRow: { status: 'going' }, photoRows: rows })
    const { container } = render(<EventDetailPage params={PARAMS} />)

    await waitFor(() => expect(screen.getByText('23 memories')).toBeInTheDocument())
    expect(container.querySelectorAll('.sv2-album-preview-tile:not(.sv2-album-preview-overflow)')).toHaveLength(5)
    expect(screen.getByText('+18')).toBeInTheDocument()
  })

  it('opens the dedicated album at the selected photo when a preview tile is clicked', async () => {
    localStorage.setItem('sofra_user_id', GUEST_UID)
    makeSupabase({ rsvpRow: { status: 'going' }, photoRows: [rowAt(1)] })
    render(<EventDetailPage params={PARAMS} />)
    await waitFor(() => expect(screen.getByText('1 memory')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('img', { name: /memory shared/i }))
    expect(mockPush).toHaveBeenCalledWith('/events/ev-1/album?photo=photo-1')
  })

  it('opens the plain album (no specific photo) from VIEW ALBUM or the overflow tile', async () => {
    localStorage.setItem('sofra_user_id', GUEST_UID)
    const rows = Array.from({ length: 8 }, (_, i) => rowAt(i))
    makeSupabase({ rsvpRow: { status: 'going' }, photoRows: rows })
    render(<EventDetailPage params={PARAMS} />)
    await waitFor(() => expect(screen.getByText('8 memories')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: 'VIEW ALBUM' }))
    expect(mockPush).toHaveBeenCalledWith('/events/ev-1/album')

    mockPush.mockClear()
    await userEvent.click(screen.getByLabelText(/view all 8 photos/i))
    expect(mockPush).toHaveBeenCalledWith('/events/ev-1/album')
  })
})

describe('The Vibe', () => {
  it('is RSVP-gated and shows the full shared suggestion list in the matching community tabs', async () => {
    localStorage.setItem('sofra_user_id', GUEST_UID)
    makeSupabase({
      rsvpRow: { status: 'going' },
      playlistRows: [
        { id: 'song-1', event_id: 'ev-1', user_id: GUEST_UID, song: 'Levitating — Dua Lipa', created_at: '2026-08-29T10:00:00Z', users: { name: 'Guest', photo_url: null } },
        { id: 'song-2', event_id: 'ev-1', user_id: HOST_UID, song: 'Essence — Wizkid', created_at: '2026-08-29T10:01:00Z', users: { name: 'Host', photo_url: null } },
      ],
    })
    render(<EventDetailPage params={PARAMS} />)

    await userEvent.click(await screen.findByRole('tab', { name: 'THE VIBE' }))
    expect(screen.getAllByRole('tab')).toHaveLength(3)
    expect(screen.getByText('Levitating — Dua Lipa')).toBeInTheDocument()
    expect(screen.getByText('Essence — Wizkid')).toBeInTheDocument()
    expect(screen.getByText('1 of 3 songs added')).toBeInTheDocument()
  })
})

describe('Remove guest', () => {
  async function openGuestList() {
    await userEvent.click(await screen.findByRole('button', { name: /guests? attending/i }))
  }

  it('shows an accepted co-host in Around this Sofra with a Host badge', async () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    makeSupabase({ cohostRows: [{ users: { id: 'cohost-1', name: 'Mariam', photo_url: null } }] })
    render(<EventDetailPage params={PARAMS} />)
    await openGuestList()
    expect(await screen.findByText('Mariam')).toBeInTheDocument()
    expect(screen.getAllByText('Host').length).toBeGreaterThan(0)
  })

  it('promotes a previously RSVPed guest to co-host instead of keeping them labelled as a guest', async () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    const promoted = { id: 'guest-cohost', name: 'Mariam', photo_url: null }
    makeSupabase({
      guestRows: [{ status: 'going', users: promoted }],
      cohostRows: [{ users: promoted }],
    })
    render(<EventDetailPage params={PARAMS} />)
    await openGuestList()

    const name = await screen.findByText('Mariam')
    const rosterCard = name.closest('article')
    expect(rosterCard).not.toBeNull()
    expect(within(rosterCard!).getByText('Host')).toBeInTheDocument()
    expect(screen.getAllByText('Mariam')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Remove Mariam from this Sofra' })).not.toBeInTheDocument()
  })

  const REMOVABLE_GUEST = { status: 'going', users: { id: 'guest-abc', name: 'Omar' } }

  it('shows a Remove control per guest for the host', async () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    makeSupabase({ guestRows: [REMOVABLE_GUEST] })
    render(<EventDetailPage params={PARAMS} />)
    await openGuestList()
    await waitFor(() => expect(screen.getByText('Omar')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Remove Omar from this Sofra' })).toBeInTheDocument()
  })

  it('does not show a Remove control to a non-host guest', async () => {
    localStorage.setItem('sofra_user_id', GUEST_UID)
    makeSupabase({ rsvpRow: { status: 'going' }, guestRows: [REMOVABLE_GUEST] })
    render(<EventDetailPage params={PARAMS} />)
    await waitFor(() => expect(screen.getByText('Omar')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /remove omar/i })).not.toBeInTheDocument()
  })

  it('requires a confirm step before removing a guest', async () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    const sb = makeSupabase({ guestRows: [REMOVABLE_GUEST] })
    render(<EventDetailPage params={PARAMS} />)
    await openGuestList()
    await waitFor(() => screen.getByRole('button', { name: 'Remove Omar from this Sofra' }))
    await userEvent.click(screen.getByRole('button', { name: 'Remove Omar from this Sofra' }))

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(sb._deleteMock).not.toHaveBeenCalled()
  })

  it('cancelling the confirm step leaves the guest in place', async () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    const sb = makeSupabase({ guestRows: [REMOVABLE_GUEST] })
    render(<EventDetailPage params={PARAMS} />)
    await openGuestList()
    await waitFor(() => screen.getByRole('button', { name: 'Remove Omar from this Sofra' }))
    await userEvent.click(screen.getByRole('button', { name: 'Remove Omar from this Sofra' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.getByText('Omar')).toBeInTheDocument()
    expect(sb._deleteMock).not.toHaveBeenCalled()
  })

  it('confirming removal deletes the rsvp row for that guest and drops them from the list', async () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    const sb = makeSupabase({ guestRows: [REMOVABLE_GUEST] })
    render(<EventDetailPage params={PARAMS} />)
    await openGuestList()
    await waitFor(() => screen.getByRole('button', { name: 'Remove Omar from this Sofra' }))
    await userEvent.click(screen.getByRole('button', { name: 'Remove Omar from this Sofra' }))
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))

    await waitFor(() => expect(screen.queryByText('Omar')).not.toBeInTheDocument())
    expect(sb._deleteMock).toHaveBeenCalled()
    expect(sb._deleteEqMock1).toHaveBeenCalledWith('event_id', 'ev-1')
    expect(sb._deleteEqMock2).toHaveBeenCalledWith('user_id', 'guest-abc')
    expect(screen.getByText('0 going')).toBeInTheDocument()
  })

  it('shows an error and keeps the guest listed when the delete fails', async () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    makeSupabase({ guestRows: [REMOVABLE_GUEST], deleteError: { message: 'denied' } })
    render(<EventDetailPage params={PARAMS} />)
    await openGuestList()
    await waitFor(() => screen.getByRole('button', { name: 'Remove Omar from this Sofra' }))
    await userEvent.click(screen.getByRole('button', { name: 'Remove Omar from this Sofra' }))
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/could not remove/i))
    expect(screen.getByText('Omar')).toBeInTheDocument()
  })
})

describe('Access requests', () => {
  const REQUEST = {
    id: 'request-1',
    user_id: 'requester-1',
    created_at: '2026-08-21T12:00:00Z',
    users: { id: 'requester-1', name: 'Nour', photo_url: null },
  }

  it('lets the host accept a pending request and removes it from the pending list', async () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    const sb = makeSupabase({ pendingAccessRequests: [REQUEST] })
    render(<EventDetailPage params={PARAMS} />)

    await userEvent.click(await screen.findByRole('button', { name: 'ACCEPT' }))

    await waitFor(() => expect(sb.rpc).toHaveBeenCalledWith('respond_to_event_access_request', {
      p_request_id: 'request-1',
      p_reviewer_id: HOST_UID,
      p_accept: true,
    }))
    expect(screen.queryByText('Nour')).not.toBeInTheDocument()
  })

  it('lets a co-host reject a pending request', async () => {
    localStorage.setItem('sofra_user_id', GUEST_UID)
    const sb = makeSupabase({ viewerIsCohost: true, pendingAccessRequests: [REQUEST] })
    render(<EventDetailPage params={PARAMS} />)

    await userEvent.click(await screen.findByRole('button', { name: 'REJECT' }))

    await waitFor(() => expect(sb.rpc).toHaveBeenCalledWith('respond_to_event_access_request', {
      p_request_id: 'request-1',
      p_reviewer_id: GUEST_UID,
      p_accept: false,
    }))
  })
})

describe('Host membership', () => {
  it('shows the host in Around this Sofra with a Host badge and no remove control', async () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    makeSupabase({ guestRows: [{ status: 'going', users: { id: HOST_UID, name: 'Layla', photo_url: null } }] })
    render(<EventDetailPage params={PARAMS} />)
    await userEvent.click(await screen.findByRole('button', { name: /guests? attending/i }))

    await waitFor(() => expect(screen.getByText('Layla')).toBeInTheDocument())
    expect(screen.getByText('Host')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Remove Layla/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /my table preferences/i })).not.toBeInTheDocument()
  })
})

describe('Host preference reminder', () => {
  it('prompts a host without saved preferences and opens the preference form', async () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    makeSupabase({ tasteProfile: null })
    render(<EventDetailPage params={PARAMS} />)

    const action = await screen.findByRole('button', { name: 'ADD PREFERENCES' })
    await userEvent.click(action)
    expect(mockPush).toHaveBeenCalledWith('/events/ev-1/rsvp?preferences=1')
  })

  it('hides the reminder once host preferences exist', async () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    makeSupabase({ tasteProfile: { user_id: HOST_UID } })
    render(<EventDetailPage params={PARAMS} />)

    await waitFor(() => expect(screen.getByText('Casa Mekawi')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'ADD PREFERENCES' })).not.toBeInTheDocument()
  })
})

describe('Host kitchen reminder', () => {
  it('prompts a host who chose "later" and has not yet filled in the Kitchen', async () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    makeSupabase({ event: { ...SAMPLE_EVENT, kitchen_status: 'pending', kitchen_plan: 'later' } })
    render(<EventDetailPage params={PARAMS} />)

    const action = await screen.findByRole('button', { name: 'FILL KITCHEN NOW' })
    await userEvent.click(action)
    expect(mockPush).toHaveBeenCalledWith('/kitchen?from=ev-1')
  })

  it('does not show the reminder once Kitchen is complete, even if the plan was "later"', async () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    makeSupabase({ event: { ...SAMPLE_EVENT, kitchen_status: 'complete', kitchen_plan: 'later' } })
    render(<EventDetailPage params={PARAMS} />)

    await waitFor(() => expect(screen.getByText('Casa Mekawi')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'FILL KITCHEN NOW' })).not.toBeInTheDocument()
  })

  it.each(['now', 'chef'] as const)(
    'does not show the reminder for a still-pending Kitchen when the chosen plan was "%s"',
    async (plan) => {
      localStorage.setItem('sofra_user_id', HOST_UID)
      makeSupabase({ event: { ...SAMPLE_EVENT, kitchen_status: 'pending', kitchen_plan: plan } })
      render(<EventDetailPage params={PARAMS} />)

      await waitFor(() => expect(screen.getByText('Casa Mekawi')).toBeInTheDocument())
      expect(screen.queryByRole('button', { name: 'FILL KITCHEN NOW' })).not.toBeInTheDocument()
    }
  )

  it('never shows the reminder to a non-host guest, even when the event itself qualifies', async () => {
    localStorage.setItem('sofra_user_id', GUEST_UID)
    makeSupabase({
      event: { ...SAMPLE_EVENT, kitchen_status: 'pending', kitchen_plan: 'later' },
      rsvpRow: { status: 'going' },
    })
    render(<EventDetailPage params={PARAMS} />)

    await waitFor(() => expect(screen.getByText('Casa Mekawi')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'FILL KITCHEN NOW' })).not.toBeInTheDocument()
  })
})

it('shows the event year in the detail date', async () => {
  localStorage.setItem('sofra_user_id', HOST_UID)
  makeSupabase()
  render(<EventDetailPage params={PARAMS} />)

  await waitFor(() => expect(screen.getByText(/September 1, 2026/)).toBeInTheDocument())
})

it('offers Google Maps and Apple Maps links once the address is unlocked', async () => {
  localStorage.setItem('sofra_user_id', GUEST_UID)
  makeSupabase({ rsvpRow: { status: 'going' } })
  render(<EventDetailPage params={PARAMS} />)

  const google = await screen.findByRole('link', { name: 'Google Maps' })
  const apple = screen.getByRole('link', { name: 'Apple Maps' })
  expect(google).toHaveAttribute('href', 'https://www.google.com/maps/search/?api=1&query=123%20Main%20St')
  expect(apple).toHaveAttribute('href', 'https://maps.apple.com/?q=123%20Main%20St')
})

it('shows the declined RSVP copy without an x', async () => {
  localStorage.setItem('sofra_user_id', GUEST_UID)
  makeSupabase({ rsvpRow: { status: 'cant' } })
  render(<EventDetailPage params={PARAMS} />)

  expect(await screen.findByText('I have better things to do apparently')).toBeInTheDocument()
  expect(screen.queryByText(/Can't make it/)).not.toBeInTheDocument()
})

it('shows the going RSVP copy without a star', async () => {
  localStorage.setItem('sofra_user_id', GUEST_UID)
  makeSupabase({ rsvpRow: { status: 'going' } })
  render(<EventDetailPage params={PARAMS} />)

  expect(await screen.findByText('Blessing us with your presence')).toBeInTheDocument()
  expect(screen.queryByText('Going ✦')).not.toBeInTheDocument()
})

describe('Locked table preview', () => {
  it('keeps event details and the guest list private on the invitation landing', async () => {
    localStorage.setItem('sofra_user_id', GUEST_UID)
    makeSupabase()
    render(<EventDetailPage params={PARAMS} />)
    expect(await screen.findByRole('button', { name: 'YALLA' })).toBeInTheDocument()
    expect(screen.queryByText('The table')).not.toBeInTheDocument()
    expect(screen.queryByText('Around this Sofra')).not.toBeInTheDocument()
    expect(mockReplace).not.toHaveBeenCalledWith('/events/ev-1/request-access')
  })

  it('does not render the private table teaser before YALLA', async () => {
    localStorage.setItem('sofra_user_id', GUEST_UID)
    makeSupabase()
    const { container } = render(<EventDetailPage params={PARAMS} />)
    await screen.findByRole('button', { name: 'YALLA' })
    expect(container.querySelectorAll('.sv2-table-preview-dots span')).toHaveLength(0)
    expect(screen.queryByText('Around this Sofra')).not.toBeInTheDocument()
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

it('renders a custom detail section using the same row style as Dress code', async () => {
  localStorage.setItem('sofra_user_id', HOST_UID)
  makeSupabase({
    event: { ...SAMPLE_EVENT, custom_details: [{ id: 'd_1', label: 'Parking', body: 'Free lot behind the theater' }] },
  })
  render(<EventDetailPage params={PARAMS} />)
  await userEvent.click(await screen.findByRole('button', { name: /September 1, 2026/ }))
  await waitFor(() => expect(screen.getByText('Parking')).toBeInTheDocument())
  expect(screen.getByText('Free lot behind the theater')).toBeInTheDocument()
})
