import { render, screen, waitFor } from '@testing-library/react'
import TablePage from '@/app/(chef)/events/[id]/table/page'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

jest.mock('@/lib/supabase/client')
jest.mock('next/navigation', () => ({ useRouter: jest.fn() }))

const mockPush    = jest.fn()
const mockReplace = jest.fn()
const HOST_UID    = 'uid-host'
const GUEST_UID   = 'uid-guest'

const SAMPLE_EVENT = {
  id: 'ev-1',
  host_id: HOST_UID,
  title: 'Test Dinner',
  event_date: '2026-09-01T19:00:00Z',
}

type RsvpRow    = { user_id: string; users: { name: string } | null }
type ProfileRow = {
  user_id: string
  dietary: string[]
  avoid: string[]
  protein_anchor: string | null
  protein_preferences?: string[]
  flavor_preference: string[]
  adventurousness: number
}

function makeSupabase({
  event      = SAMPLE_EVENT as typeof SAMPLE_EVENT | null,
  rsvps      = [] as RsvpRow[],
  profiles   = [] as ProfileRow[],
  fetchError = null as { message: string } | null,
} = {}) {
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
      if (table === 'rsvps') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              in: jest.fn().mockResolvedValue({ data: rsvps, error: null }),
            }),
          }),
        }
      }
      if (table === 'event_cohosts') {
        return { select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }) }) }) }) }
      }
      if (table === 'taste_profiles') {
        return {
          select: jest.fn().mockReturnValue({
            in: jest.fn().mockResolvedValue({ data: profiles, error: null }),
          }),
        }
      }
      if (table === 'menus') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }
      }
      // signatures, pantry_items, menu_courses — return empty lists so the
      // Table page loads without a menu-related failure. Tests that need a
      // populated menu can wire it in explicitly.
      const emptyList = { data: [], error: null }
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockImplementation(() => ({
            eq: jest.fn().mockResolvedValue(emptyList),
            order: jest.fn().mockResolvedValue(emptyList),
            then: (resolve: (v: typeof emptyList) => void) => resolve(emptyList),
          })),
        }),
      }
    }),
  }
  ;(createClient as jest.Mock).mockReturnValue(sb)
  return sb
}

const PARAMS = { id: 'ev-1' }

beforeEach(() => {
  jest.clearAllMocks()
  ;(useRouter as jest.Mock).mockReturnValue({ push: mockPush, replace: mockReplace })
  mockPush.mockReset()
  mockReplace.mockReset()
  localStorage.clear()
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      overview: 'The room is balanced.',
      recommendations: [
        { title: 'Set the tone', action: 'Keep the evening relaxed.', reason: 'Guest preferences support it.' },
        { title: 'Confirm details', action: 'Send one concise update.', reason: 'It keeps everyone aligned.' },
      ],
    }),
  } as Response)
})

// ─── Auth & access ───────────────────────────────────────────────────────────

describe('auth & access guards', () => {
  it('redirects to /login when no sofra_user_id in localStorage', async () => {
    makeSupabase()
    render(<TablePage params={PARAMS} />)
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/login'))
  })

  it('redirects to /events/[id] when current user is not the host', async () => {
    localStorage.setItem('sofra_user_id', GUEST_UID)
    makeSupabase()
    render(<TablePage params={PARAMS} />)
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/events/ev-1'))
  })

  it('does not redirect when current user is the host', async () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    makeSupabase()
    render(<TablePage params={PARAMS} />)
    await waitFor(() => expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument())
    expect(mockPush).not.toHaveBeenCalled()
    expect(mockReplace).not.toHaveBeenCalled()
  })
})

// ─── Loading state ───────────────────────────────────────────────────────────

describe('loading state', () => {
  it('shows skeleton while fetching', () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    makeSupabase()
    render(<TablePage params={PARAMS} />)
    expect(screen.getByTestId('skeleton')).toBeInTheDocument()
  })

  it('skeleton disappears after data loads', async () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    makeSupabase()
    render(<TablePage params={PARAMS} />)
    await waitFor(() =>
      expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument()
    )
  })
})

// ─── Hard Limits ─────────────────────────────────────────────────────────────

