import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import HostQuestionnairePage from '@/app/(host)/host/[id]/questionnaire/page'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

jest.mock('@/lib/supabase/client')
jest.mock('next/navigation', () => ({ useRouter: jest.fn() }))

const mockPush = jest.fn()
const mockReplace = jest.fn()
const HOST_UID = 'uid-host'
const PARAMS = { id: 'event-1' }

const SAMPLE_EVENT = { host_id: HOST_UID, title: 'Casa Mekawi' }

function makeSupabase({
  event = SAMPLE_EVENT as typeof SAMPLE_EVENT | null,
  fetchError = null as { message: string } | null,
  existingConfig = null as Record<string, unknown> | null,
  upsertError = null as { message: string } | null,
  deleteError = null as { message: string } | null,
} = {}) {
  const upsert = jest.fn().mockResolvedValue({ error: upsertError })
  const deleteEq = jest.fn().mockResolvedValue({ error: deleteError })
  const del = jest.fn().mockReturnValue({ eq: deleteEq })

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
      // event_questionnaires
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({
              data: existingConfig ? { config: existingConfig } : null,
              error: null,
            }),
          }),
        }),
        upsert,
        delete: del,
      }
    }),
    upsert, delete: del, deleteEq,
  }
  ;(createClient as jest.Mock).mockReturnValue(sb)
  return sb
}

beforeEach(() => {
  jest.clearAllMocks()
  localStorage.clear()
  localStorage.setItem('sofra_user_id', HOST_UID)
  ;(useRouter as jest.Mock).mockReturnValue({ push: mockPush, replace: mockReplace })
})

it('redirects to /login when no local identity is set', async () => {
  localStorage.clear()
  makeSupabase()
  render(<HostQuestionnairePage params={PARAMS} />)
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/login'))
})

it('redirects a non-host viewer back to the event page', async () => {
  localStorage.setItem('sofra_user_id', 'someone-else')
  makeSupabase()
  render(<HostQuestionnairePage params={PARAMS} />)
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/events/event-1'))
})

it('starts in EDIT mode showing all five canonical questions by their Sofra defaults', async () => {
  makeSupabase()
  render(<HostQuestionnairePage params={PARAMS} />)
  await waitFor(() => expect(screen.getByRole('tab', { name: 'EDIT' })).toHaveAttribute('aria-selected', 'true'))
  for (const title of [
    'ANY LANE TO STAY IN?',
    'ANYTHING YOU AVOID?',
    'WHAT SOUNDS BEST TONIGHT?',
    'FLAVOURS YOU LEAN TOWARDS',
    'HOW BRAVE IS YOUR PALATE?',
  ]) {
    expect(screen.getByPlaceholderText(title)).toBeInTheDocument()
  }
})

it('switches to PREVIEW and shows the live guest-facing form', async () => {
  makeSupabase()
  render(<HostQuestionnairePage params={PARAMS} />)
  await waitFor(() => screen.getByRole('tab', { name: 'PREVIEW' }))
  await userEvent.click(screen.getByRole('tab', { name: 'PREVIEW' }))
  expect(screen.getByText('ANY LANE TO STAY IN?')).toBeInTheDocument()
  expect(screen.getByRole('checkbox', { name: 'Vegetarian' })).toBeInTheDocument()
  expect(screen.getByText('This is a live preview with nothing here saved.')).toBeInTheDocument()
})

it('editing a canonical question title and saving persists the override, keyed by canonical question id', async () => {
  const sb = makeSupabase()
  render(<HostQuestionnairePage params={PARAMS} />)
  await waitFor(() => screen.getByPlaceholderText('ANY LANE TO STAY IN?'))

  await userEvent.type(screen.getByPlaceholderText('ANY LANE TO STAY IN?'), 'KEEP IT DAIRY-FREE?')
  await userEvent.click(screen.getByRole('button', { name: 'SAVE QUESTIONNAIRE' }))

  await waitFor(() => expect(sb.upsert).toHaveBeenCalled())
  const [payload] = sb.upsert.mock.calls[0]
  const dietaryQuestion = payload.config.questions.find((q: { id: string }) => q.id === 'dietary')
  expect(dietaryQuestion.title).toBe('KEEP IT DAIRY-FREE?')
  expect(dietaryQuestion.canonicalKey).toBe('dietary')
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/host/event-1/edit'))
})

