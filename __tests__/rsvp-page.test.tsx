import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RSVPPage from '@/app/(guest)/events/[id]/rsvp/page'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

jest.mock('@/lib/supabase/client')
jest.mock('next/navigation', () => ({ useRouter: jest.fn() }))

const mockPush = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  ;(useRouter as jest.Mock).mockReturnValue({ push: mockPush })
  mockPush.mockReset()
})

// Shared mock factory — call at the start of each test that needs Supabase
function makeSupabase({
  user = { id: 'uid-1' } as { id: string } | null,
  rsvpRow = null as { status: string } | null,
  profileRow = null as Record<string, unknown> | null,
  fetchError = null as { message: string } | null,
  upsertError = null as { message: string } | null,
} = {}) {
  const rsvpUpsert    = jest.fn().mockResolvedValue({ error: upsertError })
  const profileUpsert = jest.fn().mockResolvedValue({ error: upsertError })

  const sb = {
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user } }),
    },
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

describe('loading state', () => {
  it('shows skeleton while fetching', async () => {
    makeSupabase()
    render(<RSVPPage params={{ id: 'event-1' }} />)
    expect(screen.getByTestId('skeleton')).toBeInTheDocument()
    await waitFor(() => screen.queryByTestId('skeleton'))
  })

  it('skeleton contains no buttons', async () => {
    makeSupabase()
    render(<RSVPPage params={{ id: 'event-1' }} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
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
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'uid-1' } } }) },
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
    for (const chip of ['Vegetarian','Vegan','Halal','Kosher','Gluten-free','No dairy','Pescatarian']) {
      expect(screen.getByRole('button', { name: chip })).toBeInTheDocument()
    }
  })

  it('renders all avoid chips', async () => {
    await navigateToStep2()
    for (const chip of ['Nuts','Shellfish','Pork','Eggs','Cilantro','Mushrooms']) {
      expect(screen.getByRole('button', { name: chip })).toBeInTheDocument()
    }
  })

  it('renders all drinks chips', async () => {
    await navigateToStep2()
    for (const chip of ['Cocktails','Wine','Beer','Alcohol-free']) {
      expect(screen.getByRole('button', { name: chip })).toBeInTheDocument()
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
      profileRow: { user_id: 'uid-1', dietary: [], avoid: [], drinks: [], adventurousness: value },
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
  it('upserts both rsvps and taste_profiles and redirects', async () => {
    const sb = makeSupabase()
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /going/i }))
    await userEvent.click(screen.getByRole('button', { name: /going/i }))
    await userEvent.click(screen.getByRole('button', { name: /continue/i }))
    await userEvent.click(screen.getByRole('button', { name: /rsvp/i }))
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/events/event-1'))
    expect(sb.rsvpUpsert).toHaveBeenCalledWith(
      { event_id: 'event-1', user_id: 'uid-1', status: 'going' },
      { onConflict: 'event_id,user_id' }
    )
    expect(sb.profileUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'uid-1', dietary: [], avoid: [], drinks: [], adventurousness: 50,
      }),
      { onConflict: 'user_id' }
    )
  })

  it('shows error and does not redirect when either upsert fails', async () => {
    makeSupabase({ upsertError: { message: 'db error' } })
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /going/i }))
    await userEvent.click(screen.getByRole('button', { name: /going/i }))
    await userEvent.click(screen.getByRole('button', { name: /continue/i }))
    await userEvent.click(screen.getByRole('button', { name: /rsvp/i }))
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
        user_id: 'uid-1', dietary: ['Vegan'], avoid: ['Nuts'], drinks: ['Wine'], adventurousness: 75,
      },
    })
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /going/i }))
    await userEvent.click(screen.getByRole('button', { name: /going/i }))
    await userEvent.click(screen.getByRole('button', { name: /continue/i }))
    expect(screen.getByRole('button', { name: 'Vegan' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Nuts' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Wine' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows "Pulled from your profile" badge when a taste_profiles row exists', async () => {
    makeSupabase({
      profileRow: { user_id: 'uid-1', dietary: [], avoid: [], drinks: [], adventurousness: 50 },
    })
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /going/i }))
    await userEvent.click(screen.getByRole('button', { name: /going/i }))
    await userEvent.click(screen.getByRole('button', { name: /continue/i }))
    expect(screen.getByTestId('prefilled-badge')).toBeInTheDocument()
  })

  it('badge persists after the user edits a chip', async () => {
    makeSupabase({
      profileRow: { user_id: 'uid-1', dietary: ['Vegan'], avoid: [], drinks: [], adventurousness: 50 },
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
