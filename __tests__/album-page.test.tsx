import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EventAlbumPage from '@/app/(guest)/events/[id]/album/page'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'

jest.mock('@/lib/supabase/client')
jest.mock('next/navigation', () => ({ useRouter: jest.fn(), useSearchParams: jest.fn() }))

const mockPush = jest.fn()
const mockReplace = jest.fn()
let query = new URLSearchParams()

const HOST_UID = 'uid-host'
const GUEST_UID = 'uid-guest'
const PARAMS = { id: 'ev-1' }

const SAMPLE_EVENT = { id: 'ev-1', host_id: HOST_UID, title: 'Casa Mekawi' }

function photoRow(i: number, extra: Record<string, unknown> = {}) {
  return {
    id: `photo-${i}`,
    event_id: 'ev-1',
    uploaded_by: GUEST_UID,
    storage_path: `ev-1/photo-${i}.jpg`,
    caption: `Caption ${i}`,
    upload_batch_id: 'batch-1',
    created_at: `2026-08-0${(i % 9) + 1}T10:00:00Z`,
    ...extra,
  }
}

function makeSupabase({
  rsvpRow = null as { status: string } | null,
  photoRows = [] as ReturnType<typeof photoRow>[],
  usersRows = [{ id: GUEST_UID, name: 'Ali', photo_url: null }] as Array<{ id: string; name: string; photo_url: string | null }>,
  commentRows = [] as Array<{ id: string; photo_id: string; user_id: string; body: string; created_at: string }>,
  commentInsertResult = null as { data: unknown; error: unknown } | null,
  isCohost = false,
} = {}) {
  const bucket = {
    upload: jest.fn().mockResolvedValue({ data: {}, error: null }),
    remove: jest.fn().mockResolvedValue({ data: [], error: null }),
    getPublicUrl: jest.fn((path: string) => ({ data: { publicUrl: `https://example.test/${path}` } })),
  }

  const sb = {
    from: jest.fn((table: string) => {
      if (table === 'events') {
        return { select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ single: jest.fn().mockResolvedValue({ data: SAMPLE_EVENT, error: null }) }) }) }
      }
      if (table === 'rsvps') {
        return { select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ maybeSingle: jest.fn().mockResolvedValue({ data: rsvpRow, error: null }) }) }) }) }
      }
      if (table === 'event_photos') {
        return {
          select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ order: jest.fn().mockResolvedValue({ data: photoRows, error: null }) }) }),
          insert: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ single: jest.fn().mockResolvedValue({ data: null, error: { message: 'not used' } }) }) }),
          delete: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) }),
        }
      }
      if (table === 'users') {
        return { select: jest.fn().mockReturnValue({ in: jest.fn().mockResolvedValue({ data: usersRows, error: null }) }) }
      }
      if (table === 'event_cohosts') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                maybeSingle: jest.fn().mockResolvedValue({ data: isCohost ? { user_id: GUEST_UID } : null, error: null }),
              }),
            }),
          }),
        }
      }
      if (table === 'event_photo_comments') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn((_col: string, photoId: string) => ({
              order: jest.fn().mockResolvedValue({ data: commentRows.filter((c) => c.photo_id === photoId), error: null }),
            })),
          }),
          insert: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue(
                commentInsertResult ?? { data: { id: 'c-new', photo_id: 'photo-1', user_id: GUEST_UID, body: 'posted', created_at: '2026-08-01T12:00:00Z' }, error: null }
              ),
            }),
          }),
        }
      }
      throw new Error(`Unexpected table ${table}`)
    }),
    storage: { from: jest.fn().mockReturnValue(bucket) },
  }
  ;(createClient as jest.Mock).mockReturnValue(sb)
  return sb
}

beforeEach(() => {
  jest.clearAllMocks()
  localStorage.clear()
  query = new URLSearchParams()
  ;(useRouter as jest.Mock).mockReturnValue({ push: mockPush, replace: mockReplace })
  ;(useSearchParams as jest.Mock).mockImplementation(() => query)
})