it('adding a custom single-choice question with two options saves correctly', async () => {
  const sb = makeSupabase()
  render(<HostQuestionnairePage params={PARAMS} />)
  await waitFor(() => screen.getByText('+ ADD QUESTION'))

  await userEvent.click(screen.getByRole('button', { name: 'Single choice' }))
  await userEvent.type(screen.getByPlaceholderText('Ask your guests something…'), 'How adventurous should tonight feel?')
  await userEvent.type(screen.getByPlaceholderText('Option 1'), 'Very adventurous')
  await userEvent.click(screen.getByRole('button', { name: '+ ADD OPTION' }))
  await userEvent.type(screen.getByPlaceholderText('Option 2'), 'Keep it familiar')

  await userEvent.click(screen.getByRole('button', { name: 'SAVE QUESTIONNAIRE' }))

  await waitFor(() => expect(sb.upsert).toHaveBeenCalled())
  const [payload] = sb.upsert.mock.calls[0]
  const custom = payload.config.questions.find((q: { kind: string }) => q.kind === 'custom')
  expect(custom.title).toBe('How adventurous should tonight feel?')
  expect(custom.type).toBe('single')
  expect(custom.options.map((o: { label: string }) => o.label)).toEqual(['Very adventurous', 'Keep it familiar'])
})

it('blocks save and shows an error for a custom question with a blank option', async () => {
  const sb = makeSupabase()
  render(<HostQuestionnairePage params={PARAMS} />)
  await waitFor(() => screen.getByText('+ ADD QUESTION'))

  await userEvent.click(screen.getByRole('button', { name: 'Single choice' }))
  await userEvent.type(screen.getByPlaceholderText('Ask your guests something…'), 'Pick one')
  await userEvent.click(screen.getByRole('button', { name: 'SAVE QUESTIONNAIRE' }))

  expect(await screen.findByRole('alert')).toHaveTextContent(/blank answer option/i)
  expect(sb.upsert).not.toHaveBeenCalled()
})

it('cannot remove a canonical question -- there is no remove control for it', async () => {
  makeSupabase()
  render(<HostQuestionnairePage params={PARAMS} />)
  await waitFor(() => screen.getByPlaceholderText('ANY LANE TO STAY IN?'))
  expect(screen.queryAllByRole('button', { name: 'REMOVE' })).toHaveLength(0)
})

it('removing a custom question drops it from the saved config', async () => {
  const sb = makeSupabase()
  render(<HostQuestionnairePage params={PARAMS} />)
  await waitFor(() => screen.getByText('+ ADD QUESTION'))

  await userEvent.click(screen.getByRole('button', { name: 'Short text' }))
  await userEvent.type(screen.getByPlaceholderText('Ask your guests something…'), 'Craving anything?')
  await userEvent.click(screen.getByRole('button', { name: 'REMOVE' }))
  await userEvent.click(screen.getByRole('button', { name: 'SAVE QUESTIONNAIRE' }))

  await waitFor(() => expect(sb.upsert).toHaveBeenCalled())
  const [payload] = sb.upsert.mock.calls[0]
  expect(payload.config.questions.filter((q: { kind: string }) => q.kind === 'custom')).toHaveLength(0)
})

it('reset to defaults asks for confirmation, then deletes the row and restores defaults', async () => {
  const sb = makeSupabase({
    existingConfig: {
      questions: [
        { id: 'dietary', kind: 'canonical', canonicalKey: 'dietary', order: 0, title: 'CUSTOM TITLE' },
        { id: 'avoid', kind: 'canonical', canonicalKey: 'avoid', order: 1 },
        { id: 'protein', kind: 'canonical', canonicalKey: 'protein', order: 2 },
        { id: 'flavor', kind: 'canonical', canonicalKey: 'flavor', order: 3 },
        { id: 'adventurousness', kind: 'canonical', canonicalKey: 'adventurousness', order: 4 },
      ],
    },
  })
  const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true)
  render(<HostQuestionnairePage params={PARAMS} />)
  await waitFor(() => screen.getByDisplayValue('CUSTOM TITLE'))

  await userEvent.click(screen.getByRole('button', { name: 'RESET TO SOFRA DEFAULTS' }))

  expect(confirmSpy).toHaveBeenCalled()
  await waitFor(() => expect(sb.deleteEq).toHaveBeenCalledWith('event_id', 'event-1'))
  await waitFor(() => expect(screen.queryByDisplayValue('CUSTOM TITLE')).not.toBeInTheDocument())
  expect(screen.getByPlaceholderText('ANY LANE TO STAY IN?')).toHaveValue('')
  confirmSpy.mockRestore()
})

