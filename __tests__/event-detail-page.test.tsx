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
  guestRows  = [] as Array<{ status: string; users: { id: string; name: string; photo_url?: string | null } | null }>,
  deleteError = null as { message: string } | null,
  photoRows  = [] as Array<{ id: string; event_id: string; uploaded_by: string; storage_path: string; created_at: string }>,
  photoFetchError = null as { message: string } | null,
  photoInsertError = null as { message: string } | null,
  photoUploadError = null as { message: string } | null,
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
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: event, error: fetchError }),
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
      // rsvps
      return {
        select: jest.fn().mockReturnValue({ eq: outerEqMock }),
        delete: deleteMock,
      }
    }),
    storage: {
      from: jest.fn().mockReturnValue(bucket),
    },
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

describe('EDIT EVENT button', () => {
  it('shows for the host on an upcoming event, and navigates to the host edit route', async () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    makeSupabase()
    render(<EventDetailPage params={PARAMS} />)
    await waitFor(() => expect(screen.getByRole('link', { name: 'EDIT EVENT' })).toBeInTheDocument())
    await userEvent.click(screen.getByRole('link', { name: 'EDIT EVENT' }))
    expect(mockPush).toHaveBeenCalledWith('/host/ev-1/edit')
  })

  it('is never shown to a guest, even one with an RSVP', async () => {
    localStorage.setItem('sofra_user_id', GUEST_UID)
    makeSupabase({ rsvpRow: { status: 'going' } })
    render(<EventDetailPage params={PARAMS} />)
    await waitFor(() => expect(screen.getByText('Around this Sofra')).toBeInTheDocument())
    expect(screen.queryByRole('link', { name: 'EDIT EVENT' })).not.toBeInTheDocument()
  })

  it('is hidden from the host once the event is in the past', async () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    makeSupabase({ event: { ...SAMPLE_EVENT, event_date: '2020-01-01T00:00:00Z' } })
    render(<EventDetailPage params={PARAMS} />)
    await waitFor(() => expect(screen.getByRole('button', { name: /copy invite link/i })).toBeInTheDocument())
    expect(screen.queryByRole('link', { name: 'EDIT EVENT' })).not.toBeInTheDocument()
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

describe('Remove guest', () => {
  const REMOVABLE_GUEST = { status: 'going', users: { id: 'guest-abc', name: 'Omar' } }

  it('shows a Remove control per guest for the host', async () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    makeSupabase({ guestRows: [REMOVABLE_GUEST] })
    render(<EventDetailPage params={PARAMS} />)
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
    await waitFor(() => screen.getByRole('button', { name: 'Remove Omar from this Sofra' }))
    await userEvent.click(screen.getByRole('button', { name: 'Remove Omar from this Sofra' }))

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(sb._deleteMock).not.toHaveBeenCalled()
  })

  it('cancelling the confirm step leaves the guest in place', async () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    const sb = makeSupabase({ guestRows: [REMOVABLE_GUEST] })
    render(<EventDetailPage params={PARAMS} />)
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
    await waitFor(() => screen.getByRole('button', { name: 'Remove Omar from this Sofra' }))
    await userEvent.click(screen.getByRole('button', { name: 'Remove Omar from this Sofra' }))
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/could not remove/i))
    expect(screen.getByText('Omar')).toBeInTheDocument()
  })
})

describe('Host membership', () => {
  it('shows the host in Around this Sofra with a Host badge and no remove control', async () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    makeSupabase({ guestRows: [{ status: 'going', users: { id: HOST_UID, name: 'Layla', photo_url: null } }] })
    render(<EventDetailPage params={PARAMS} />)

    await waitFor(() => expect(screen.getByText('Layla')).toBeInTheDocument())
    expect(screen.getByText('Host')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Remove Layla/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /my table preferences/i })).not.toBeInTheDocument()
  })
})

it('shows the event year in the detail date', async () => {
  localStorage.setItem('sofra_user_id', HOST_UID)
  makeSupabase()
  render(<EventDetailPage params={PARAMS} />)

  await waitFor(() => expect(screen.getByText(/September 1, 2026/)).toBeInTheDocument())
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
