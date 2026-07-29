import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import HostNewPage from '@/app/(host)/host/new/page'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

jest.mock('@/lib/supabase/client')
jest.mock('next/navigation', () => ({ useRouter: jest.fn() }))

const mockPush = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  ;(useRouter as jest.Mock).mockReturnValue({ push: mockPush })
  global.URL.createObjectURL = jest.fn(() => 'mock-object-url')
  localStorage.clear()
  localStorage.setItem('sofra_user_id', 'uid-1')
})

function makeSupabase({
  uploadError = null as { message: string } | null,
  insertError = null as { message: string } | null,
  insertedId  = 'new-event-id',
} = {}) {
  const upload       = jest.fn().mockResolvedValue({ error: uploadError })
  const getPublicUrl = jest.fn().mockReturnValue({ data: { publicUrl: 'https://cdn.example.com/photo.jpg' } })
  const single       = jest.fn().mockResolvedValue({ data: { id: insertedId }, error: insertError })
  const select       = jest.fn().mockReturnValue({ single })
  const insert       = jest.fn().mockReturnValue({ select })

  const sb = {
    storage: { from: jest.fn().mockReturnValue({ upload, getPublicUrl }) },
    from:    jest.fn().mockReturnValue({ insert }),
    upload, getPublicUrl, insert, select, single,
  }
  ;(createClient as jest.Mock).mockReturnValue(sb)
  return sb
}

it('renders without crashing', () => {
  makeSupabase()
  render(<HostNewPage />)
  expect(document.body).toBeTruthy()
})

it('renders the Sofra wordmark', () => {
  makeSupabase()
  render(<HostNewPage />)
  expect(screen.getByRole('heading', { name: 'Sofra' })).toBeInTheDocument()
})

it('renders the back link', () => {
  makeSupabase()
  render(<HostNewPage />)
  expect(screen.getByRole('button', { name: /← Events/i })).toBeInTheDocument()
})

it('redirects to /login when sofra_user_id is absent', async () => {
  localStorage.clear()
  makeSupabase()
  render(<HostNewPage />)
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/login'))
})

describe('cover button', () => {
  it('shows "Upload cover photo" initially', () => {
    makeSupabase()
    render(<HostNewPage />)
    expect(screen.getByText('Upload cover photo')).toBeInTheDocument()
  })

  it('shows "Recommended 1:1" badge initially', () => {
    makeSupabase()
    render(<HostNewPage />)
    expect(screen.getByText('Recommended 1:1')).toBeInTheDocument()
  })

  it('shows "Change photo" badge and hides upload prompt after file is picked', async () => {
    makeSupabase()
    render(<HostNewPage />)
    const file  = new File(['img'], 'photo.jpg', { type: 'image/jpeg' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, file)
    expect(screen.getByText('Change photo')).toBeInTheDocument()
    expect(screen.queryByText('Upload cover photo')).not.toBeInTheDocument()
  })

  it('calls URL.createObjectURL with the picked file', async () => {
    makeSupabase()
    render(<HostNewPage />)
    const file  = new File(['img'], 'photo.jpg', { type: 'image/jpeg' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, file)
    expect(global.URL.createObjectURL).toHaveBeenCalledWith(file)
  })
})

describe('theme swatches', () => {
  it('renders all five theme names', () => {
    makeSupabase()
    render(<HostNewPage />)
    for (const name of ['Ember', 'Olive', 'Midnight', 'Saffron', 'Plum']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
  })

  it('Ember swatch is pre-selected on first render', () => {
    makeSupabase()
    render(<HostNewPage />)
    expect(screen.getByRole('button', { name: 'Ember' })).toHaveAttribute('data-selected', 'true')
  })

  it('clicking Olive makes it selected and deselects Ember', async () => {
    makeSupabase()
    render(<HostNewPage />)
    await userEvent.click(screen.getByRole('button', { name: 'Olive' }))
    expect(screen.getByRole('button', { name: 'Olive' })).toHaveAttribute('data-selected', 'true')
    expect(screen.getByRole('button', { name: 'Ember' })).toHaveAttribute('data-selected', 'false')
  })
})

describe('form fields', () => {
  it('renders title, tagline, venue, and dress code text inputs', () => {
    makeSupabase()
    render(<HostNewPage />)
    expect(screen.getByRole('textbox', { name: /title/i })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /tagline/i })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /venue/i })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /dress code/i })).toBeInTheDocument()
  })

  it('renders the date & time input', () => {
    makeSupabase()
    render(<HostNewPage />)
    expect(screen.getByTestId('date-input')).toBeInTheDocument()
  })

  it('Publish invite button is disabled when title and date are empty', () => {
    makeSupabase()
    render(<HostNewPage />)
    expect(screen.getByRole('button', { name: /publish invite/i })).toBeDisabled()
  })

  it('Publish invite button is disabled when only title is filled', async () => {
    makeSupabase()
    render(<HostNewPage />)
    await userEvent.type(screen.getByRole('textbox', { name: /title/i }), 'Test Dinner')
    expect(screen.getByRole('button', { name: /publish invite/i })).toBeDisabled()
  })

  it('Publish invite button is disabled when only date is filled', () => {
    makeSupabase()
    render(<HostNewPage />)
    fireEvent.change(screen.getByTestId('date-input'), { target: { value: '2026-08-01T19:00' } })
    expect(screen.getByRole('button', { name: /publish invite/i })).toBeDisabled()
  })

  it('Publish invite button is enabled when title and date are both filled', async () => {
    makeSupabase()
    render(<HostNewPage />)
    await userEvent.type(screen.getByRole('textbox', { name: /title/i }), 'Test Dinner')
    fireEvent.change(screen.getByTestId('date-input'), { target: { value: '2026-08-01T19:00' } })
    expect(screen.getByRole('button', { name: /publish invite/i })).not.toBeDisabled()
  })
})

