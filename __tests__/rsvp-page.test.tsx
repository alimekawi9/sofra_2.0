import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RSVPPage from '@/app/(guest)/events/[id]/rsvp/page'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

jest.mock('@/lib/supabase/client')
jest.mock('next/navigation', () => ({ useRouter: jest.fn() }))

const mockPush = jest.fn()
const mockReplace = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  ;(useRouter as jest.Mock).mockReturnValue({ push: mockPush, replace: mockReplace })
  mockPush.mockReset()
  mockReplace.mockReset()
  localStorage.clear()
  localStorage.setItem('sofra_user_id', 'uid-1')
})

// Shared mock factory — call at the start of each test that needs Supabase
function makeSupabase({
  rsvpRow = null as { status: string } | null,
  profileRow = null as Record<string, unknown> | null,
  fetchError = null as { message: string } | null,
  upsertError = null as { message: string } | null,
} = {}) {
  const rsvpUpsert    = jest.fn().mockResolvedValue({ error: upsertError })
  const profileUpsert = jest.fn().mockResolvedValue({ error: upsertError })

  const sb = {
    from: jest.fn((table: string) => {
      if (table === 'rsvps') return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({ data: rsvpRow, error: fetchError }),
            }),
          }),
        }),
        upsert: rsvpUpsert,
      }
      // taste_profiles
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({ data: profileRow, error: fetchError }),
          }),
        }),
        upsert: profileUpsert,
      }
    }),
    rsvpUpsert,
    profileUpsert,
  }
  ;(createClient as jest.Mock).mockReturnValue(sb)
  return sb
}

it('renders without crashing', () => {
  makeSupabase()
  render(<RSVPPage params={{ id: 'event-1' }} />)
  expect(document.body).toBeTruthy()
})

it('redirects a missing local identity before querying RSVP data', async () => {
  localStorage.clear()
  const sb = makeSupabase()
  render(<RSVPPage params={{ id: 'event-1' }} />)
  await waitFor(() =>
    expect(mockPush).toHaveBeenCalledWith('/login?next=%2Fevents%2Fevent-1%2Frsvp')
  )
  expect(sb.from).not.toHaveBeenCalled()
})

describe('loading state', () => {
  it('shows skeleton while fetching', async () => {
    makeSupabase()
    render(<RSVPPage params={{ id: 'event-1' }} />)
    expect(screen.getByTestId('skeleton')).toBeInTheDocument()
    await waitFor(() => screen.queryByTestId('skeleton'))
  })

  it('skeleton contains no status buttons', async () => {
    makeSupabase()
    render(<RSVPPage params={{ id: 'event-1' }} />)
    // The back button is always visible, so we only check for content buttons
    expect(screen.queryByRole('button', { name: /going/i })).not.toBeInTheDocument()
    await waitFor(() => screen.queryByTestId('skeleton'))
  })

  it('skeleton disappears after fetch completes', async () => {
    makeSupabase()
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() =>
      expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument()
    )
  })
})

describe('fetch error state', () => {
  it('shows error message on fetch failure', async () => {
    makeSupabase({ fetchError: { message: 'db error' } })
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() =>
      expect(screen.getByText(/couldn't load/i)).toBeInTheDocument()
    )
  })

  it('shows a Retry button on fetch failure', async () => {
    makeSupabase({ fetchError: { message: 'db error' } })
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
    )
  })

  it('clicking Retry re-runs loadData and clears the error', async () => {
    // Each query independently fails on first call, succeeds on retry
    let rsvpAttempts = 0
    let profileAttempts = 0
    ;(createClient as jest.Mock).mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'rsvps') return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                maybeSingle: jest.fn().mockImplementation(() => {
                  rsvpAttempts++
                  return rsvpAttempts === 1
                    ? Promise.resolve({ data: null, error: { message: 'fail' } })
                    : Promise.resolve({ data: null, error: null })
                }),
              }),
            }),
          }),
          upsert: jest.fn().mockResolvedValue({ error: null }),
        }
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockImplementation(() => {
                profileAttempts++
                return profileAttempts === 1
                  ? Promise.resolve({ data: null, error: { message: 'fail' } })
                  : Promise.resolve({ data: null, error: null })
              }),
            }),
          }),
          upsert: jest.fn().mockResolvedValue({ error: null }),
        }
      }),
    })

    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /retry/i }))
    await userEvent.click(screen.getByRole('button', { name: /retry/i }))
    await waitFor(() =>
      expect(screen.queryByText(/couldn't load/i)).not.toBeInTheDocument()
    )
    expect(screen.getByTestId('rsvp-content')).toBeInTheDocument()
  })
})

