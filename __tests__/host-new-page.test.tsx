import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import HostNewPage from '@/app/(host)/host/new/page'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

jest.mock('@/lib/supabase/client')
jest.mock('next/navigation', () => ({ useRouter: jest.fn() }))
jest.mock('@/components/sofra-v2/ImageCropDialog', () => ({ ImageCropDialog: ({ file, onConfirm }: { file: File; onConfirm: (file: File) => void }) => <button type="button" onClick={() => onConfirm(file)}>USE THIS CROP</button> }))
jest.mock('framer-motion', () => ({
  motion: new Proxy({}, { get: (_target, tag) => tag }),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  MotionConfig: ({ children }: { children: React.ReactNode }) => children,
}))

const mockPush = jest.fn()
beforeEach(() => {
  jest.clearAllMocks()
  ;(useRouter as jest.Mock).mockReturnValue({ push: mockPush })
  global.URL.createObjectURL = jest.fn(() => 'mock-object-url')
  localStorage.clear()
  localStorage.setItem('sofra_user_id', 'uid-1')
})

function makeSupabase() {
  const upload = jest.fn().mockResolvedValue({ error: null })
  const getPublicUrl = jest.fn().mockReturnValue({ data: { publicUrl: 'https://cdn.example.com/photo.jpg' } })
  const single = jest.fn().mockResolvedValue({ data: { id: 'new-event-id' }, error: null })
  const insert = jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ single }) })
  const updateEq = jest.fn().mockResolvedValue({ error: null })
  const update = jest.fn().mockReturnValue({ eq: updateEq })
  const upsert = jest.fn().mockResolvedValue({ error: null })
  const sb = { storage: { from: jest.fn().mockReturnValue({ upload, getPublicUrl }) }, from: jest.fn().mockReturnValue({ insert, update, upsert }), upload, insert, update, updateEq, upsert }
  ;(createClient as jest.Mock).mockReturnValue(sb)
  return sb
}

// Renders the page and clicks through the new entry-plate intro, landing on
// step 1 of the wizard — the starting point every existing test assumes.
async function renderHostForm() {
  const utils = render(<HostNewPage />)
  const plateLayoutId = screen.getByRole('button', { name: /start hosting a sofra/i }).querySelector('[layoutid]')?.getAttribute('layoutid')
  await userEvent.click(await screen.findByRole('button', { name: /start hosting a sofra/i }))
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Create a Sofra' })).toBeInTheDocument(), { timeout: 1000 })
  const shellLayoutId = document.querySelector('main[layoutid]')?.getAttribute('layoutid')
  expect(shellLayoutId).toBe(plateLayoutId)
  expect(shellLayoutId).toBeTruthy()
  return utils
}

async function fillDetails() {
  await userEvent.type(screen.getByRole('textbox', { name: /event name/i }), 'Test Dinner')
  fireEvent.change(screen.getByTestId('date-input'), { target: { value: '2026-08-01T19:00' } })
  await userEvent.type(screen.getByRole('combobox', { name: /location/i }), 'The Garden Room')
}

async function goToQuestions() {
  await fillDetails()
  await userEvent.click(screen.getByRole('button', { name: 'CONTINUE' }))
  await userEvent.click(screen.getByRole('button', { name: 'CONTINUE' }))
}

async function goToKitchen() {
  await goToQuestions()
  await userEvent.click(screen.getByRole('button', { name: 'CONTINUE' }))
}

it('shows the entry plate first, not the wizard', () => {
  makeSupabase(); render(<HostNewPage />)
  expect(screen.getByRole('button', { name: /start hosting a sofra/i })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Create a Sofra' })).not.toBeInTheDocument()
})

it('starts with details and a four-step progress indicator', async () => {
  makeSupabase(); await renderHostForm()
  expect(screen.getByRole('heading', { name: 'Create a Sofra' })).toBeInTheDocument()
  expect(screen.getByText('STEP 1 OF 4')).toBeInTheDocument()
  expect(screen.getByText('Details')).toBeInTheDocument()
  expect(screen.queryByText('Choose a cover image')).not.toBeInTheDocument()
})

it('validates required details before advancing', async () => {
  const sb = makeSupabase(); await renderHostForm()
  await userEvent.click(screen.getByRole('button', { name: 'CONTINUE' }))
  expect(screen.getByRole('alert')).toHaveTextContent(/add an event name, date and time, and location/i)
  expect(sb.insert).not.toHaveBeenCalled()
})

it('moves through details and cover without losing entered values', async () => {
  makeSupabase(); await renderHostForm(); await fillDetails()
  await userEvent.click(screen.getByRole('button', { name: 'CONTINUE' }))
  expect(screen.getByText('STEP 2 OF 4')).toBeInTheDocument()
  expect(screen.getByText('Choose a cover image')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'BACK' }))
  expect(screen.getByRole('textbox', { name: /event name/i })).toHaveValue('Test Dinner')
})

it('offers defaults with a preview, customization, and no questions', async () => {
  makeSupabase(); await renderHostForm(); await goToQuestions()
  expect(screen.getByText('STEP 3 OF 4')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /use sofra's default questions/i })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByText('ANY LANE TO STAY IN?')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /customize the questions/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /don't include questions/i })).toBeInTheDocument()
})