describe('access control', () => {
  it('redirects to phone login while preserving the album destination when no local identity is set', async () => {
    makeSupabase()
    render(<EventAlbumPage params={PARAMS} />)
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/login?invite=1&next=%2Fevents%2Fev-1%2Falbum'))
  })

  it('routes a guest who has not RSVPed to request host access', async () => {
    localStorage.setItem('sofra_user_id', GUEST_UID)
    makeSupabase({ rsvpRow: null, photoRows: [photoRow(1)] })
    render(<EventAlbumPage params={PARAMS} />)
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/events/ev-1/request-access'))
    expect(screen.queryByLabelText('ADD PHOTOS', { selector: 'input' })).not.toBeInTheDocument()
  })

  it('shows photos and the upload control for the host', async () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    makeSupabase({ photoRows: [photoRow(1)] })
    render(<EventAlbumPage params={PARAMS} />)
    await waitFor(() => expect(screen.getByText('1 memory')).toBeInTheDocument())
    expect(screen.getByLabelText('ADD PHOTOS', { selector: 'input' })).toBeInTheDocument()
    expect(screen.getByText('Maximum 20 photos per upload.')).toBeInTheDocument()
  })

  it('shows photos and the upload control for an accepted co-host, even with no RSVP row', async () => {
    localStorage.setItem('sofra_user_id', GUEST_UID)
    makeSupabase({ rsvpRow: null, photoRows: [photoRow(1)], isCohost: true })
    render(<EventAlbumPage params={PARAMS} />)
    await waitFor(() => expect(screen.getByText('1 memory')).toBeInTheDocument())
    expect(screen.getByLabelText('ADD PHOTOS', { selector: 'input' })).toBeInTheDocument()
  })
})

describe('grid', () => {
  it('renders one tile per photo', async () => {
    localStorage.setItem('sofra_user_id', GUEST_UID)
    const rows = [photoRow(1), photoRow(2), photoRow(3)]
    makeSupabase({ rsvpRow: { status: 'going' }, photoRows: rows })
    const { container } = render(<EventAlbumPage params={PARAMS} />)
    await waitFor(() => expect(screen.getByText('3 memories')).toBeInTheDocument())
    expect(container.querySelectorAll('.sv2-album-page-tile')).toHaveLength(3)
  })

  it('shows the event title as subtitle', async () => {
    localStorage.setItem('sofra_user_id', GUEST_UID)
    makeSupabase({ rsvpRow: { status: 'going' }, photoRows: [photoRow(1)] })
    render(<EventAlbumPage params={PARAMS} />)
    await waitFor(() => expect(screen.getByText('Casa Mekawi')).toBeInTheDocument())
  })
})

