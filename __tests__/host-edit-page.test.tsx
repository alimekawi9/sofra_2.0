import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import HostEditPage from '@/app/(host)/host/[id]/edit/page'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

jest.mock('@/lib/supabase/client')
jest.mock('next/navigation', () => ({ useRouter: jest.fn() }))
jest.mock('@/components/sofra-v2/ImageCropDialog', () => ({
  ImageCropDialog: ({ file, onConfirm }: { file: File; onConfirm: (file: File) => void }) => (
    <button type="button" onClick={() => onConfirm(file)}>USE THIS CROP</button>
  ),
}))

const mockPush = jest.fn()
const mockReplace = jest.fn()

const SAMPLE_EVENT = {
  host_id: 'uid-1',
  title: 'Test Dinner',
  tagline: 'A cozy evening',
  event_date: '2026-09-01T19:00:00Z',
  venue: 'The Garden Room' as string | null,
  address: '123 Main St' as string | null,
  dress_code: 'Smart casual',
  custom_details: [] as Array<{ id: string; label: string; body: string }>,
  theme: 'olive',
  cover_url: 'https://cdn.example.com/existing.jpg',
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(useRouter as jest.Mock).mockReturnValue({ push: mockPush, replace: mockReplace })
  global.URL.createObjectURL = jest.fn(() => 'mock-object-url')
  localStorage.clear()
  localStorage.setItem('sofra_user_id', 'uid-1')
})

function makeSupabase({
  event = SAMPLE_EVENT as typeof SAMPLE_EVENT | null,
  fetchError = null as { message: string } | null,
  updateError = null as { message: string } | null,
  uploadError = null as { message: string } | null,
  deleteError = null as { message: string } | null,
  questionnaireConfig = null as { header?: string; questions: unknown[] } | null,
  responseRows = [] as Array<{ question_id: string; response: unknown }>,
} = {}) {
  const update = jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: updateError }) })
  const deleteEq = jest.fn().mockResolvedValue({ error: deleteError })
  const del = jest.fn().mockReturnValue({ eq: deleteEq })
  const upload = jest.fn().mockResolvedValue({ error: uploadError })
  const getPublicUrl = jest.fn().mockReturnValue({ data: { publicUrl: 'https://cdn.example.com/new.jpg' } })

  const defaultTable = {
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ data: event, error: fetchError }),
        }),
      }),
      update,
      delete: del,
    }
  const questionnaireTable = {
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        maybeSingle: jest.fn().mockResolvedValue({
          data: questionnaireConfig ? { config: questionnaireConfig } : null,
          error: null,
        }),
      }),
    }),
  }
  const responsesTable = {
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({ data: responseRows, error: null }),
    }),
  }
  const sb = {
    from: jest.fn((table: string) => {
      if (table === 'event_cohosts') {
        return { select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }) }) }) }) }
      }
      if (table === 'event_questionnaires') return questionnaireTable
      if (table === 'event_question_responses') return responsesTable
      return defaultTable
    }),
    storage: { from: jest.fn().mockReturnValue({ upload, getPublicUrl }) },
    update, upload, getPublicUrl, delete: del, deleteEq,
  }
  ;(createClient as jest.Mock).mockReturnValue(sb)
  return sb
}

const PARAMS = { id: 'event-1' }

it('redirects to /login when sofra_user_id is absent', async () => {
  localStorage.clear()
  makeSupabase()
  render(<HostEditPage params={PARAMS} />)
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/login'))
})

it('redirects a non-host viewer back to the event page instead of loading the form', async () => {
  localStorage.setItem('sofra_user_id', 'someone-else')
  makeSupabase()
  render(<HostEditPage params={PARAMS} />)
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/events/event-1'))
  expect(screen.queryByRole('heading', { name: 'Edit your Sofra' })).not.toBeInTheDocument()
})