describe('Step 1 — status selection', () => {
  it('renders three status cards after loading', async () => {
    makeSupabase()
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /going/i }))
    expect(screen.getByRole('button', { name: /going/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /maybe/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /can't make it/i })).toBeInTheDocument()
  })

  it('step indicator reads "Step 1" before any selection', async () => {
    makeSupabase()
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /going/i }))
    expect(screen.getByText('Step 1')).toBeInTheDocument()
    expect(screen.queryByText('Step 1 of 2')).not.toBeInTheDocument()
  })

  it('step indicator upgrades to "Step 1 of 2" when going is selected', async () => {
    makeSupabase()
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /going/i }))
    await userEvent.click(screen.getByRole('button', { name: /going/i }))
    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument()
  })

  it('step indicator stays "Step 1" when cant is selected', async () => {
    makeSupabase()
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /can't make it/i }))
    await userEvent.click(screen.getByRole('button', { name: /can't make it/i }))
    expect(screen.queryByText('Step 1 of 2')).not.toBeInTheDocument()
    expect(screen.getByText('Step 1')).toBeInTheDocument()
  })

  it('primary button reads "Continue →" when going is selected', async () => {
    makeSupabase()
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /going/i }))
    await userEvent.click(screen.getByRole('button', { name: /going/i }))
    expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument()
  })

  it('primary button reads "Submit" when cant is selected', async () => {
    makeSupabase()
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /can't make it/i }))
    await userEvent.click(screen.getByRole('button', { name: /can't make it/i }))
    expect(screen.getByRole('button', { name: /^submit$/i })).toBeInTheDocument()
  })

  it('button label updates when selection changes from going to cant', async () => {
    makeSupabase()
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /going/i }))
    await userEvent.click(screen.getByRole('button', { name: /going/i }))
    expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /can't make it/i }))
    expect(screen.getByRole('button', { name: /^submit$/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /continue/i })).not.toBeInTheDocument()
  })

  it('clicking Continue advances to Step 2', async () => {
    makeSupabase()
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /going/i }))
    await userEvent.click(screen.getByRole('button', { name: /going/i }))
    await userEvent.click(screen.getByRole('button', { name: /continue/i }))
    expect(screen.getByText('Step 2 of 2')).toBeInTheDocument()
  })
})

// Helper: renders the page, waits for Step 1, selects going, advances to Step 2
async function navigateToStep2() {
  makeSupabase()
  render(<RSVPPage params={{ id: 'event-1' }} />)
  await waitFor(() => screen.getByRole('button', { name: /going/i }))
  await userEvent.click(screen.getByRole('button', { name: /going/i }))
  await userEvent.click(screen.getByRole('button', { name: /continue/i }))
}