describe('viewer navigation', () => {
  async function renderWithThree() {
    localStorage.setItem('sofra_user_id', GUEST_UID)
    const rows = [photoRow(1), photoRow(2), photoRow(3)]
    makeSupabase({ rsvpRow: { status: 'going' }, photoRows: rows })
    render(<EventAlbumPage params={PARAMS} />)
    await waitFor(() => expect(screen.getByText('3 memories')).toBeInTheDocument())
    return rows
  }

  it('opens the viewer at the clicked photo with a correct position indicator', async () => {
    await renderWithThree()
    const tiles = screen.getAllByRole('button', { name: /open photo/i })
    await userEvent.click(tiles[1])
    expect(screen.getByText('2 of 3')).toBeInTheDocument()
    await screen.findByRole('button', { name: 'Add a comment' })
  })

  it('advances with next and wraps from the last photo to the first', async () => {
    await renderWithThree()
    await userEvent.click(screen.getAllByRole('button', { name: /open photo/i })[2])
    expect(screen.getByText('3 of 3')).toBeInTheDocument()
    await screen.findByRole('button', { name: 'Add a comment' })
    await userEvent.click(screen.getByRole('button', { name: 'Next photo' }))
    expect(screen.getByText('1 of 3')).toBeInTheDocument()
    await screen.findByRole('button', { name: 'Add a comment' })
  })

  it('goes back with previous and wraps from the first photo to the last', async () => {
    await renderWithThree()
    await userEvent.click(screen.getAllByRole('button', { name: /open photo/i })[0])
    expect(screen.getByText('1 of 3')).toBeInTheDocument()
    await screen.findByRole('button', { name: 'Add a comment' })
    await userEvent.click(screen.getByRole('button', { name: 'Previous photo' }))
    expect(screen.getByText('3 of 3')).toBeInTheDocument()
    await screen.findByRole('button', { name: 'Add a comment' })
  })

  it('responds to ArrowRight, ArrowLeft, and Escape', async () => {
    await renderWithThree()
    await userEvent.click(screen.getAllByRole('button', { name: /open photo/i })[0])
    expect(screen.getByText('1 of 3')).toBeInTheDocument()
    await screen.findByRole('button', { name: 'Add a comment' })

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(screen.getByText('2 of 3')).toBeInTheDocument()
    await screen.findByRole('button', { name: 'Add a comment' })

    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(screen.getByText('1 of 3')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Photo viewer' })).not.toBeInTheDocument()
  })

  it('advances on a leftward swipe past the threshold, and ignores a tiny drag', async () => {
    await renderWithThree()
    await userEvent.click(screen.getAllByRole('button', { name: /open photo/i })[0])
    await screen.findByRole('button', { name: 'Add a comment' })
    const stage = screen.getByRole('dialog', { name: 'Photo viewer' }).querySelector('.sv2-photo-viewer-stage')!

    fireEvent.pointerDown(stage, { clientX: 300, clientY: 100 })
    fireEvent.pointerUp(stage, { clientX: 295, clientY: 100 })
    expect(screen.getByText('1 of 3')).toBeInTheDocument()

    fireEvent.pointerDown(stage, { clientX: 300, clientY: 100 })
    fireEvent.pointerUp(stage, { clientX: 200, clientY: 100 })
    expect(screen.getByText('2 of 3')).toBeInTheDocument()
    await screen.findByRole('button', { name: 'Add a comment' })
  })

  it('closes back to the grid via the close button', async () => {
    await renderWithThree()
    await userEvent.click(screen.getAllByRole('button', { name: /open photo/i })[0])
    await screen.findByRole('button', { name: 'Add a comment' })
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog', { name: 'Photo viewer' })).not.toBeInTheDocument()
  })

  it('opens directly to the photo named in the ?photo= query param', async () => {
    localStorage.setItem('sofra_user_id', GUEST_UID)
    query = new URLSearchParams('photo=photo-2')
    makeSupabase({ rsvpRow: { status: 'going' }, photoRows: [photoRow(1), photoRow(2), photoRow(3)] })
    render(<EventAlbumPage params={PARAMS} />)
    await waitFor(() => expect(screen.getByText('2 of 3')).toBeInTheDocument())
    await screen.findByRole('button', { name: 'Add a comment' })
  })
})

describe('attribution and captions', () => {
  it('shows uploader name and caption in the expanded viewer', async () => {
    localStorage.setItem('sofra_user_id', GUEST_UID)
    makeSupabase({ rsvpRow: { status: 'going' }, photoRows: [photoRow(1)] })
    render(<EventAlbumPage params={PARAMS} />)
    await waitFor(() => expect(screen.getByText('1 memory')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /open photo/i }))
    expect(screen.getByText(/Ali/)).toBeInTheDocument()
    expect(screen.getByText('Caption 1')).toBeInTheDocument()
    await screen.findByRole('button', { name: 'Add a comment' })
  })

  it('falls back to initials when the uploader has no profile photo', async () => {
    localStorage.setItem('sofra_user_id', GUEST_UID)
    makeSupabase({ rsvpRow: { status: 'going' }, photoRows: [photoRow(1)], usersRows: [{ id: GUEST_UID, name: 'Ali', photo_url: null }] })
    render(<EventAlbumPage params={PARAMS} />)
    await waitFor(() => expect(screen.getByText('1 memory')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /open photo/i }))
    expect(screen.getByText('A')).toBeInTheDocument()
    await screen.findByRole('button', { name: 'Add a comment' })
  })

  it('omits the caption line for old records saved before captions existed', async () => {
    localStorage.setItem('sofra_user_id', GUEST_UID)
    const oldRow = photoRow(1, { caption: null, upload_batch_id: null })
    makeSupabase({ rsvpRow: { status: 'going' }, photoRows: [oldRow] })
    render(<EventAlbumPage params={PARAMS} />)
    await waitFor(() => expect(screen.getByText('1 memory')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /open photo/i }))
    expect(screen.queryByText(/Caption/)).not.toBeInTheDocument()
    expect(screen.getByText(/Ali/)).toBeInTheDocument()
    await screen.findByRole('button', { name: 'Add a comment' })
  })
})