// Helper: fill required fields so the Publish invite button is enabled
async function fillRequired() {
  await userEvent.type(screen.getByRole('textbox', { name: /title/i }), 'Test Dinner')
  fireEvent.change(screen.getByTestId('date-input'), { target: { value: '2026-08-01T19:00' } })
}

describe('submit handler', () => {
  it('does not call storage.upload when no cover file was picked', async () => {
    const sb = makeSupabase()
    render(<HostNewPage />)
    await fillRequired()
    await userEvent.click(screen.getByRole('button', { name: /publish invite/i }))
    await waitFor(() => expect(mockPush).toHaveBeenCalled())
    expect(sb.upload).not.toHaveBeenCalled()
  })

  it('calls storage.upload when a cover file was picked', async () => {
    const sb = makeSupabase()
    render(<HostNewPage />)
    const file  = new File(['img'], 'photo.jpg', { type: 'image/jpeg' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, file)
    await fillRequired()
    await userEvent.click(screen.getByRole('button', { name: /publish invite/i }))
    await waitFor(() => expect(mockPush).toHaveBeenCalled())
    expect(sb.upload).toHaveBeenCalledWith(
      expect.stringMatching(/^uid-1\/.+\.jpg$/),
      file
    )
  })

  it('shows upload error and does not call insert when upload fails', async () => {
    const sb = makeSupabase({ uploadError: { message: 'network error' } })
    render(<HostNewPage />)
    const file  = new File(['img'], 'photo.jpg', { type: 'image/jpeg' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, file)
    await fillRequired()
    await userEvent.click(screen.getByRole('button', { name: /publish invite/i }))
    await waitFor(() =>
      expect(screen.getByText(/photo upload failed/i)).toBeInTheDocument()
    )
    expect(sb.insert).not.toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('inserts event row with correct column values and redirects on success', async () => {
    const sb = makeSupabase()
    render(<HostNewPage />)
    await userEvent.type(screen.getByRole('textbox', { name: /title/i }), 'Test Dinner')
    await userEvent.type(screen.getByRole('textbox', { name: /tagline/i }), 'A cozy evening')
    fireEvent.change(screen.getByTestId('date-input'), { target: { value: '2026-08-01T19:00' } })
    await userEvent.type(screen.getByRole('textbox', { name: /venue/i }), 'The Garden Room')
    await userEvent.type(screen.getByRole('textbox', { name: /dress code/i }), 'Smart casual')
    await userEvent.click(screen.getByRole('button', { name: /publish invite/i }))
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/events/new-event-id'))
    expect(sb.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        host_id:    'uid-1',
        title:      'Test Dinner',
        tagline:    'A cozy evening',
        event_date: new Date('2026-08-01T19:00').toISOString(),
        venue:      'The Garden Room',
        dress_code: 'Smart casual',
        theme:      'ember',
        cover_url:  null,
      })
    )
  })

  it('shows insert error and does not redirect when insert fails', async () => {
    makeSupabase({ insertError: { message: 'db error' } })
    render(<HostNewPage />)
    await fillRequired()
    await userEvent.click(screen.getByRole('button', { name: /publish invite/i }))
    await waitFor(() =>
      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument()
    )
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('uses the storage public URL as cover_url when a cover is uploaded', async () => {
    const sb = makeSupabase()
    render(<HostNewPage />)
    const file  = new File(['img'], 'photo.jpg', { type: 'image/jpeg' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, file)
    await fillRequired()
    await userEvent.click(screen.getByRole('button', { name: /publish invite/i }))
    await waitFor(() => expect(mockPush).toHaveBeenCalled())
    expect(sb.insert).toHaveBeenCalledWith(
      expect.objectContaining({ cover_url: 'https://cdn.example.com/photo.jpg' })
    )
  })

  it('empty optional fields are inserted as null not empty string', async () => {
    const sb = makeSupabase()
    render(<HostNewPage />)
    await fillRequired()
    await userEvent.click(screen.getByRole('button', { name: /publish invite/i }))
    await waitFor(() => expect(mockPush).toHaveBeenCalled())
    expect(sb.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tagline:    null,
        venue:      null,
        dress_code: null,
      })
    )
  })
})
