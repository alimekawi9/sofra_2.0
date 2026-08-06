import { render, screen, waitFor } from '@testing-library/react'
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
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue({ success: true, nextPath: '/events/event-1' }),
  }) as jest.Mock
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

  it('skeleton contains no buttons', async () => {
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
    // 'Vegetarian' and 'Pescatarian' appear only in dietary; 'Vegan' also unique.
    // getAllByRole to tolerate the intentional label overlap with the new
    // PROTEIN_ANCHOR chips (Vegetarian appears in both).
    for (const chip of ['Vegetarian','Vegan','No pork/alcohol','Kosher','Gluten-free','No dairy','Pescatarian']) {
      expect(screen.getAllByRole('button', { name: chip }).length).toBeGreaterThan(0)
    }
  })

  it('renders all avoid chips', async () => {
    await navigateToStep2()
    // 'Pork' overlaps with PROTEIN_ANCHOR; use getAllByRole.
    for (const chip of ['Nuts','Shellfish','Pork','Eggs','Cilantro','Mushrooms']) {
      expect(screen.getAllByRole('button', { name: chip }).length).toBeGreaterThan(0)
    }
  })

  it('renders all protein anchor chips', async () => {
    await navigateToStep2()
    // 'Vegetarian' overlaps DIETARY and 'Pork' overlaps NOGOS; getAllByRole
    // tolerates the collision.
    for (const chip of ['Beef','Chicken','Fish','Pork','Lamb','Vegetarian','No preference']) {
      expect(screen.getAllByRole('button', { name: chip }).length).toBeGreaterThan(0)
    }
  })

  it('renders all flavor preference chips', async () => {
    await navigateToStep2()
    for (const chip of ['Fresh','Acidic','Rich','Creamy','Spicy','Smoky','Umami','Crispy','Soft','Grilled','Fried','Raw']) {
      expect(screen.getByRole('button', { name: chip })).toBeInTheDocument()
    }
  })

  it('protein anchor is single-select: choosing one deselects the other', async () => {
    await navigateToStep2()
    await userEvent.click(screen.getByRole('button', { name: 'Fish' }))
    expect(screen.getByRole('button', { name: 'Fish' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Chicken' }))
    expect(screen.getByRole('button', { name: 'Chicken' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Fish' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('flavor preference is multi-select up to 3', async () => {
    await navigateToStep2()
    await userEvent.click(screen.getByRole('button', { name: 'Fresh' }))
    await userEvent.click(screen.getByRole('button', { name: 'Rich' }))
    await userEvent.click(screen.getByRole('button', { name: 'Spicy' }))
    expect(screen.getByRole('button', { name: 'Fresh' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Rich' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Spicy' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('tapping a 4th flavor does not select it and shows a "pick up to 3" hint', async () => {
    await navigateToStep2()
    await userEvent.click(screen.getByRole('button', { name: 'Fresh' }))
    await userEvent.click(screen.getByRole('button', { name: 'Rich' }))
    await userEvent.click(screen.getByRole('button', { name: 'Spicy' }))
    await userEvent.click(screen.getByRole('button', { name: 'Smoky' }))
    expect(screen.getByRole('button', { name: 'Smoky' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByTestId('flavor-hint')).toBeInTheDocument()
  })

  it('deselecting a flavor and selecting a 4th works normally', async () => {
    await navigateToStep2()
    await userEvent.click(screen.getByRole('button', { name: 'Fresh' }))
    await userEvent.click(screen.getByRole('button', { name: 'Rich' }))
    await userEvent.click(screen.getByRole('button', { name: 'Spicy' }))
    await userEvent.click(screen.getByRole('button', { name: 'Fresh' })) // deselect
    await userEvent.click(screen.getByRole('button', { name: 'Smoky' }))
    expect(screen.getByRole('button', { name: 'Fresh' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Rich' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Spicy' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Smoky' })).toHaveAttribute('aria-pressed', 'true')
  })

  // Dietary 'Vegetarian' is the first-rendered chip with that name (DIETARY
  // section renders before PROTEIN_ANCHOR). Grabbing index 0 targets the
  // dietary chip; index 1 would be the protein-anchor chip.
  const getDietVegetarian = () => screen.getAllByRole('button', { name: 'Vegetarian' })[0]

  it('toggles a dietary chip on', async () => {
    await navigateToStep2()
    await userEvent.click(getDietVegetarian())
    expect(getDietVegetarian()).toHaveAttribute('aria-pressed', 'true')
  })

  it('toggles a dietary chip off again', async () => {
    await navigateToStep2()
    await userEvent.click(getDietVegetarian())
    await userEvent.click(getDietVegetarian())
    expect(getDietVegetarian()).toHaveAttribute('aria-pressed', 'false')
  })

  it('chips are multi-select: selecting one does not deselect another', async () => {
    await navigateToStep2()
    await userEvent.click(getDietVegetarian())
    await userEvent.click(screen.getByRole('button', { name: 'Vegan' }))
    expect(getDietVegetarian()).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Vegan' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('avoid chips are independent of dietary chips', async () => {
    await navigateToStep2()
    await userEvent.click(screen.getByRole('button', { name: 'Nuts' }))
    expect(getDietVegetarian()).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('adventurousness slider', () => {
  async function goToStep2WithAdventurousness(value: number) {
    makeSupabase({
      profileRow: { user_id: 'uid-1', dietary: [], avoid: [], protein_anchor: null, flavor_preference: [], adventurousness: value },
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
      expect(screen.getByText(/could not update your rsvp/i)).toBeInTheDocument()
    )
    expect(mockPush).not.toHaveBeenCalled()
  })
})

describe('going/maybe submit', () => {
  it('submits the production field names and navigates only after confirmed persistence', async () => {
    makeSupabase()
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /going/i }))
    await userEvent.click(screen.getByRole('button', { name: /going/i }))
    await userEvent.click(screen.getByRole('button', { name: /continue/i }))
    await userEvent.click(screen.getByRole('button', { name: /rsvp/i }))
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/events/event-1'))
    expect(fetch).toHaveBeenCalledWith('/api/rsvp/submit', expect.objectContaining({
      method: 'POST',
      cache: 'no-store',
      body: JSON.stringify({
        eventId: 'event-1', userId: 'uid-1', status: 'going', dietary: [], avoid: [],
        proteinAnchor: null, flavorPreference: [], adventurousness: 50,
      }),
    }))
  })

  it('includes protein_anchor and flavor_preference in the taste_profiles upsert', async () => {
    makeSupabase()
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /going/i }))
    await userEvent.click(screen.getByRole('button', { name: /going/i }))
    await userEvent.click(screen.getByRole('button', { name: /continue/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Fish' }))
    await userEvent.click(screen.getByRole('button', { name: 'Fresh' }))
    await userEvent.click(screen.getByRole('button', { name: /rsvp/i }))
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/events/event-1'))
    const request = (fetch as jest.Mock).mock.calls[0][1]
    expect(JSON.parse(request.body)).toEqual(expect.objectContaining({
      proteinAnchor: 'Fish', flavorPreference: ['Fresh'],
    }))
  })

  it('shows a friendly stage-specific error and does not navigate on persistence failure', async () => {
    makeSupabase()
    ;(fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
      json: jest.fn().mockResolvedValue({
        success: false, stage: 'saving_preferences', code: '42703',
        message: 'Could not save your preferences.',
      }),
    })
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /going/i }))
    await userEvent.click(screen.getByRole('button', { name: /going/i }))
    await userEvent.click(screen.getByRole('button', { name: /continue/i }))
    await userEvent.click(screen.getByRole('button', { name: /rsvp/i }))
    await waitFor(() =>
      expect(screen.getByText(/could not save your preferences/i)).toBeInTheDocument()
    )
    expect(screen.getByTestId('submission-error')).toHaveAttribute('data-code', '42703')
    expect(screen.getByTestId('submission-error')).toHaveAttribute('data-stage', 'saving_preferences')
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('allows retry after a failed submission', async () => {
    makeSupabase()
    ;(fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ success: false, code: 'DB_ERROR', message: 'Could not save your preferences.' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: true, nextPath: '/events/event-1' }) })
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /going/i }))
    await userEvent.click(screen.getByRole('button', { name: /going/i }))
    await userEvent.click(screen.getByRole('button', { name: /continue/i }))
    await userEvent.click(screen.getByRole('button', { name: /rsvp/i }))
    await waitFor(() => screen.getByText(/could not save/i))
    await userEvent.click(screen.getByRole('button', { name: /rsvp/i }))
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/events/event-1'))
  })

  it('prevents duplicate requests from a double submit', async () => {
    makeSupabase()
    let resolveRequest!: (value: unknown) => void
    ;(fetch as jest.Mock).mockReturnValue(new Promise((resolve) => { resolveRequest = resolve }))
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /going/i }))
    await userEvent.click(screen.getByRole('button', { name: /going/i }))
    await userEvent.click(screen.getByRole('button', { name: /continue/i }))
    const submit = screen.getByRole('button', { name: /rsvp/i })
    submit.click()
    submit.click()
    expect(fetch).toHaveBeenCalledTimes(1)
    resolveRequest({ ok: true, status: 200, json: async () => ({ success: true, nextPath: '/events/event-1' }) })
    await waitFor(() => expect(mockReplace).toHaveBeenCalled())
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
        protein_anchor: 'Fish', flavor_preference: ['Fresh', 'Rich'],
        adventurousness: 75,
      },
    })
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /going/i }))
    await userEvent.click(screen.getByRole('button', { name: /going/i }))
    await userEvent.click(screen.getByRole('button', { name: /continue/i }))
    expect(screen.getByRole('button', { name: 'Vegan' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Nuts' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Fish' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Fresh' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Rich' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows "Pulled from your profile" badge when a taste_profiles row exists', async () => {
    makeSupabase({
      profileRow: { user_id: 'uid-1', dietary: [], avoid: [], protein_anchor: null, flavor_preference: [], adventurousness: 50 },
    })
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /going/i }))
    await userEvent.click(screen.getByRole('button', { name: /going/i }))
    await userEvent.click(screen.getByRole('button', { name: /continue/i }))
    expect(screen.getByTestId('prefilled-badge')).toBeInTheDocument()
  })

  it('badge persists after the user edits a chip', async () => {
    makeSupabase({
      profileRow: { user_id: 'uid-1', dietary: ['Vegan'], avoid: [], protein_anchor: null, flavor_preference: [], adventurousness: 50 },
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
