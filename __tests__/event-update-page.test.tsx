import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EventUpdatePage from '@/app/(guest)/events/[id]/update/page'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'

jest.mock('@/lib/supabase/client')
jest.mock('next/navigation', () => ({ useRouter: jest.fn(), useSearchParams: jest.fn() }))

const mockPush = jest.fn()
const mockReplace = jest.fn()
const HOST_UID = 'uid-host'
const COHOST_UID = 'uid-cohost'
const OUTSIDER_UID = 'uid-outsider'

const SAMPLE_EVENT = {
  id: 'ev-1',
  host_id: HOST_UID,
  title: "Layla's Long Table",
  event_date: '2027-08-11T19:00:00.000Z',
  venue: 'Krasi',
  address: '48 Gloucester St, Boston',
}

function makeSupabase({
  event = SAMPLE_EVENT as typeof SAMPLE_EVENT | null,
  isCohost = false,
} = {}) {
  const sb = {
    from: jest.fn((table: string) => {
      if (table === 'events') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: event, error: event ? null : { message: 'not found' } }),
            }),
          }),
        }
      }
      if (table === 'event_cohosts') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                maybeSingle: jest.fn().mockResolvedValue({ data: isCohost ? { user_id: COHOST_UID } : null, error: null }),
              }),
            }),
          }),
        }
      }
      throw new Error(`Unexpected table in test: ${table}`)
    }),
  }
  ;(createClient as jest.Mock).mockReturnValue(sb)
  return sb
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(useRouter as jest.Mock).mockReturnValue({ push: mockPush, replace: mockReplace })
  ;(useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams())
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

describe('EventUpdatePage', () => {
  it('lets the host see the compose screen with the custom template pre-filled with the invite link', async () => {
    makeSupabase()
    localStorage.setItem('sofra_user_id', HOST_UID)
    render(<EventUpdatePage params={PARAMS} />)

    const textarea = await screen.findByRole('textbox')
    expect((textarea as HTMLTextAreaElement).value).toContain('http://localhost/events/ev-1?entry=update&preview=')
  })

  it('lets an accepted co-host see the compose screen', async () => {
    makeSupabase({ isCohost: true })
    localStorage.setItem('sofra_user_id', COHOST_UID)
    render(<EventUpdatePage params={PARAMS} />)

    await screen.findByRole('textbox')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('denies a user who is neither host nor co-host', async () => {
    makeSupabase({ isCohost: false })
    localStorage.setItem('sofra_user_id', OUTSIDER_UID)
    render(<EventUpdatePage params={PARAMS} />)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/host or a co-host/i)
    })
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('fills the textarea with the photos template, including the album link and the invite link', async () => {
    makeSupabase()
    localStorage.setItem('sofra_user_id', HOST_UID)
    render(<EventUpdatePage params={PARAMS} />)

    await screen.findByRole('textbox')
    await userEvent.click(screen.getByRole('button', { name: 'PHOTOS ARE UP' }))

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    expect(textarea.value).toContain('http://localhost/events/ev-1/album')
    expect(textarea.value).toContain('http://localhost/events/ev-1')
  })

  it('preselects the update type chosen from the event-page popup', async () => {
    ;(useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('template=photos'))
    makeSupabase()
    localStorage.setItem('sofra_user_id', HOST_UID)
    render(<EventUpdatePage params={PARAMS} />)

    const textarea = await screen.findByRole('textbox') as HTMLTextAreaElement
    expect(textarea.value).toContain('Photos from')
    expect(textarea.value).toContain('/album?entry=update')
  })

  it('fills the textarea with the details template reflecting the real event date and venue', async () => {
    makeSupabase()
    localStorage.setItem('sofra_user_id', HOST_UID)
    render(<EventUpdatePage params={PARAMS} />)

    await screen.findByRole('textbox')
    await userEvent.click(screen.getByRole('button', { name: 'UPDATE TO DATE/TIME/LOCATION' }))

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    expect(textarea.value).toContain('Krasi — 48 Gloucester St, Boston')
    expect(textarea.value).toContain('http://localhost/events/ev-1')
  })

  it('copies whatever text is currently in the textarea, including hand edits', async () => {
    makeSupabase()
    localStorage.setItem('sofra_user_id', HOST_UID)
    render(<EventUpdatePage params={PARAMS} />)

    const textarea = await screen.findByRole('textbox')
    await userEvent.clear(textarea)
    await userEvent.type(textarea, 'Hand-typed message')
    expect(screen.queryByRole('button', { name: 'COPY MESSAGE' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'SEND UPDATE' }))
    await userEvent.click(screen.getByRole('button', { name: 'COPY MESSAGE' }))

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Hand-typed message')
    })
  })

  it('opens WhatsApp with the current textarea content', async () => {
    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null)
    makeSupabase()
    localStorage.setItem('sofra_user_id', HOST_UID)
    render(<EventUpdatePage params={PARAMS} />)

    const textarea = await screen.findByRole('textbox')
    await userEvent.clear(textarea)
    await userEvent.type(textarea, 'Hand-typed message')
    await userEvent.click(screen.getByRole('button', { name: 'SEND UPDATE' }))
    await userEvent.click(screen.getByRole('button', { name: 'SHARE VIA WHATSAPP' }))

    expect(openSpy).toHaveBeenCalledWith(
      'https://wa.me/?text=' + encodeURIComponent('Hand-typed message'),
      '_blank'
    )
    openSpy.mockRestore()
  })
})