describe('comment count on the viewer button', () => {
  it('shows ADD A COMMENT for a photo with zero comments, opening to an empty panel', async () => {
    localStorage.setItem('sofra_user_id', GUEST_UID)
    makeSupabase({ rsvpRow: { status: 'going' }, photoRows: [photoRow(1)], commentRows: [] })
    render(<EventAlbumPage params={PARAMS} />)
    await waitFor(() => expect(screen.getByText('1 memory')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /open photo/i }))

    const button = await screen.findByRole('button', { name: 'Add a comment' })
    expect(button).toHaveTextContent('ADD A COMMENT')

    await userEvent.click(button)
    expect(screen.getByText('No comments yet.')).toBeInTheDocument()
  })

  it('shows the singular label for exactly one comment', async () => {
    localStorage.setItem('sofra_user_id', GUEST_UID)
    makeSupabase({
      rsvpRow: { status: 'going' },
      photoRows: [photoRow(1)],
      commentRows: [{ id: 'c1', photo_id: 'photo-1', user_id: GUEST_UID, body: 'No way omg', created_at: '2026-08-01T10:00:00Z' }],
    })
    render(<EventAlbumPage params={PARAMS} />)
    await waitFor(() => expect(screen.getByText('1 memory')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /open photo/i }))

    const button = await screen.findByRole('button', { name: 'View 1 comment' })
    expect(button).toHaveTextContent('1 COMMENT')
  })

  it('shows the plural label for multiple comments', async () => {
    localStorage.setItem('sofra_user_id', GUEST_UID)
    makeSupabase({
      rsvpRow: { status: 'going' },
      photoRows: [photoRow(1)],
      commentRows: [
        { id: 'c1', photo_id: 'photo-1', user_id: GUEST_UID, body: 'One', created_at: '2026-08-01T10:00:00Z' },
        { id: 'c2', photo_id: 'photo-1', user_id: GUEST_UID, body: 'Two', created_at: '2026-08-01T10:01:00Z' },
        { id: 'c3', photo_id: 'photo-1', user_id: GUEST_UID, body: 'Three', created_at: '2026-08-01T10:02:00Z' },
      ],
    })
    render(<EventAlbumPage params={PARAMS} />)
    await waitFor(() => expect(screen.getByText('1 memory')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /open photo/i }))

    const button = await screen.findByRole('button', { name: 'View 3 comments' })
    expect(button).toHaveTextContent('3 COMMENTS')
  })

  it('clicking the count opens the same panel, showing existing comments and allowing another', async () => {
    localStorage.setItem('sofra_user_id', GUEST_UID)
    makeSupabase({
      rsvpRow: { status: 'going' },
      photoRows: [photoRow(1)],
      commentRows: [{ id: 'c1', photo_id: 'photo-1', user_id: GUEST_UID, body: 'No way omg', created_at: '2026-08-01T10:00:00Z' }],
    })
    render(<EventAlbumPage params={PARAMS} />)
    await waitFor(() => expect(screen.getByText('1 memory')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /open photo/i }))

    await userEvent.click(await screen.findByRole('button', { name: 'View 1 comment' }))
    expect(screen.getByText('No way omg')).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('Add a comment'), 'Adding another')
    await userEvent.click(screen.getByRole('button', { name: 'POST' }))
    await waitFor(() => expect(screen.getByText('posted')).toBeInTheDocument())
  })

  it('increments the visible count immediately after posting, with no refresh required', async () => {
    localStorage.setItem('sofra_user_id', GUEST_UID)
    makeSupabase({
      rsvpRow: { status: 'going' },
      photoRows: [photoRow(1)],
      commentRows: [{ id: 'c1', photo_id: 'photo-1', user_id: GUEST_UID, body: 'First', created_at: '2026-08-01T10:00:00Z' }],
    })
    render(<EventAlbumPage params={PARAMS} />)
    await waitFor(() => expect(screen.getByText('1 memory')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /open photo/i }))

    await userEvent.click(await screen.findByRole('button', { name: 'View 1 comment' }))
    await userEvent.type(screen.getByLabelText('Add a comment'), 'Second')
    await userEvent.click(screen.getByRole('button', { name: 'POST' }))
    await waitFor(() => expect(screen.getByText('posted')).toBeInTheDocument())

    // The toggle prioritizes open/close while the panel is open; close it to
    // confirm the count itself was updated, not just the list inside.
    await userEvent.click(screen.getByRole('button', { name: 'Hide comments' }))
    expect(screen.getByRole('button', { name: 'View 2 comments' })).toBeInTheDocument()
  })

  it('updates immediately when navigating to a photo with a different count, without leaking the previous count', async () => {
    localStorage.setItem('sofra_user_id', GUEST_UID)
    makeSupabase({
      rsvpRow: { status: 'going' },
      photoRows: [photoRow(1), photoRow(2)],
      commentRows: [{ id: 'c1', photo_id: 'photo-1', user_id: GUEST_UID, body: 'Only on photo 1', created_at: '2026-08-01T10:00:00Z' }],
    })
    render(<EventAlbumPage params={PARAMS} />)
    await waitFor(() => expect(screen.getByText('2 memories')).toBeInTheDocument())

    await userEvent.click(screen.getAllByRole('button', { name: /open photo/i })[0])
    await screen.findByRole('button', { name: 'View 1 comment' })

    await userEvent.click(screen.getByRole('button', { name: 'Next photo' }))
    await screen.findByRole('button', { name: 'Add a comment' })
    expect(screen.queryByText(/1 COMMENT/)).not.toBeInTheDocument()
  })

  it('does not re-fetch comments when navigating back to an already-visited photo', async () => {
    localStorage.setItem('sofra_user_id', GUEST_UID)
    const sb = makeSupabase({
      rsvpRow: { status: 'going' },
      photoRows: [photoRow(1), photoRow(2)],
      commentRows: [],
    })
    render(<EventAlbumPage params={PARAMS} />)
    await waitFor(() => expect(screen.getByText('2 memories')).toBeInTheDocument())

    await userEvent.click(screen.getAllByRole('button', { name: /open photo/i })[0])
    await screen.findByRole('button', { name: 'Add a comment' })
    const callsAfterFirstPhoto = sb.from.mock.calls.filter(([t]: [string]) => t === 'event_photo_comments').length

    await userEvent.click(screen.getByRole('button', { name: 'Next photo' }))
    await screen.findByRole('button', { name: 'Add a comment' })
    await userEvent.click(screen.getByRole('button', { name: 'Previous photo' }))
    await screen.findByRole('button', { name: 'Add a comment' })

    const callsAfterRevisit = sb.from.mock.calls.filter(([t]: [string]) => t === 'event_photo_comments').length
    expect(callsAfterRevisit).toBe(callsAfterFirstPhoto + 1)
  })

  it('disables POST for an empty or whitespace-only comment', async () => {
    localStorage.setItem('sofra_user_id', GUEST_UID)
    makeSupabase({ rsvpRow: { status: 'going' }, photoRows: [photoRow(1)] })
    render(<EventAlbumPage params={PARAMS} />)
    await waitFor(() => expect(screen.getByText('1 memory')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /open photo/i }))
    await userEvent.click(await screen.findByRole('button', { name: 'Add a comment' }))
    expect(screen.getByRole('button', { name: 'POST' })).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Add a comment'), '   ')
    expect(screen.getByRole('button', { name: 'POST' })).toBeDisabled()
  })
})