it('shows edit-mode copy and prefills every field from the existing event', async () => {
  makeSupabase()
  render(<HostEditPage params={PARAMS} />)
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Edit your Sofra' })).toBeInTheDocument())
  expect(screen.getByRole('button', { name: /update invite/i })).toBeInTheDocument()
  expect(screen.getByRole('textbox', { name: /event name/i })).toHaveValue('Test Dinner')
  expect(screen.getByRole('textbox', { name: /tagline/i })).toHaveValue('A cozy evening')
  expect(screen.getByRole('combobox', { name: /location/i })).toHaveValue('The Garden Room')
  expect(screen.getByRole('textbox', { name: /dress code/i })).toHaveValue('Smart casual')
  expect(screen.queryByRole('radio', { name: 'Olive' })).not.toBeInTheDocument()
  expect(screen.getByRole('img', { name: /selected cover preview/i })).toHaveAttribute(
    'src', 'https://cdn.example.com/existing.jpg'
  )
})

it('updates the existing row (not insert) and preserves the original address when location is untouched', async () => {
  const sb = makeSupabase()
  render(<HostEditPage params={PARAMS} />)
  await waitFor(() => screen.getByRole('button', { name: /update invite/i }))
  await userEvent.click(screen.getByRole('button', { name: /update invite/i }))
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/events/event-1'))
  expect(sb.update).toHaveBeenCalledWith(
    expect.objectContaining({
      title: 'Test Dinner',
      venue: 'The Garden Room',
      address: '123 Main St',
      cover_url: 'https://cdn.example.com/existing.jpg',
      theme: 'olive',
    })
  )
})

it('wipes the address when the location text is changed without picking a new place', async () => {
  const sb = makeSupabase()
  render(<HostEditPage params={PARAMS} />)
  await waitFor(() => screen.getByRole('combobox', { name: /location/i }))
  const locationInput = screen.getByRole('combobox', { name: /location/i })
  await userEvent.clear(locationInput)
  await userEvent.type(locationInput, 'A totally different place')
  await userEvent.click(screen.getByRole('button', { name: /update invite/i }))
  await waitFor(() => expect(mockPush).toHaveBeenCalled())
  expect(sb.update).toHaveBeenCalledWith(
    expect.objectContaining({ venue: 'A totally different place', address: null })
  )
})

it('removing the existing photo and saving without picking a new one clears cover_url', async () => {
  const sb = makeSupabase()
  render(<HostEditPage params={PARAMS} />)
  await waitFor(() => screen.getByRole('button', { name: /remove/i }))
  await userEvent.click(screen.getByRole('button', { name: /remove/i }))
  await userEvent.click(screen.getByRole('button', { name: /update invite/i }))
  await waitFor(() => expect(mockPush).toHaveBeenCalled())
  expect(sb.update).toHaveBeenCalledWith(expect.objectContaining({ cover_url: null }))
  expect(sb.upload).not.toHaveBeenCalled()
})

it('picking a new cover photo uploads it and uses the new public URL', async () => {
  const sb = makeSupabase()
  render(<HostEditPage params={PARAMS} />)
  await waitFor(() => screen.getByLabelText(/replace/i))
  const file = new File(['img'], 'new.jpg', { type: 'image/jpeg' })
  await userEvent.upload(screen.getByLabelText(/replace/i), file)
  await userEvent.click(screen.getByRole('button', { name: /use this crop/i }))
  await userEvent.click(screen.getByRole('button', { name: /update invite/i }))
  await waitFor(() => expect(mockPush).toHaveBeenCalled())
  expect(sb.upload).toHaveBeenCalled()
  expect(sb.update).toHaveBeenCalledWith(expect.objectContaining({ cover_url: 'https://cdn.example.com/new.jpg' }))
})

it('shows error and does not redirect when the update fails', async () => {
  makeSupabase({ updateError: { message: 'db error' } })
  render(<HostEditPage params={PARAMS} />)
  await waitFor(() => screen.getByRole('button', { name: /update invite/i }))
  await userEvent.click(screen.getByRole('button', { name: /update invite/i }))
  await waitFor(() => expect(screen.getByText(/something went wrong/i)).toBeInTheDocument())
  expect(mockPush).not.toHaveBeenCalled()
})