it('shows an actual slider preview/editor for the canonical adventurousness question, not multiple choice', async () => {
  makeSupabase()
  render(<HostQuestionnairePage params={PARAMS} />)
  await waitFor(() => screen.getByPlaceholderText('HOW BRAVE IS YOUR PALATE?'))
  expect(screen.getByLabelText('Slider preview')).toHaveAttribute('type', 'range')
  expect(screen.getByLabelText('Low end')).toBeInTheDocument()
  expect(screen.getByLabelText('High end')).toBeInTheDocument()
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
})

it('editing the canonical slider end labels and saving persists them, keyed to the adventurousness question, values untouched', async () => {
  const sb = makeSupabase()
  render(<HostQuestionnairePage params={PARAMS} />)
  await waitFor(() => screen.getByLabelText('Low end'))

  await userEvent.type(screen.getByLabelText('Low end'), 'KEEP IT FAMILIAR')
  await userEvent.type(screen.getByLabelText('High end'), 'SURPRISE ME')
  await userEvent.click(screen.getByRole('button', { name: 'SAVE QUESTIONNAIRE' }))

  await waitFor(() => expect(sb.upsert).toHaveBeenCalled())
  const [payload] = sb.upsert.mock.calls[0]
  const adventurousness = payload.config.questions.find((q: { id: string }) => q.id === 'adventurousness')
  expect(adventurousness.sliderMinLabel).toBe('KEEP IT FAMILIAR')
  expect(adventurousness.sliderMaxLabel).toBe('SURPRISE ME')
  expect(adventurousness.canonicalKey).toBe('adventurousness')
})

it('adding a custom Slider question with labels and steps saves correctly', async () => {
  const sb = makeSupabase()
  render(<HostQuestionnairePage params={PARAMS} />)
  await waitFor(() => screen.getByText('+ ADD QUESTION'))

  await userEvent.click(screen.getByRole('button', { name: 'Slider' }))
  await userEvent.type(screen.getByPlaceholderText('Ask your guests something…'), 'How adventurous should tonight feel?')
  await userEvent.type(screen.getByLabelText('Low end label'), 'Keep it familiar')
  await userEvent.type(screen.getByLabelText('High end label'), 'Surprise me')
  await userEvent.click(screen.getByRole('button', { name: 'SAVE QUESTIONNAIRE' }))

  await waitFor(() => expect(sb.upsert).toHaveBeenCalled())
  const [payload] = sb.upsert.mock.calls[0]
  const custom = payload.config.questions.find((q: { kind: string }) => q.kind === 'custom')
  expect(custom.type).toBe('slider')
  expect(custom.sliderMinLabel).toBe('Keep it familiar')
  expect(custom.sliderMaxLabel).toBe('Surprise me')
  expect(custom.sliderSteps).toBe(5)
})

it('blocks save when a custom slider is missing an end label', async () => {
  const sb = makeSupabase()
  render(<HostQuestionnairePage params={PARAMS} />)
  await waitFor(() => screen.getByText('+ ADD QUESTION'))

  await userEvent.click(screen.getByRole('button', { name: 'Slider' }))
  await userEvent.type(screen.getByPlaceholderText('Ask your guests something…'), 'Pick a spot')
  await userEvent.type(screen.getByLabelText('Low end label'), 'Low')
  await userEvent.click(screen.getByRole('button', { name: 'SAVE QUESTIONNAIRE' }))

  expect(await screen.findByRole('alert')).toHaveTextContent(/high end/i)
  expect(sb.upsert).not.toHaveBeenCalled()
})

it('does nothing when the reset confirmation is declined', async () => {
  const sb = makeSupabase({
    existingConfig: {
      questions: [
        { id: 'dietary', kind: 'canonical', canonicalKey: 'dietary', order: 0, title: 'CUSTOM TITLE' },
        { id: 'avoid', kind: 'canonical', canonicalKey: 'avoid', order: 1 },
        { id: 'protein', kind: 'canonical', canonicalKey: 'protein', order: 2 },
        { id: 'flavor', kind: 'canonical', canonicalKey: 'flavor', order: 3 },
        { id: 'adventurousness', kind: 'canonical', canonicalKey: 'adventurousness', order: 4 },
      ],
    },
  })
  const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false)
  render(<HostQuestionnairePage params={PARAMS} />)
  await waitFor(() => screen.getByDisplayValue('CUSTOM TITLE'))
  await userEvent.click(screen.getByRole('button', { name: 'RESET TO SOFRA DEFAULTS' }))
  expect(sb.delete).not.toHaveBeenCalled()
  expect(screen.getByDisplayValue('CUSTOM TITLE')).toBeInTheDocument()
  confirmSpy.mockRestore()
})