describe('Step 2 — chip groups', () => {
  it('renders all dietary chips', async () => {
    await navigateToStep2()
    for (const chip of ['Vegetarian','Vegan','No pork/alcohol','Kosher','Gluten-free','No dairy','Pescatarian']) {
      expect(screen.getByRole('button', { name: chip })).toBeInTheDocument()
    }
  })

  it('renders all avoid chips', async () => {
    await navigateToStep2()
    for (const chip of ['Nuts','Shellfish','Pork','Eggs','Cilantro','Mushrooms']) {
      expect(screen.getAllByRole('button', { name: chip }).length).toBeGreaterThan(0)
    }
  })

  it('renders all flavor chips', async () => {
    await navigateToStep2()
    for (const chip of ['Umami','Spicy','Plain & clean','Saucy','Smoky','Bright & sour','Sweet-savoury','Herby']) {
      expect(screen.getByRole('button', { name: chip })).toBeInTheDocument()
    }
  })

  it('renders the natural protein question and permits two specifics but blocks a third', async () => {
    await navigateToStep2()
    expect(screen.getByText('What sounds best tonight?')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Chicken' }))
    await userEvent.click(screen.getByRole('button', { name: 'Fish' }))
    await userEvent.click(screen.getAllByRole('button', { name: 'Shellfish' })[1])
    expect(screen.getByRole('button', { name: 'Chicken' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Fish' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByRole('button', { name: 'Shellfish' })[1]).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByTestId('protein-hint')).toBeInTheDocument()
  })

  it('no preference clears specifics and a specific choice clears no preference', async () => {
    await navigateToStep2()
    await userEvent.click(screen.getByRole('button', { name: 'Chicken' }))
    await userEvent.click(screen.getByRole('button', { name: 'No preference — surprise me' }))
    expect(screen.getByRole('button', { name: 'Chicken' })).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(screen.getByRole('button', { name: 'Fish' }))
    expect(screen.getByRole('button', { name: 'No preference — surprise me' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Fish' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('flavor chips are multi-select with no cap', async () => {
    await navigateToStep2()
    for (const chip of ['Umami','Spicy','Plain & clean','Saucy','Smoky']) {
      await userEvent.click(screen.getByRole('button', { name: chip }))
    }
    for (const chip of ['Umami','Spicy','Plain & clean','Saucy','Smoky']) {
      expect(screen.getByRole('button', { name: chip })).toHaveAttribute('aria-pressed', 'true')
    }
  })

  it('toggles a dietary chip on', async () => {
    await navigateToStep2()
    await userEvent.click(screen.getByRole('button', { name: 'Vegetarian' }))
    expect(screen.getByRole('button', { name: 'Vegetarian' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('toggles a dietary chip off again', async () => {
    await navigateToStep2()
    await userEvent.click(screen.getByRole('button', { name: 'Vegetarian' }))
    await userEvent.click(screen.getByRole('button', { name: 'Vegetarian' }))
    expect(screen.getByRole('button', { name: 'Vegetarian' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('chips are multi-select: selecting one does not deselect another', async () => {
    await navigateToStep2()
    await userEvent.click(screen.getByRole('button', { name: 'Vegetarian' }))
    await userEvent.click(screen.getByRole('button', { name: 'Vegan' }))
    expect(screen.getByRole('button', { name: 'Vegetarian' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Vegan' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('avoid chips are independent of dietary chips', async () => {
    await navigateToStep2()
    await userEvent.click(screen.getByRole('button', { name: 'Nuts' }))
    expect(screen.getByRole('button', { name: 'Vegetarian' })).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('adventurousness slider', () => {
  async function goToStep2WithAdventurousness(value: number) {
    makeSupabase({
      profileRow: { user_id: 'uid-1', dietary: [], avoid: [], flavor_preference: [], adventurousness: value },
    })
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /going/i }))
    await userEvent.click(screen.getByRole('button', { name: /going/i }))
    await userEvent.click(screen.getByRole('button', { name: /continue/i }))
  }

  it('shows "Keep it familiar" for adventurousness 0', async () => {
    await goToStep2WithAdventurousness(0)
    expect(screen.getByText('Keep it familiar')).toBeInTheDocument()
  })

  it('shows "Open to a nudge" for adventurousness 40', async () => {
    await goToStep2WithAdventurousness(40)
    expect(screen.getByText('Open to a nudge')).toBeInTheDocument()
  })

  it('shows "Feed me something new" for adventurousness 70', async () => {
    await goToStep2WithAdventurousness(70)
    expect(screen.getByText('Feed me something new')).toBeInTheDocument()
  })

  it('shows "Chef, surprise me" for adventurousness 82', async () => {
    await goToStep2WithAdventurousness(82)
    expect(screen.getByText('Chef, surprise me')).toBeInTheDocument()
  })

  it('renders the slider input', async () => {
    await navigateToStep2()
    expect(screen.getByRole('slider', { name: /adventurousness/i })).toBeInTheDocument()
  })

  it('slider defaults to 50 when no profile row', async () => {
    await navigateToStep2()
    const slider = screen.getByRole('slider', { name: /adventurousness/i })
    expect(slider).toHaveValue('50')
  })
})

describe('cant submit', () => {
  it('upserts rsvps with status cant and redirects', async () => {
    const sb = makeSupabase()
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /can't make it/i }))
    await userEvent.click(screen.getByRole('button', { name: /can't make it/i }))
    await userEvent.click(screen.getByRole('button', { name: /^submit$/i }))
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/events/event-1'))
    expect(sb.rsvpUpsert).toHaveBeenCalledWith(
      { event_id: 'event-1', user_id: 'uid-1', status: 'cant' },
      { onConflict: 'event_id,user_id' }
    )
  })

  it('shows error and does not redirect on cant upsert failure', async () => {
    makeSupabase({ upsertError: { message: 'db error' } })
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /can't make it/i }))
    await userEvent.click(screen.getByRole('button', { name: /can't make it/i }))
    await userEvent.click(screen.getByRole('button', { name: /^submit$/i }))
    await waitFor(() =>
      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument()
    )
    expect(mockPush).not.toHaveBeenCalled()
  })
})

describe('going/maybe submit', () => {
  it('upserts rsvps and taste_profiles with production field names, then redirects', async () => {
    const sb = makeSupabase()
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /going/i }))
    await userEvent.click(screen.getByRole('button', { name: /going/i }))
    await userEvent.click(screen.getByRole('button', { name: /continue/i }))
    await userEvent.click(screen.getByRole('button', { name: /^rsvp/i }))
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/events/event-1'))
    expect(sb.rsvpUpsert).toHaveBeenCalledWith(
      { event_id: 'event-1', user_id: 'uid-1', status: 'going' },
      { onConflict: 'event_id,user_id' }
    )
    expect(sb.profileUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'uid-1',
        dietary: [],
        avoid: [],
        protein_preferences: [],
        flavor_preference: [],
        adventurousness: 50,
        updated_at: expect.any(String),
      }),
      { onConflict: 'user_id' }
    )
  })

  it('sends selected flavors as flavor_preference in the taste_profiles upsert', async () => {
    const sb = makeSupabase()
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /going/i }))
    await userEvent.click(screen.getByRole('button', { name: /going/i }))
    await userEvent.click(screen.getByRole('button', { name: /continue/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Umami' }))
    await userEvent.click(screen.getByRole('button', { name: 'Smoky' }))
    await userEvent.click(screen.getByRole('button', { name: /^rsvp/i }))
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/events/event-1'))
    expect(sb.profileUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        flavor_preference: ['Umami', 'Smoky'],
      }),
      { onConflict: 'user_id' }
    )
  })

  it('persists selected protein preferences as unchanged raw values', async () => {
    const sb = makeSupabase()
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /going/i }))
    await userEvent.click(screen.getByRole('button', { name: /going/i }))
    await userEvent.click(screen.getByRole('button', { name: /continue/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Beef or lamb' }))
    await userEvent.click(screen.getByRole('button', { name: 'Grains or pasta' }))
    await userEvent.click(screen.getByRole('button', { name: /^rsvp/i }))
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/events/event-1'))
    expect(sb.profileUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ protein_preferences: ['beef_lamb', 'grain_pasta'] }),
      { onConflict: 'user_id' }
    )
  })

  it('submits the latest protein click even before React commits a rerender', async () => {
    const sb = makeSupabase()
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /going/i }))
    await userEvent.click(screen.getByRole('button', { name: /going/i }))
    await userEvent.click(screen.getByRole('button', { name: /continue/i }))

    act(() => {
      screen.getByRole('button', { name: 'Fish' }).click()
      screen.getByRole('button', { name: /^rsvp/i }).click()
    })

    await waitFor(() => expect(sb.profileUpsert).toHaveBeenCalled())
    expect(sb.profileUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ protein_preferences: ['fish'] }),
      { onConflict: 'user_id' }
    )
  })

  it('shows error and does not redirect on profile upsert failure', async () => {
    makeSupabase({ upsertError: { message: 'db error' } })
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /going/i }))
    await userEvent.click(screen.getByRole('button', { name: /going/i }))
    await userEvent.click(screen.getByRole('button', { name: /continue/i }))
    await userEvent.click(screen.getByRole('button', { name: /^rsvp/i }))
    await waitFor(() =>
      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument()
    )
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('submit button reads "Update RSVP →" when hasExistingRsvp is true', async () => {
    makeSupabase({ rsvpRow: { status: 'going' } })
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /going/i }))
    await userEvent.click(screen.getByRole('button', { name: /continue/i }))
    expect(screen.getByRole('button', { name: /update rsvp/i })).toBeInTheDocument()
  })
})

describe('prefill from existing data', () => {
  it('prefills status from an existing rsvp row', async () => {
    makeSupabase({ rsvpRow: { status: 'maybe' } })
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /going/i }))
    // 'maybe' prefilled → step indicator upgrades to "Step 1 of 2"
    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument()
  })

  it('prefills chip selections from an existing taste_profiles row', async () => {
    makeSupabase({
      profileRow: {
        user_id: 'uid-1', dietary: ['Vegan'], avoid: ['Nuts'],
        protein_anchor: 'Lamb',
        flavor_preference: ['Umami', 'Smoky'],
        adventurousness: 75,
      },
    })
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /going/i }))
    await userEvent.click(screen.getByRole('button', { name: /going/i }))
    await userEvent.click(screen.getByRole('button', { name: /continue/i }))
    expect(screen.getByRole('button', { name: 'Vegan' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Nuts' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Umami' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Smoky' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Beef or lamb' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('hydrates an existing protein_preferences array without changing raw values', async () => {
    makeSupabase({
      profileRow: {
        user_id: 'uid-1', dietary: [], avoid: [],
        protein_preferences: ['fish', 'grain_pasta'],
        flavor_preference: [], adventurousness: 50,
      },
    })
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /going/i }))
    await userEvent.click(screen.getByRole('button', { name: /going/i }))
    await userEvent.click(screen.getByRole('button', { name: /continue/i }))
    expect(screen.getByRole('button', { name: 'Fish' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Grains or pasta' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows "Pulled from your profile" badge when a taste_profiles row exists', async () => {
    makeSupabase({
      profileRow: { user_id: 'uid-1', dietary: [], avoid: [], flavor_preference: [], adventurousness: 50 },
    })
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /going/i }))
    await userEvent.click(screen.getByRole('button', { name: /going/i }))
    await userEvent.click(screen.getByRole('button', { name: /continue/i }))
    expect(screen.getByTestId('prefilled-badge')).toBeInTheDocument()
  })

  it('badge persists after the user edits a chip', async () => {
    makeSupabase({
      profileRow: { user_id: 'uid-1', dietary: ['Vegan'], avoid: [], flavor_preference: [], adventurousness: 50 },
    })
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /going/i }))
    await userEvent.click(screen.getByRole('button', { name: /going/i }))
    await userEvent.click(screen.getByRole('button', { name: /continue/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Vegan' })) // deselect
    expect(screen.getByTestId('prefilled-badge')).toBeInTheDocument()
  })

  it('does not show badge when no taste_profiles row', async () => {
    await navigateToStep2()
    expect(screen.queryByTestId('prefilled-badge')).not.toBeInTheDocument()
  })
})