describe('Hard Limits card', () => {
  it('renders "Hard Limits" heading after load', async () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    makeSupabase()
    render(<TablePage params={PARAMS} />)
    // "non-negotiable" only appears in the heading, not in the empty-state text
    await waitFor(() =>
      expect(screen.getByText(/non-negotiable/i)).toBeInTheDocument()
    )
  })

  it('shows allergy limit with guest name when a guest has avoids', async () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    makeSupabase({
      rsvps:    [{ user_id: GUEST_UID, users: { name: 'Alice' } }],
      profiles: [{ user_id: GUEST_UID, dietary: [], avoid: ['Nuts'], protein_anchor: null, flavor_preference: [], adventurousness: 50 }],
    })
    render(<TablePage params={PARAMS} />)
    // Exact-string match: the limit label renders as "Nuts", brief renders "nuts" (lowercase)
    await waitFor(() => expect(screen.getByText('Nuts')).toBeInTheDocument())
    expect(screen.getByText('Alice')).toBeInTheDocument()
  })

  it('shows diet limit with guest name when a guest has a strict diet', async () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    makeSupabase({
      rsvps:    [{ user_id: GUEST_UID, users: { name: 'Bob' } }],
      profiles: [{ user_id: GUEST_UID, dietary: ['Vegan'], avoid: [], protein_anchor: null, flavor_preference: [], adventurousness: 50 }],
    })
    render(<TablePage params={PARAMS} />)
    // The recorded value appears in both Hard Limits and Diet Mix.
    await waitFor(() => expect(screen.getAllByText('Vegan')).toHaveLength(2))
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })

  it('shows open-table empty state when no hard limits', async () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    // Halal is a soft dietary label — not in STRICT_DIETS, so it drops
    // into dietMix and doesn't create a hard limit.
    makeSupabase({
      rsvps:    [{ user_id: GUEST_UID, users: { name: 'Carol' } }],
      profiles: [{ user_id: GUEST_UID, dietary: ['Halal'], avoid: [], protein_anchor: null, flavor_preference: [], adventurousness: 50 }],
    })
    render(<TablePage params={PARAMS} />)
    await waitFor(() =>
      expect(screen.getByText(/open table/i)).toBeInTheDocument()
    )
  })

  it('shows open-table state when there are no guests', async () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    makeSupabase()
    render(<TablePage params={PARAMS} />)
    await waitFor(() =>
      expect(screen.getByText(/open table/i)).toBeInTheDocument()
    )
  })
})

// ─── Diet Mix ────────────────────────────────────────────────────────────────

describe('Diet Mix section', () => {
  it('renders "Diet Mix" heading', async () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    makeSupabase()
    render(<TablePage params={PARAMS} />)
    await waitFor(() =>
      expect(screen.getByText(/diet mix/i)).toBeInTheDocument()
    )
  })

  it('shows a soft diet label when a guest has one', async () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    // Halal is a soft dietary — surfaces in the dietMix card.
    makeSupabase({
      rsvps:    [{ user_id: GUEST_UID, users: { name: 'Dan' } }],
      profiles: [{ user_id: GUEST_UID, dietary: ['Halal'], avoid: [], protein_anchor: null, flavor_preference: [], adventurousness: 50 }],
    })
    render(<TablePage params={PARAMS} />)
    await waitFor(() =>
      expect(screen.getByText(/halal/i)).toBeInTheDocument()
    )
  })

  it('shows empty-state text when no soft diets present', async () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    makeSupabase()
    render(<TablePage params={PARAMS} />)
    await waitFor(() =>
      expect(screen.getByText(/no dietary preferences/i)).toBeInTheDocument()
    )
  })
})

// ─── Protein Anchor ──────────────────────────────────────────────────────────

describe('Protein Anchor section', () => {
  it('renders the guest-facing table preference heading', async () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    makeSupabase()
    render(<TablePage params={PARAMS} />)
    // Exact case: heading is "Protein Anchor", empty state is "No protein anchor on record".
    await waitFor(() =>
      expect(screen.getByText("Tonight's Picks")).toBeInTheDocument()
    )
  })

  it('shows the protein label when a guest has one', async () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    makeSupabase({
      rsvps:    [{ user_id: GUEST_UID, users: { name: 'Leo' } }],
      profiles: [{ user_id: GUEST_UID, dietary: [], avoid: [], protein_anchor: 'Fish', flavor_preference: [], adventurousness: 50 }],
    })
    render(<TablePage params={PARAMS} />)
    await waitFor(() => expect(screen.getByText('Fish')).toBeInTheDocument())
  })

  it('renders readable labels for raw multi-select values', async () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    makeSupabase({
      rsvps: [{ user_id: GUEST_UID, users: { name: 'Leo' } }],
      profiles: [{ user_id: GUEST_UID, dietary: [], avoid: [], protein_anchor: null, protein_preferences: ['beef_lamb', 'grain_pasta'], flavor_preference: [], adventurousness: 50 }],
    })
    render(<TablePage params={PARAMS} />)
    await waitFor(() => expect(screen.getByText('Beef or lamb')).toBeInTheDocument())
    expect(screen.getByText('Grains or pasta')).toBeInTheDocument()
    expect(screen.queryByText('beef_lamb')).not.toBeInTheDocument()
  })

  it('shows empty-state text when no preference is present', async () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    makeSupabase()
    render(<TablePage params={PARAMS} />)
    await waitFor(() =>
      expect(screen.getByText(/no picks on record/i)).toBeInTheDocument()
    )
  })
})