it('publishes with defaults and follows the selected kitchen path', async () => {
  const sb = makeSupabase(); await renderHostForm(); await goToKitchen()
  await userEvent.click(screen.getByRole('button', { name: 'FILL IN LATER' }))
  await userEvent.click(screen.getByRole('button', { name: 'CREATE MY SOFRA' }))
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/events/new-event-id'))
  expect(sb.insert).toHaveBeenCalledWith(expect.objectContaining({ title: 'Test Dinner', kitchen_plan: 'later', is_published: true }))
  expect(sb.upsert).not.toHaveBeenCalled()
})

it('has no kitchen plan pre-selected and blocks submission until one is chosen', async () => {
  const sb = makeSupabase(); await renderHostForm(); await goToKitchen()
  for (const label of ['FILL IN LATER', 'FILL KITCHEN NOW', 'SEND TO A CHEF']) {
    expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'false')
  }
  expect(screen.getByRole('button', { name: 'CREATE MY SOFRA' })).toBeDisabled()
  await userEvent.click(screen.getByRole('button', { name: 'FILL KITCHEN NOW' }))
  expect(screen.getByRole('button', { name: 'CREATE MY SOFRA' })).toBeEnabled()
  expect(sb.insert).not.toHaveBeenCalled()
})

it('opens the restaurant-or-home kitchen choice after filling the kitchen now', async () => {
  const sb = makeSupabase(); await renderHostForm(); await goToKitchen()
  await userEvent.click(screen.getByRole('button', { name: 'FILL KITCHEN NOW' }))
  await userEvent.click(screen.getByRole('button', { name: 'CREATE MY SOFRA' }))
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/events/new-event-id/kitchen-setup'))
  expect(sb.insert).toHaveBeenCalledWith(expect.objectContaining({ kitchen_plan: 'now' }))
})

it('a stray Enter keypress advances one step instead of skipping straight to submission', async () => {
  const sb = makeSupabase(); await renderHostForm(); await fillDetails()
  fireEvent.submit(screen.getByRole('textbox', { name: /event name/i }).closest('form')!)
  expect(screen.getByText('STEP 2 OF 4')).toBeInTheDocument()
  expect(sb.insert).not.toHaveBeenCalled()
  expect(mockPush).not.toHaveBeenCalled()
})

it('allows the location to remain undecided', async () => {
  const sb = makeSupabase(); await renderHostForm()
  await userEvent.type(screen.getByRole('textbox', { name: /event name/i }), 'Open Location Dinner')
  fireEvent.change(screen.getByTestId('date-input'), { target: { value: '2026-08-01T19:00' } })
  await userEvent.click(screen.getByRole('checkbox', { name: /location undecided/i }))
  await userEvent.click(screen.getByRole('button', { name: 'CONTINUE' }))
  await userEvent.click(screen.getByRole('button', { name: 'CONTINUE' }))
  await userEvent.click(screen.getByRole('button', { name: 'CONTINUE' }))
  await userEvent.click(screen.getByRole('button', { name: 'FILL KITCHEN NOW' }))
  await userEvent.click(screen.getByRole('button', { name: 'CREATE MY SOFRA' }))
  await waitFor(() => expect(sb.insert).toHaveBeenCalledWith(expect.objectContaining({ venue: null, address: null })))
})

it('stores an intentionally empty questionnaire when no questions is selected', async () => {
  const sb = makeSupabase(); await renderHostForm(); await goToQuestions()
  await userEvent.click(screen.getByRole('button', { name: /don't include questions/i }))
  await userEvent.click(screen.getByRole('button', { name: 'CONTINUE' }))
  await userEvent.click(screen.getByRole('button', { name: 'FILL KITCHEN NOW' }))
  await userEvent.click(screen.getByRole('button', { name: 'CREATE MY SOFRA' }))
  await waitFor(() => expect(sb.upsert).toHaveBeenCalledWith(expect.objectContaining({ event_id: 'new-event-id', config: { questions: [] } }), { onConflict: 'event_id' }))
})

it('opens the full editor after creation when customization is selected', async () => {
  makeSupabase(); await renderHostForm(); await goToQuestions()
  await userEvent.click(screen.getByRole('button', { name: /customize the questions/i }))
  await userEvent.click(screen.getByRole('button', { name: 'CONTINUE' }))
  await userEvent.click(screen.getByRole('button', { name: 'FILL KITCHEN NOW' }))
  await userEvent.click(screen.getByRole('button', { name: 'CREATE MY SOFRA' }))
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/host/new-event-id/questionnaire?onboarding=1&kitchenPlan=now'))
})

it('uploads a cropped cover only when one was selected', async () => {
  const sb = makeSupabase(); await renderHostForm(); await fillDetails()
  await userEvent.click(screen.getByRole('button', { name: 'CONTINUE' }))
  const file = new File(['img'], 'cover.jpg', { type: 'image/jpeg' })
  await userEvent.upload(screen.getByLabelText(/choose cover image/i), file)
  await userEvent.click(screen.getByRole('button', { name: /use this crop/i }))
  await userEvent.click(screen.getByRole('button', { name: 'CONTINUE' }))
  await userEvent.click(screen.getByRole('button', { name: 'CONTINUE' }))
  await userEvent.click(screen.getByRole('button', { name: 'FILL KITCHEN NOW' }))
  await userEvent.click(screen.getByRole('button', { name: 'CREATE MY SOFRA' }))
  await waitFor(() => expect(sb.upload).toHaveBeenCalled())
  expect(sb.insert).toHaveBeenCalledWith(expect.objectContaining({ cover_url: 'https://cdn.example.com/photo.jpg' }))
})

it('redirects to login without a local identity', async () => {
  localStorage.clear(); makeSupabase(); render(<HostNewPage />)
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/login'))
})
