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
type ProfileRow = { user_id: string; dietary: string[]; avoid: string[]; drinks: string[]; adventurousness: number }

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
      profiles: [{ user_id: GUEST_UID, dietary: [], avoid: ['Nuts'], drinks: [], adventurousness: 50 }],
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
      profiles: [{ user_id: GUEST_UID, dietary: ['Vegan'], avoid: [], drinks: [], adventurousness: 50 }],
    })
    render(<TablePage params={PARAMS} />)
    // Exact-string match: limit label is "Vegan", brief lowercases it
    await waitFor(() => expect(screen.getByText('Vegan')).toBeInTheDocument())
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })

  it('shows open-table empty state when no hard limits', async () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    // Halal is a soft dietary label — not in STRICT_DIETS, so it drops
    // into dietMix and doesn't create a hard limit.
    makeSupabase({
      rsvps:    [{ user_id: GUEST_UID, users: { name: 'Carol' } }],
      profiles: [{ user_id: GUEST_UID, dietary: ['Halal'], avoid: [], drinks: [], adventurousness: 50 }],
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
      profiles: [{ user_id: GUEST_UID, dietary: ['Halal'], avoid: [], drinks: [], adventurousness: 50 }],
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

// ─── Drinks ───────────────────────────────────────────────────────────────────

describe('Drinks section', () => {
  it('renders "Drinks" heading', async () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    makeSupabase()
    render(<TablePage params={PARAMS} />)
    await waitFor(() =>
      expect(screen.getByText(/drinks/i)).toBeInTheDocument()
    )
  })

  it('shows a drink label when a guest has one', async () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    makeSupabase({
      rsvps:    [{ user_id: GUEST_UID, users: { name: 'Eve' } }],
      profiles: [{ user_id: GUEST_UID, dietary: [], avoid: [], drinks: ['Wine'], adventurousness: 50 }],
    })
    render(<TablePage params={PARAMS} />)
    // Exact-string: bar label is "Wine" (title case); brief lowercases it to "wine"
    await waitFor(() =>
      expect(screen.getByText('Wine')).toBeInTheDocument()
    )
  })

  it('shows empty-state text when no drink preferences present', async () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    makeSupabase()
    render(<TablePage params={PARAMS} />)
    await waitFor(() =>
      expect(screen.getByText(/no drink preferences/i)).toBeInTheDocument()
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
      profiles: [{ user_id: GUEST_UID, dietary: [], avoid: [], drinks: [], adventurousness: 30 }],
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
      profiles: [{ user_id: GUEST_UID, dietary: [], avoid: [], drinks: [], adventurousness: 50 }],
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
      profiles: [{ user_id: GUEST_UID, dietary: [], avoid: [], drinks: [], adventurousness: 70 }],
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
      profiles: [{ user_id: GUEST_UID, dietary: [], avoid: [], drinks: [], adventurousness: 80 }],
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
      profiles: [{ user_id: GUEST_UID, dietary: [], avoid: [], drinks: [], adventurousness: 50 }],
    })
    render(<TablePage params={PARAMS} />)
    await waitFor(() =>
      // buildIntel brief always starts with "<N> guest"
      expect(screen.getByText(/1 guest/i)).toBeInTheDocument()
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