// ─── Flavor Preference ────────────────────────────────────────────────────────

describe('Flavor Preference section', () => {
  it('renders "Flavor Preference" heading', async () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    makeSupabase()
    render(<TablePage params={PARAMS} />)
    await waitFor(() =>
      expect(screen.getByText('Flavor Preference')).toBeInTheDocument()
    )
  })

  it('shows a flavor label when a guest has one', async () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    makeSupabase({
      rsvps:    [{ user_id: GUEST_UID, users: { name: 'Mia' } }],
      profiles: [{ user_id: GUEST_UID, dietary: [], avoid: [], protein_anchor: null, flavor_preference: ['Fresh'], adventurousness: 50 }],
    })
    render(<TablePage params={PARAMS} />)
    await waitFor(() => expect(screen.getByText('Fresh')).toBeInTheDocument())
  })

  it('shows empty-state text when no flavor preferences present', async () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    makeSupabase()
    render(<TablePage params={PARAMS} />)
    await waitFor(() =>
      expect(screen.getByText(/no flavor preferences/i)).toBeInTheDocument()
    )
  })
})

// ─── Adventurousness ─────────────────────────────────────────────────────────

describe('Adventurousness section', () => {
  it('renders "Adventurousness" heading', async () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    makeSupabase()
    render(<TablePage params={PARAMS} />)
    await waitFor(() =>
      expect(screen.getByText(/adventurousness/i)).toBeInTheDocument()
    )
  })

  it('shows "cautious" label when avg < 40', async () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    makeSupabase({
      rsvps:    [{ user_id: GUEST_UID, users: { name: 'Frank' } }],
      profiles: [{ user_id: GUEST_UID, dietary: [], avoid: [], protein_anchor: null, flavor_preference: [], adventurousness: 30 }],
    })
    render(<TablePage params={PARAMS} />)
    // Exact-string: label <p> has text "cautious"; brief has "cautious table (avg 30)"
    await waitFor(() =>
      expect(screen.getByText('cautious')).toBeInTheDocument()
    )
  })

  it('shows "balanced" label when avg is 40-59', async () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    makeSupabase({
      rsvps:    [{ user_id: GUEST_UID, users: { name: 'Grace' } }],
      profiles: [{ user_id: GUEST_UID, dietary: [], avoid: [], protein_anchor: null, flavor_preference: [], adventurousness: 50 }],
    })
    render(<TablePage params={PARAMS} />)
    await waitFor(() =>
      expect(screen.getByText('balanced')).toBeInTheDocument()
    )
  })

  it('shows "adventurous" label when avg is 60-77', async () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    makeSupabase({
      rsvps:    [{ user_id: GUEST_UID, users: { name: 'Hana' } }],
      profiles: [{ user_id: GUEST_UID, dietary: [], avoid: [], protein_anchor: null, flavor_preference: [], adventurousness: 70 }],
    })
    render(<TablePage params={PARAMS} />)
    // Exact-string: label is "adventurous"; heading is "Adventurousness" (different)
    await waitFor(() =>
      expect(screen.getByText('adventurous')).toBeInTheDocument()
    )
  })

  it('shows "daring" label when avg >= 78', async () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    makeSupabase({
      rsvps:    [{ user_id: GUEST_UID, users: { name: 'Ivan' } }],
      profiles: [{ user_id: GUEST_UID, dietary: [], avoid: [], protein_anchor: null, flavor_preference: [], adventurousness: 80 }],
    })
    render(<TablePage params={PARAMS} />)
    await waitFor(() =>
      expect(screen.getByText('daring')).toBeInTheDocument()
    )
  })
})

// ─── Brief ───────────────────────────────────────────────────────────────────

describe('brief text', () => {
  it('renders the brief from buildIntel when guests are present', async () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    makeSupabase({
      rsvps:    [{ user_id: GUEST_UID, users: { name: 'Jade' } }],
      profiles: [{ user_id: GUEST_UID, dietary: [], avoid: [], protein_anchor: null, flavor_preference: [], adventurousness: 50 }],
    })
    render(<TablePage params={PARAMS} />)
    await waitFor(() =>
      // buildIntel brief always starts with "<N> guest"
      expect(screen.getAllByText(/1 guest/i).length).toBeGreaterThan(0)
    )
  })

  it('renders "No guest data yet" brief when there are no RSVPs', async () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    makeSupabase()
    render(<TablePage params={PARAMS} />)
    await waitFor(() =>
      expect(screen.getByText(/no guest data yet/i)).toBeInTheDocument()
    )
  })
})
