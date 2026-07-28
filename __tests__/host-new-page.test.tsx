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
})

function makeSupabase({
  user        = { id: 'uid-1' } as { id: string } | null,
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
    auth:    { getUser: jest.fn().mockResolvedValue({ data: { user } }) },
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

it('redirects to /login when user is null', async () => {
  makeSupabase({ user: null })
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