it('shows a load error when the event fetch fails', async () => {
  makeSupabase({ fetchError: { message: 'not found' } })
  render(<HostEditPage params={PARAMS} />)
  await waitFor(() => expect(screen.getByText(/couldn't load this event/i)).toBeInTheDocument())
})

describe('DELETE EVENT', () => {
  it('shows the delete button in edit mode', async () => {
    makeSupabase()
    render(<HostEditPage params={PARAMS} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'DELETE EVENT' })).toBeInTheDocument())
  })

  it('does nothing when the confirmation is declined', async () => {
    const sb = makeSupabase()
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false)
    render(<HostEditPage params={PARAMS} />)
    await waitFor(() => screen.getByRole('button', { name: 'DELETE EVENT' }))
    await userEvent.click(screen.getByRole('button', { name: 'DELETE EVENT' }))
    expect(confirmSpy).toHaveBeenCalled()
    expect(sb.delete).not.toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  it('deletes the event and redirects to /events once confirmed', async () => {
    const sb = makeSupabase()
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true)
    render(<HostEditPage params={PARAMS} />)
    await waitFor(() => screen.getByRole('button', { name: 'DELETE EVENT' }))
    await userEvent.click(screen.getByRole('button', { name: 'DELETE EVENT' }))
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/events'))
    expect(sb.delete).toHaveBeenCalled()
    expect(sb.deleteEq).toHaveBeenCalledWith('id', 'event-1')
    confirmSpy.mockRestore()
  })

  it('shows an error and does not redirect when deletion fails', async () => {
    makeSupabase({ deleteError: { message: 'db error' } })
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true)
    render(<HostEditPage params={PARAMS} />)
    await waitFor(() => screen.getByRole('button', { name: 'DELETE EVENT' }))
    await userEvent.click(screen.getByRole('button', { name: 'DELETE EVENT' }))
    await waitFor(() => expect(screen.getByText(/could not delete this event/i)).toBeInTheDocument())
    expect(mockPush).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })
})

it('CUSTOMIZE GUEST QUESTIONS navigates to the questionnaire editor for this event', async () => {
  makeSupabase()
  render(<HostEditPage params={PARAMS} />)
  await waitFor(() => screen.getByRole('button', { name: /customize guest questions/i }))
  await userEvent.click(screen.getByRole('button', { name: /customize guest questions/i }))
  expect(mockPush).toHaveBeenCalledWith('/host/event-1/questionnaire')
})

describe('TBD-field suggestions', () => {
  const DATE_QUESTION = {
    id: 'q_date',
    kind: 'custom',
    type: 'ranking',
    title: 'What day works best?',
    options: [
      { value: 'sat', label: 'August 30, 2026' },
      { value: 'sun', label: 'August 31, 2026' },
    ],
    order: 0,
  }
  const LOCATION_QUESTION = {
    id: 'q_location',
    kind: 'custom',
    type: 'single',
    title: 'Where should we host?',
    options: [
      { value: 'garden', label: 'The Garden Room' },
      { value: 'loft', label: 'The Loft' },
    ],
    order: 1,
  }
  const UNDECIDED_DATE_EVENT = { ...SAMPLE_EVENT, event_date: '9999-12-31T12:00:00.000Z' }
  const NO_LOCATION_EVENT = { ...SAMPLE_EVENT, venue: null, address: null }

  it('shows a date suggestion (as a hint, never a fabricated value) for an undecided date once 3+ rankings favor one option, and its action reveals the native input', async () => {
    const sb = makeSupabase({
      event: UNDECIDED_DATE_EVENT,
      questionnaireConfig: { questions: [DATE_QUESTION] },
      responseRows: [
        { question_id: 'q_date', response: ['sat', 'sun'] },
        { question_id: 'q_date', response: ['sat', 'sun'] },
        { question_id: 'q_date', response: ['sun', 'sat'] },
      ],
    })
    render(<HostEditPage params={PARAMS} />)
    await waitFor(() => expect(screen.getByText(/august 30, 2026/i)).toBeInTheDocument())
    expect(screen.getByTestId('date-input')).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: /set the date to enter it/i }))
    expect(screen.getByTestId('date-input')).not.toBeDisabled()
    expect(sb.from).toHaveBeenCalledWith('event_questionnaires')
  })

  it('does not show a date suggestion below the 3-response floor', async () => {
    makeSupabase({
      event: UNDECIDED_DATE_EVENT,
      questionnaireConfig: { questions: [DATE_QUESTION] },
      responseRows: [
        { question_id: 'q_date', response: ['sat', 'sun'] },
        { question_id: 'q_date', response: ['sat', 'sun'] },
      ],
    })
    render(<HostEditPage params={PARAMS} />)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Edit your Sofra' })).toBeInTheDocument())
    expect(screen.queryByText(/suggested:/i)).not.toBeInTheDocument()
  })

  it('shows a one-click location suggestion for an empty venue/address, and filling it sets the location field', async () => {
    makeSupabase({
      event: NO_LOCATION_EVENT,
      questionnaireConfig: { questions: [LOCATION_QUESTION] },
      responseRows: [
        { question_id: 'q_location', response: 'garden' },
        { question_id: 'q_location', response: 'garden' },
        { question_id: 'q_location', response: 'loft' },
      ],
    })
    render(<HostEditPage params={PARAMS} />)
    await waitFor(() => expect(screen.getByText(/suggested: the garden room/i)).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /use this/i }))
    expect(screen.getByRole('combobox', { name: /location/i })).toHaveValue('The Garden Room')
  })

  it('shows no suggestion at all, and never queries the questionnaire, when the event already has a real date and venue', async () => {
    const sb = makeSupabase({
      questionnaireConfig: { questions: [DATE_QUESTION, LOCATION_QUESTION] },
      responseRows: [
        { question_id: 'q_date', response: ['sat', 'sun'] },
        { question_id: 'q_date', response: ['sat', 'sun'] },
        { question_id: 'q_date', response: ['sat', 'sun'] },
      ],
    })
    render(<HostEditPage params={PARAMS} />)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Edit your Sofra' })).toBeInTheDocument())
    expect(screen.queryByText(/suggested:/i)).not.toBeInTheDocument()
    expect(sb.from).not.toHaveBeenCalledWith('event_questionnaires')
  })
})

