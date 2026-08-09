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
  updateError = null as { message: string } | null,
} = {}) {
  const upload       = jest.fn().mockResolvedValue({ error: uploadError })
  const getPublicUrl = jest.fn().mockReturnValue({ data: { publicUrl: 'https://cdn.example.com/photo.jpg' } })
  const single       = jest.fn().mockResolvedValue({ data: { id: insertedId }, error: insertError })
  const select       = jest.fn().mockReturnValue({ single })
  const insert       = jest.fn().mockReturnValue({ select })
  const updateEq     = jest.fn().mockResolvedValue({ error: updateError })
  const update        = jest.fn().mockReturnValue({ eq: updateEq })

  const sb = {
    storage: { from: jest.fn().mockReturnValue({ upload, getPublicUrl }) },
    from:    jest.fn().mockReturnValue({ insert, update }),
    upload, getPublicUrl, insert, select, single, update, updateEq,
  }
  ;(createClient as jest.Mock).mockReturnValue(sb)
  return sb
}

it('renders without crashing', () => {
  makeSupabase()
  render(<HostNewPage />)
  expect(document.body).toBeTruthy()
})

it('renders the create-a-sofra heading', () => {
  makeSupabase()
  render(<HostNewPage />)
  expect(screen.getByRole('heading', { name: 'Create a Sofra' })).toBeInTheDocument()
})

it('redirects to /login when sofra_user_id is absent', async () => {
  localStorage.clear()
  makeSupabase()
  render(<HostNewPage />)
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/login'))
})

describe('cover image', () => {
  it('shows the empty drop zone initially', () => {
    makeSupabase()
    render(<HostNewPage />)
    expect(screen.getByText('Choose a cover image')).toBeInTheDocument()
  })

  it('shows a preview with REPLACE/REMOVE after a file is picked', async () => {
    makeSupabase()
    render(<HostNewPage />)
    const file  = new File(['img'], 'photo.jpg', { type: 'image/jpeg' })
    const input = screen.getByLabelText(/choose cover image/i)
    await userEvent.upload(input, file)
    expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument()
    expect(screen.queryByText('Choose a cover image')).not.toBeInTheDocument()
  })

  it('calls URL.createObjectURL with the picked file', async () => {
    makeSupabase()
    render(<HostNewPage />)
    const file  = new File(['img'], 'photo.jpg', { type: 'image/jpeg' })
    const input = screen.getByLabelText(/choose cover image/i)
    await userEvent.upload(input, file)
    expect(global.URL.createObjectURL).toHaveBeenCalledWith(file)
  })

  it('REMOVE clears the preview back to the empty drop zone', async () => {
    makeSupabase()
    render(<HostNewPage />)
    const file  = new File(['img'], 'photo.jpg', { type: 'image/jpeg' })
    await userEvent.upload(screen.getByLabelText(/choose cover image/i), file)
    await userEvent.click(screen.getByRole('button', { name: /remove/i }))
    expect(screen.getByText('Choose a cover image')).toBeInTheDocument()
  })
})

describe('theme swatches', () => {
  it('renders all five theme options', () => {
    makeSupabase()
    render(<HostNewPage />)
    for (const name of ['Ember', 'Olive', 'Midnight', 'Saffron', 'Plum']) {
      expect(screen.getByRole('radio', { name })).toBeInTheDocument()
    }
  })

  it('Ember is pre-selected on first render', () => {
    makeSupabase()
    render(<HostNewPage />)
    expect(screen.getByRole('radio', { name: 'Ember' })).toBeChecked()
  })

  it('clicking Olive selects it and deselects Ember', async () => {
    makeSupabase()
    render(<HostNewPage />)
    await userEvent.click(screen.getByRole('radio', { name: 'Olive' }))
    expect(screen.getByRole('radio', { name: 'Olive' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Ember' })).not.toBeChecked()
  })
})

describe('form fields', () => {
  it('renders title, tagline, location, and dress code text inputs', () => {
    makeSupabase()
    render(<HostNewPage />)
    expect(screen.getByRole('textbox', { name: /event name/i })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /tagline/i })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /location/i })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /dress code/i })).toBeInTheDocument()
  })

  it('renders the date & time input', () => {
    makeSupabase()
    render(<HostNewPage />)
    expect(screen.getByTestId('date-input')).toBeInTheDocument()
  })

  it('Publish invite is always enabled and validates on submit instead', async () => {
    makeSupabase()
    render(<HostNewPage />)
    expect(screen.getByRole('button', { name: /publish invite/i })).not.toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: /publish invite/i }))
    expect(
      screen.getByText(/add an event name, date and time, and location/i)
    ).toBeInTheDocument()
  })
})

// Helper: fill required fields so submission proceeds past validation
async function fillRequired() {
  await userEvent.type(screen.getByRole('textbox', { name: /event name/i }), 'Test Dinner')
  fireEvent.change(screen.getByTestId('date-input'), { target: { value: '2026-08-01T19:00' } })
  await userEvent.type(screen.getByRole('combobox', { name: /location/i }), 'The Garden Room')
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
    const file = new File(['img'], 'photo.jpg', { type: 'image/jpeg' })
    await userEvent.upload(screen.getByLabelText(/choose cover image/i), file)
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
    const file = new File(['img'], 'photo.jpg', { type: 'image/jpeg' })
    await userEvent.upload(screen.getByLabelText(/choose cover image/i), file)
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
    await userEvent.type(screen.getByRole('textbox', { name: /event name/i }), 'Test Dinner')
    await userEvent.type(screen.getByRole('textbox', { name: /tagline/i }), 'A cozy evening')
    fireEvent.change(screen.getByTestId('date-input'), { target: { value: '2026-08-01T19:00' } })
    await userEvent.type(screen.getByRole('combobox', { name: /location/i }), 'The Garden Room')
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
    const file = new File(['img'], 'photo.jpg', { type: 'image/jpeg' })
    await userEvent.upload(screen.getByLabelText(/choose cover image/i), file)
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
        dress_code: null,
      })
    )
  })
})

describe('CUSTOMIZE GUEST QUESTIONS', () => {
  it('validates required fields before creating a draft', async () => {
    const sb = makeSupabase()
    render(<HostNewPage />)
    await userEvent.click(screen.getByRole('button', { name: /customize guest questions/i }))
    expect(
      screen.getByText(/add an event name, date and time, and location/i)
    ).toBeInTheDocument()
    expect(sb.insert).not.toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('creates a draft event and navigates to the questionnaire editor', async () => {
    const sb = makeSupabase()
    render(<HostNewPage />)
    await fillRequired()
    await userEvent.click(screen.getByRole('button', { name: /customize guest questions/i }))
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/host/new-event-id/questionnaire'))
    expect(sb.insert).toHaveBeenCalledTimes(1)
  })

  it('publishing after an earlier customize click updates the draft instead of inserting a duplicate', async () => {
    const sb = makeSupabase()
    render(<HostNewPage />)
    await fillRequired()
    await userEvent.click(screen.getByRole('button', { name: /customize guest questions/i }))
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/host/new-event-id/questionnaire'))

    mockPush.mockClear()
    await userEvent.click(screen.getByRole('button', { name: /publish invite/i }))
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/events/new-event-id'))

    expect(sb.insert).toHaveBeenCalledTimes(1)
    expect(sb.update).toHaveBeenCalledTimes(1)
    expect(sb.updateEq).toHaveBeenCalledWith('id', 'new-event-id')
  })
})