describe('select and save photos', () => {
  beforeEach(() => {
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    ;(global as any).URL.createObjectURL = jest.fn().mockReturnValue('blob:mock-url')
    ;(global as any).URL.revokeObjectURL = jest.fn()
    global.fetch = jest.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['x']) })
  })

  afterEach(() => jest.restoreAllMocks())

  async function renderWithThree() {
    localStorage.setItem('sofra_user_id', GUEST_UID)
    const rows = [photoRow(1), photoRow(2), photoRow(3)]
    makeSupabase({ rsvpRow: { status: 'going' }, photoRows: rows })
    render(<EventAlbumPage params={PARAMS} />)
    await waitFor(() => expect(screen.getByText('3 memories')).toBeInTheDocument())
  }

  it('enters select mode, toggles individual photos, and shows a live selected count', async () => {
    await renderWithThree()
    await userEvent.click(screen.getByRole('button', { name: 'SELECT' }))
    expect(screen.getByText('0 selected')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /select photo 1 of 3/i }))
    expect(screen.getByText('1 selected')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /select photo 2 of 3/i }))
    expect(screen.getByText('2 selected')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /deselect photo 1 of 3/i }))
    expect(screen.getByText('1 selected')).toBeInTheDocument()
  })

  it('does not open the viewer while in select mode', async () => {
    await renderWithThree()
    await userEvent.click(screen.getByRole('button', { name: 'SELECT' }))
    await userEvent.click(screen.getByRole('button', { name: /select photo 1 of 3/i }))
    expect(screen.queryByRole('dialog', { name: 'Photo viewer' })).not.toBeInTheDocument()
  })

  it('selects and deselects everything with SELECT ALL / DESELECT ALL', async () => {
    await renderWithThree()
    await userEvent.click(screen.getByRole('button', { name: 'SELECT' }))
    await userEvent.click(screen.getByRole('button', { name: 'SELECT ALL' }))
    expect(screen.getByText('3 selected')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'DESELECT ALL' }))
    expect(screen.getByText('0 selected')).toBeInTheDocument()
  })

  it('disables SAVE until at least one photo is selected', async () => {
    await renderWithThree()
    await userEvent.click(screen.getByRole('button', { name: 'SELECT' }))
    expect(screen.getByRole('button', { name: 'Save selected photos' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: /select photo 1 of 3/i }))
    expect(screen.getByRole('button', { name: 'Save selected photos' })).toBeEnabled()
  })

  it('downloads every selected photo and reports how many saved, when the Web Share File API is unavailable', async () => {
    await renderWithThree()
    await userEvent.click(screen.getByRole('button', { name: 'SELECT' }))
    await userEvent.click(screen.getByRole('button', { name: 'SELECT ALL' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save selected photos' }))

    await waitFor(() => expect(screen.getByText('3 photos saved')).toBeInTheDocument())
    expect(global.fetch).toHaveBeenCalledTimes(3)
  })

  it('hands selected photos to the native share sheet on devices that support it, instead of downloading', async () => {
    const shareMock = jest.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'canShare', { value: jest.fn().mockReturnValue(true), configurable: true })
    Object.defineProperty(navigator, 'share', { value: shareMock, configurable: true })

    await renderWithThree()
    await userEvent.click(screen.getByRole('button', { name: 'SELECT' }))
    await userEvent.click(screen.getByRole('button', { name: 'SELECT ALL' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save selected photos' }))

    await waitFor(() => expect(screen.getByText('3 photos saved')).toBeInTheDocument())
    expect(shareMock).toHaveBeenCalledTimes(1)
    expect(shareMock.mock.calls[0][0].files).toHaveLength(3)
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled()

    delete (navigator as any).share
    delete (navigator as any).canShare
  })

  it('silently clears the progress state when the user cancels the native share sheet', async () => {
    const abortError = Object.assign(new Error('cancelled'), { name: 'AbortError' })
    Object.defineProperty(navigator, 'canShare', { value: jest.fn().mockReturnValue(true), configurable: true })
    Object.defineProperty(navigator, 'share', { value: jest.fn().mockRejectedValue(abortError), configurable: true })

    await renderWithThree()
    await userEvent.click(screen.getByRole('button', { name: 'SELECT' }))
    await userEvent.click(screen.getByRole('button', { name: 'SELECT ALL' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save selected photos' }))

    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
    expect(screen.queryByText(/saved/)).not.toBeInTheDocument()

    delete (navigator as any).share
    delete (navigator as any).canShare
  })

  it('clears the selection and exits select mode via CANCEL', async () => {
    await renderWithThree()
    await userEvent.click(screen.getByRole('button', { name: 'SELECT' }))
    await userEvent.click(screen.getByRole('button', { name: /select photo 1 of 3/i }))
    await userEvent.click(screen.getByRole('button', { name: 'CANCEL' }))

    expect(screen.queryByText(/selected/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'SELECT' })).toBeInTheDocument()
    // Re-entering select mode confirms the previous selection was cleared, not just hidden.
    await userEvent.click(screen.getByRole('button', { name: 'SELECT' }))
    expect(screen.getByText('0 selected')).toBeInTheDocument()
  })
})

describe('photo deletion', () => {
  it('the host sees a DELETE button in the full-screen viewer for any photo', async () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    makeSupabase({ photoRows: [photoRow(1)] })
    render(<EventAlbumPage params={PARAMS} />)
    await userEvent.click(await screen.findByRole('button', { name: /open photo 1 of 1/i }))
    expect(await screen.findByRole('button', { name: /^delete$/i })).toBeInTheDocument()
  })

  it('a non-uploader, non-host guest does not see a DELETE button', async () => {
    localStorage.setItem('sofra_user_id', 'someone-else')
    makeSupabase({ rsvpRow: { status: 'going' }, photoRows: [photoRow(1)] })
    render(<EventAlbumPage params={PARAMS} />)
    await userEvent.click(await screen.findByRole('button', { name: /open photo 1 of 1/i }))
    expect(screen.queryByRole('button', { name: /^delete$/i })).not.toBeInTheDocument()
  })

  it('the uploader sees a DELETE button for their own photo and deleting it closes the viewer and refreshes the album', async () => {
    localStorage.setItem('sofra_user_id', GUEST_UID)
    const sb = makeSupabase({ rsvpRow: { status: 'going' }, photoRows: [photoRow(1)] })
    render(<EventAlbumPage params={PARAMS} />)
    await userEvent.click(await screen.findByRole('button', { name: /open photo 1 of 1/i }))
    await userEvent.click(await screen.findByRole('button', { name: /^delete$/i }))
    await userEvent.click(screen.getByRole('button', { name: /yes, delete/i }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /photo viewer/i })).not.toBeInTheDocument())
    const eventPhotosCalls = sb.from.mock.calls.filter(([t]: [string]) => t === 'event_photos')
    expect(eventPhotosCalls.length).toBeGreaterThanOrEqual(1)
  })

  it('bulk-deleting a mixed selection only deletes the viewer\'s own photos, excluding the other guest\'s photo entirely', async () => {
    localStorage.setItem('sofra_user_id', GUEST_UID)
    makeSupabase({
      rsvpRow: { status: 'going' },
      photoRows: [photoRow(1, { uploaded_by: GUEST_UID }), photoRow(2, { uploaded_by: 'someone-else' })],
    })
    render(<EventAlbumPage params={PARAMS} />)
    await userEvent.click(await screen.findByRole('button', { name: 'SELECT' }))
    await userEvent.click(screen.getByRole('button', { name: /select all/i }))
    await userEvent.click(screen.getByRole('button', { name: /delete selected photos/i }))
    await userEvent.click(screen.getByRole('button', { name: /yes, delete/i }))
    // Only 1 of the 2 selected photos was the viewer's own, so only 1 was
    // ever attempted -- the other is excluded, not counted as a failure.
    await waitFor(() => expect(screen.getByText('1 photo deleted')).toBeInTheDocument())
  })
})