describe('custom detail sections', () => {
  const EVENT_WITH_DETAIL = {
    ...SAMPLE_EVENT,
    custom_details: [{ id: 'd_1', label: 'Parking', body: 'Free lot behind the theater' }],
  }

  it('prefills an existing custom detail section on load', async () => {
    makeSupabase({ event: EVENT_WITH_DETAIL })
    render(<HostEditPage params={PARAMS} />)
    await waitFor(() => expect(screen.getByRole('textbox', { name: /section label/i })).toHaveValue('Parking'))
    expect(screen.getByRole('textbox', { name: /details/i })).toHaveValue('Free lot behind the theater')
  })

  it('round-trips an edited section into the update payload', async () => {
    const sb = makeSupabase({ event: EVENT_WITH_DETAIL })
    render(<HostEditPage params={PARAMS} />)
    await waitFor(() => screen.getByRole('textbox', { name: /section label/i }))
    await userEvent.clear(screen.getByRole('textbox', { name: /section label/i }))
    await userEvent.type(screen.getByRole('textbox', { name: /section label/i }), 'Valet')
    await userEvent.click(screen.getByRole('button', { name: /update invite/i }))
    await waitFor(() => expect(mockPush).toHaveBeenCalled())
    expect(sb.update).toHaveBeenCalledWith(
      expect.objectContaining({
        custom_details: [expect.objectContaining({ label: 'Valet', body: 'Free lot behind the theater' })],
      })
    )
  })

  it('adding a new section and saving includes both the existing and new sections', async () => {
    const sb = makeSupabase({ event: EVENT_WITH_DETAIL })
    render(<HostEditPage params={PARAMS} />)
    await waitFor(() => screen.getByRole('button', { name: /add detail section/i }))
    await userEvent.click(screen.getByRole('button', { name: /add detail section/i }))
    const labelInputs = screen.getAllByRole('textbox', { name: /section label/i })
    await userEvent.type(labelInputs[1], 'Gift registry')
    const bodyInputs = screen.getAllByRole('textbox', { name: /details/i })
    await userEvent.type(bodyInputs[1], 'No gifts, just bring an appetite')
    await userEvent.click(screen.getByRole('button', { name: /update invite/i }))
    await waitFor(() => expect(mockPush).toHaveBeenCalled())
    expect(sb.update).toHaveBeenCalledWith(
      expect.objectContaining({
        custom_details: [
          expect.objectContaining({ label: 'Parking' }),
          expect.objectContaining({ label: 'Gift registry', body: 'No gifts, just bring an appetite' }),
        ],
      })
    )
  })
})
