import { act, render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RSVPPage from '@/app/(guest)/events/[id]/rsvp/page'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

jest.mock('@/lib/supabase/client')
jest.mock('next/navigation', () => ({ useRouter: jest.fn() }))

const mockPush = jest.fn()

const SAMPLE_EVENT = {
  title: 'Casa Mekawi',
  tagline: 'An intimate gathering',
  event_date: '2026-09-01T19:00:00Z',
  venue: 'The Garden Room',
  dress_code: 'Smart casual',
  host: { name: 'Layla' },
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(useRouter as jest.Mock).mockReturnValue({ push: mockPush })
  mockPush.mockReset()
  localStorage.clear()
  localStorage.setItem('sofra_user_id', 'uid-1')
  window.history.replaceState({}, '', '/events/event-1/rsvp')
})

// Shared mock factory — call at the start of each test that needs Supabase
function makeSupabase({
  event = SAMPLE_EVENT as typeof SAMPLE_EVENT | null,
  rsvpRow = null as { status: string } | null,
  profileRow = null as Record<string, unknown> | null,
  guestRows = [] as { status: string; users: { id: string; name: string } | null }[],
  fetchError = null as { message: string } | null,
  upsertError = null as { message: string } | null,
  questionnaireConfig = null as Record<string, unknown> | null,
  customResponseRows = [] as Array<{ question_id: string; response: unknown }>,
} = {}) {
  const rsvpUpsert    = jest.fn().mockResolvedValue({ error: upsertError })
  const profileUpsert = jest.fn().mockResolvedValue({ error: upsertError })
  const customResponseUpsert = jest.fn().mockResolvedValue({ error: null })

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
          select: jest.fn((cols: string) => {
            if (cols === 'status') {
              return {
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockReturnValue({
                    maybeSingle: jest.fn().mockResolvedValue({ data: rsvpRow, error: fetchError }),
                  }),
                }),
              }
            }
            return {
              eq: jest.fn().mockReturnValue({
                in: jest.fn().mockResolvedValue({ data: guestRows, error: null }),
              }),
            }
          }),
          upsert: rsvpUpsert,
        }
      }
      if (table === 'event_questionnaires') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({
                data: questionnaireConfig ? { config: questionnaireConfig } : null,
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'event_question_responses') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ data: customResponseRows, error: null }),
            }),
          }),
          upsert: customResponseUpsert,
        }
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
    customResponseUpsert,
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
    expect(mockPush).toHaveBeenCalledWith('/login?invite=1&next=%2Fevents%2Fevent-1%2Frsvp')
  )
  expect(sb.from).not.toHaveBeenCalled()
  expect(screen.queryByText(/take your seat/i)).not.toBeInTheDocument()
  expect(screen.queryByText(/save me a seat/i)).not.toBeInTheDocument()
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
})

describe('Step 1 — the invite', () => {
  it('shows real event details and the three response choices', async () => {
    makeSupabase()
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByText('Casa Mekawi'))
    expect(screen.getByText('Layla')).toBeInTheDocument()
    expect(screen.getByText('The Garden Room')).toBeInTheDocument()
    expect(screen.getByText('Smart casual')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save me a seat/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /think about it/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /maybe next time/i })).toBeInTheDocument()
  })

  it('the guest list is not revealed before responding', async () => {
    makeSupabase({ guestRows: [{ status: 'going', users: { id: 'g1', name: 'Omar' } }] })
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByText('Casa Mekawi'))
    expect(screen.getByText(/rsvp to meet the rest of the table/i)).toBeInTheDocument()
    expect(screen.queryByText('Omar')).not.toBeInTheDocument()
  })

  it('reveals the guest list when the user already has an RSVP', async () => {
    makeSupabase({
      rsvpRow: { status: 'going' },
      guestRows: [{ status: 'going', users: { id: 'g1', name: 'Omar' } }],
    })
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByText('Casa Mekawi'))
    expect(screen.queryByText(/rsvp to meet the rest of the table/i)).not.toBeInTheDocument()
  })

  it('clicking "Save me a seat" advances directly to the preferences step', async () => {
    makeSupabase()
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /save me a seat/i }))
    await userEvent.click(screen.getByRole('button', { name: /save me a seat/i }))
    expect(screen.getByRole('checkbox', { name: 'Vegetarian' })).toBeInTheDocument()
  })

  it('clicking "I\'ll think about it" also advances to preferences', async () => {
    makeSupabase()
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /think about it/i }))
    await userEvent.click(screen.getByRole('button', { name: /think about it/i }))
    expect(screen.getByText(/help us plan, even if you haven't made up your mind yet/i)).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Vegetarian' })).toBeInTheDocument()
  })
})

// Helper: renders the page, waits for the invite, responds going, advances to preferences
async function navigateToStep2() {
  makeSupabase()
  render(<RSVPPage params={{ id: 'event-1' }} />)
  await waitFor(() => screen.getByRole('button', { name: /save me a seat/i }))
  await userEvent.click(screen.getByRole('button', { name: /save me a seat/i }))
}

describe('Step 2 — checkbox groups', () => {
  it('renders all dietary checkboxes', async () => {
    await navigateToStep2()
    for (const chip of ['Vegetarian','Vegan','No pork','Kosher','Gluten-free','No dairy','Pescatarian']) {
      expect(screen.getByRole('checkbox', { name: chip })).toBeInTheDocument()
    }
  })

  it('renders all avoid checkboxes', async () => {
    await navigateToStep2()
    for (const chip of ['Nuts','Shellfish','Pork','Eggs','Cilantro','Mushrooms']) {
      expect(screen.getAllByRole('checkbox', { name: chip }).length).toBeGreaterThan(0)
    }
  })

  it('renders all flavor checkboxes', async () => {
    await navigateToStep2()
    for (const chip of ['Umami','Spicy','Plain & clean','Saucy','Smoky','Bright & sour','Sweet-savoury','Herby']) {
      expect(screen.getByRole('checkbox', { name: chip })).toBeInTheDocument()
    }
  })

  it('renders the natural protein question and permits two specifics but blocks a third', async () => {
    await navigateToStep2()
    expect(screen.getByText('WHAT SOUNDS BEST TONIGHT?')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Chicken' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Fish' }))
    await userEvent.click(screen.getAllByRole('checkbox', { name: 'Shellfish' })[1])
    expect(screen.getByRole('checkbox', { name: 'Chicken' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Fish' })).toBeChecked()
    expect(screen.getAllByRole('checkbox', { name: 'Shellfish' })[1]).not.toBeChecked()
    expect(screen.getByTestId('protein-hint')).toBeInTheDocument()
  })

  it('no preference clears specifics and a specific choice clears no preference', async () => {
    await navigateToStep2()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Chicken' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'No preference with a surprise' }))
    expect(screen.getByRole('checkbox', { name: 'Chicken' })).not.toBeChecked()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Fish' }))
    expect(screen.getByRole('checkbox', { name: 'No preference with a surprise' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Fish' })).toBeChecked()
  })

  it('allows three flavors, blocks a fourth, and permits replacement after removal', async () => {
    await navigateToStep2()
    for (const chip of ['Umami', 'Spicy', 'Plain & clean']) {
      await userEvent.click(screen.getByRole('checkbox', { name: chip }))
    }
    await userEvent.click(screen.getByRole('checkbox', { name: 'Saucy' }))
    expect(screen.getByRole('checkbox', { name: 'Saucy' })).not.toBeChecked()
    expect(screen.getByTestId('flavor-hint')).toHaveTextContent('Choose up to three.')

    await userEvent.click(screen.getByRole('checkbox', { name: 'Spicy' }))
    expect(screen.getByRole('checkbox', { name: 'Spicy' })).not.toBeChecked()
    expect(screen.queryByTestId('flavor-hint')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('checkbox', { name: 'Saucy' }))
    expect(screen.getByRole('checkbox', { name: 'Saucy' })).toBeChecked()
  })

  it('toggles a dietary checkbox on', async () => {
    await navigateToStep2()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Vegetarian' }))
    expect(screen.getByRole('checkbox', { name: 'Vegetarian' })).toBeChecked()
  })

  it('toggles a dietary checkbox off again', async () => {
    await navigateToStep2()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Vegetarian' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Vegetarian' }))
    expect(screen.getByRole('checkbox', { name: 'Vegetarian' })).not.toBeChecked()
  })

  it('checkboxes are multi-select: selecting one does not deselect another', async () => {
    await navigateToStep2()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Vegetarian' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Vegan' }))
    expect(screen.getByRole('checkbox', { name: 'Vegetarian' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Vegan' })).toBeChecked()
  })

  it('avoid checkboxes are independent of dietary checkboxes', async () => {
    await navigateToStep2()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Nuts' }))
    expect(screen.getByRole('checkbox', { name: 'Vegetarian' })).not.toBeChecked()
  })
})

describe('Dietary lane heading and None option', () => {
  it('shows the updated section label', async () => {
    await navigateToStep2()
    expect(screen.getByText('ANY LANE TO STAY IN?')).toBeInTheDocument()
    expect(screen.queryByText('DEAL BREAKERS')).not.toBeInTheDocument()
  })

  it('places None directly after No dairy, before Pescatarian', async () => {
    await navigateToStep2()
    const dietaryGrid = document.querySelectorAll('.sv2-checkbox-grid')[0]
    const labels = Array.from(dietaryGrid.querySelectorAll('label')).map((l) => l.textContent?.trim())
    expect(labels).toEqual([
      'Vegetarian', 'Vegan', 'No pork', 'Kosher', 'Gluten-free', 'No dairy', 'None', 'Pescatarian',
    ])
  })

  it('None is checked by default when no dietary options are selected', async () => {
    await navigateToStep2()
    expect(screen.getByRole('checkbox', { name: 'None' })).toBeChecked()
  })

  it('selecting a dietary option deselects None automatically', async () => {
    await navigateToStep2()
    expect(screen.getByRole('checkbox', { name: 'None' })).toBeChecked()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Pescatarian' }))
    expect(screen.getByRole('checkbox', { name: 'None' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Pescatarian' })).toBeChecked()
  })

  it('selecting None clears every currently selected dietary option', async () => {
    await navigateToStep2()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Vegan' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Kosher' }))
    expect(screen.getByRole('checkbox', { name: 'Vegan' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Kosher' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'None' })).not.toBeChecked()

    await userEvent.click(screen.getByRole('checkbox', { name: 'None' }))
    expect(screen.getByRole('checkbox', { name: 'None' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Vegan' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Kosher' })).not.toBeChecked()
  })

  it('None and a real dietary option are never both checked at once', async () => {
    await navigateToStep2()
    const dietaryOptions = ['Vegetarian', 'Vegan', 'No pork', 'Kosher', 'Gluten-free', 'No dairy', 'Pescatarian']
    for (const opt of dietaryOptions) {
      await userEvent.click(screen.getByRole('checkbox', { name: opt }))
      expect(screen.getByRole('checkbox', { name: 'None' })).not.toBeChecked()
      await userEvent.click(screen.getByRole('checkbox', { name: 'None' }))
      expect(screen.getByRole('checkbox', { name: opt })).not.toBeChecked()
      expect(screen.getByRole('checkbox', { name: 'None' })).toBeChecked()
    }
  })

  it('submits an empty array (the existing no-restriction representation), not a literal "None" value', async () => {
    const sb = makeSupabase()
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /save me a seat/i }))
    await userEvent.click(screen.getByRole('button', { name: /save me a seat/i }))
    // None is selected by default (dietary starts empty) -- submit without touching anything.
    await userEvent.click(screen.getByRole('button', { name: /save my seat/i }))
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/events/event-1'))
    expect(sb.profileUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ dietary: [] }),
      { onConflict: 'user_id' }
    )
  })

  it('submits real dietary selections as their exact canonical values, unchanged', async () => {
    const sb = makeSupabase()
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /save me a seat/i }))
    await userEvent.click(screen.getByRole('button', { name: /save me a seat/i }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Vegan' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Kosher' }))
    await userEvent.click(screen.getByRole('button', { name: /save my seat/i }))
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/events/event-1'))
    expect(sb.profileUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ dietary: ['Vegan', 'Kosher'] }),
      { onConflict: 'user_id' }
    )
  })

  it('prefilling from an existing empty dietary array shows None checked, not any real option', async () => {
    makeSupabase({
      profileRow: { user_id: 'uid-1', dietary: [], avoid: [], flavor_preference: [], adventurousness: 50 },
    })
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /save me a seat/i }))
    await userEvent.click(screen.getByRole('button', { name: /save me a seat/i }))
    await userEvent.click(await screen.findByRole('button', { name: 'UPDATE MY PREFERENCES' }))
    expect(screen.getByRole('checkbox', { name: 'None' })).toBeChecked()
    for (const opt of ['Vegetarian', 'Vegan', 'No pork', 'Kosher', 'Gluten-free', 'No dairy', 'Pescatarian']) {
      expect(screen.getByRole('checkbox', { name: opt })).not.toBeChecked()
    }
  })

  it('prefilling from an existing real dietary selection shows None unchecked', async () => {
    makeSupabase({
      profileRow: { user_id: 'uid-1', dietary: ['Vegan'], avoid: [], flavor_preference: [], adventurousness: 50 },
    })
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /save me a seat/i }))
    await userEvent.click(screen.getByRole('button', { name: /save me a seat/i }))
    await userEvent.click(await screen.findByRole('button', { name: 'UPDATE MY PREFERENCES' }))
    expect(screen.getByRole('checkbox', { name: 'Vegan' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'None' })).not.toBeChecked()
  })
})

describe('adventurousness slider', () => {
  async function goToStep2WithAdventurousness(value: number) {
    makeSupabase({
      profileRow: { user_id: 'uid-1', dietary: [], avoid: [], flavor_preference: [], adventurousness: value },
    })
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /save me a seat/i }))
    await userEvent.click(screen.getByRole('button', { name: /save me a seat/i }))
    await userEvent.click(await screen.findByRole('button', { name: 'UPDATE MY PREFERENCES' }))
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

describe('declining', () => {
  it('upserts rsvps with status cant and shows the missing-out screen', async () => {
    const sb = makeSupabase()
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /maybe next time/i }))
    await userEvent.click(screen.getByRole('button', { name: /maybe next time/i }))
    await userEvent.click(screen.getByRole('button', { name: /are you sure/i }))
    await userEvent.click(screen.getByRole('button', { name: /really sure/i }))
    await waitFor(() => expect(screen.getByText(/you'll be missed/i)).toBeInTheDocument())
    expect(sb.rsvpUpsert).toHaveBeenCalledWith(
      { event_id: 'event-1', user_id: 'uid-1', status: 'cant' },
      { onConflict: 'event_id,user_id' }
    )
    expect(mockPush).not.toHaveBeenCalledWith('/events/event-1')
  })

  it('shows error and stays on the invite on cant upsert failure', async () => {
    makeSupabase({ upsertError: { message: 'db error' } })
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /maybe next time/i }))
    await userEvent.click(screen.getByRole('button', { name: /maybe next time/i }))
    await userEvent.click(screen.getByRole('button', { name: /are you sure/i }))
    await userEvent.click(screen.getByRole('button', { name: /really sure/i }))
    await waitFor(() =>
      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument()
    )
    expect(screen.queryByText(/you'll be missed/i)).not.toBeInTheDocument()
  })

  it('"Return to invitation" goes back to the invite screen', async () => {
    makeSupabase()
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /maybe next time/i }))
    await userEvent.click(screen.getByRole('button', { name: /maybe next time/i }))
    await userEvent.click(screen.getByRole('button', { name: /are you sure/i }))
    await userEvent.click(screen.getByRole('button', { name: /really sure/i }))
    await waitFor(() => screen.getByText(/you'll be missed/i))
    await userEvent.click(screen.getByRole('button', { name: /return to invitation/i }))
    expect(screen.getByRole('button', { name: /save me a seat/i })).toBeInTheDocument()
  })
})

describe('going/maybe submit', () => {
  it('upserts rsvps and taste_profiles with production field names, then redirects', async () => {
    const sb = makeSupabase()
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /save me a seat/i }))
    await userEvent.click(screen.getByRole('button', { name: /save me a seat/i }))
    await userEvent.click(screen.getByRole('button', { name: /save my seat/i }))
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
    await waitFor(() => screen.getByRole('button', { name: /save me a seat/i }))
    await userEvent.click(screen.getByRole('button', { name: /save me a seat/i }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Umami' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Smoky' }))
    await userEvent.click(screen.getByRole('button', { name: /save my seat/i }))
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/events/event-1'))
    expect(sb.profileUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        flavor_preference: ['Umami', 'Smoky'],
      }),
      { onConflict: 'user_id' }
    )
  })

  it('preserves legacy flavor hydration but submits only the first three valid canonical values', async () => {
    const sb = makeSupabase({
      rsvpRow: { status: 'going' },
      profileRow: {
        user_id: 'uid-1', dietary: [], avoid: [], protein_preferences: [],
        flavor_preference: ['legacy-value', 'Umami', 'Spicy', 'Smoky', 'Herby'],
        adventurousness: 50,
      },
    })
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /save me a seat/i }))
    expect(sb.profileUpsert).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: /save me a seat/i }))
    await userEvent.click(await screen.findByRole('button', { name: 'UPDATE MY PREFERENCES' }))
    expect(screen.getByRole('checkbox', { name: 'Herby' })).toBeChecked()
    await userEvent.click(screen.getByRole('button', { name: /update rsvp/i }))
    await waitFor(() => expect(sb.profileUpsert).toHaveBeenCalled())
    expect(sb.profileUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ flavor_preference: ['Umami', 'Spicy', 'Smoky'] }),
      { onConflict: 'user_id' }
    )
  })

  it('persists selected protein preferences as unchanged raw values', async () => {
    const sb = makeSupabase()
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /save me a seat/i }))
    await userEvent.click(screen.getByRole('button', { name: /save me a seat/i }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Beef or lamb' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Grains or pasta' }))
    await userEvent.click(screen.getByRole('button', { name: /save my seat/i }))
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/events/event-1'))
    expect(sb.profileUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ protein_preferences: ['beef_lamb', 'grain_pasta'] }),
      { onConflict: 'user_id' }
    )
  })

  it('submits the latest protein click even before React commits a rerender', async () => {
    const sb = makeSupabase()
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /save me a seat/i }))
    await userEvent.click(screen.getByRole('button', { name: /save me a seat/i }))

    act(() => {
      screen.getByRole('checkbox', { name: 'Fish' }).click()
      screen.getByRole('button', { name: /save my seat/i }).click()
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
    await waitFor(() => screen.getByRole('button', { name: /save me a seat/i }))
    await userEvent.click(screen.getByRole('button', { name: /save me a seat/i }))
    await userEvent.click(screen.getByRole('button', { name: /save my seat/i }))
    await waitFor(() =>
      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument()
    )
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('submit button reads "UPDATE RSVP" when hasExistingRsvp is true', async () => {
    makeSupabase({ rsvpRow: { status: 'going' } })
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /save me a seat/i }))
    await userEvent.click(screen.getByRole('button', { name: /save me a seat/i }))
    expect(screen.getByRole('button', { name: /update rsvp/i })).toBeInTheDocument()
  })

  it('reads "UPDATE PREFERENCES" when opened from Profile', async () => {
    window.history.replaceState({}, '', '/events/event-1/rsvp?preferences=1')
    makeSupabase({ rsvpRow: { status: 'going' }, profileRow: { user_id: 'uid-1' } })
    render(<RSVPPage params={{ id: 'event-1' }} />)

    expect(await screen.findByRole('button', { name: 'UPDATE PREFERENCES' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'UPDATE RSVP' })).not.toBeInTheDocument()
  })

  it('reads "SAVE PREFERENCES" for a first-time preference form opened from Profile', async () => {
    window.history.replaceState({}, '', '/events/event-1/rsvp?preferences=1')
    makeSupabase({ rsvpRow: { status: 'going' }, profileRow: null })
    render(<RSVPPage params={{ id: 'event-1' }} />)

    expect(await screen.findByRole('button', { name: 'SAVE PREFERENCES' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'UPDATE PREFERENCES' })).not.toBeInTheDocument()
  })

  it('preference-only Back returns to event details without showing RSVP choices', async () => {
    window.history.replaceState({}, '', '/events/event-1/rsvp?preferences=1')
    makeSupabase({ profileRow: { user_id: 'uid-1' } })
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await userEvent.click(await screen.findByRole('button', { name: /back/i }))
    expect(mockPush).toHaveBeenCalledWith('/events/event-1')
    expect(screen.queryByRole('button', { name: /save me a seat/i })).not.toBeInTheDocument()
  })

  it('preference-only save does not create or update an RSVP or show the profile badge', async () => {
    window.history.replaceState({}, '', '/events/event-1/rsvp?preferences=1')
    const sb = makeSupabase({ profileRow: { user_id: 'uid-1', dietary: [], avoid: [], flavor_preference: [], adventurousness: 50 } })
    render(<RSVPPage params={{ id: 'event-1' }} />)
    expect(await screen.findByRole('button', { name: 'UPDATE PREFERENCES' })).toBeInTheDocument()
    expect(screen.queryByTestId('prefilled-badge')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'UPDATE PREFERENCES' }))
    await waitFor(() => expect(sb.profileUpsert).toHaveBeenCalled())
    expect(sb.rsvpUpsert).not.toHaveBeenCalled()
  })
})

describe('prefill from existing data', () => {
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
    await waitFor(() => screen.getByRole('button', { name: /save me a seat/i }))
    await userEvent.click(screen.getByRole('button', { name: /save me a seat/i }))
    await userEvent.click(await screen.findByRole('button', { name: 'UPDATE MY PREFERENCES' }))
    expect(screen.getByRole('checkbox', { name: 'Vegan' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Nuts' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Umami' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Smoky' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Beef or lamb' })).toBeChecked()
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
    await waitFor(() => screen.getByRole('button', { name: /save me a seat/i }))
    await userEvent.click(screen.getByRole('button', { name: /save me a seat/i }))
    await userEvent.click(await screen.findByRole('button', { name: 'UPDATE MY PREFERENCES' }))
    expect(screen.getByRole('checkbox', { name: 'Fish' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Grains or pasta' })).toBeChecked()
  })

  it('shows "Pulled from your profile" badge when a taste_profiles row exists', async () => {
    makeSupabase({
      profileRow: { user_id: 'uid-1', dietary: [], avoid: [], flavor_preference: [], adventurousness: 50 },
    })
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /save me a seat/i }))
    await userEvent.click(screen.getByRole('button', { name: /save me a seat/i }))
    await userEvent.click(await screen.findByRole('button', { name: 'UPDATE MY PREFERENCES' }))
    expect(screen.getByTestId('prefilled-badge')).toBeInTheDocument()
  })

  it('badge persists after the user edits a chip', async () => {
    makeSupabase({
      profileRow: { user_id: 'uid-1', dietary: ['Vegan'], avoid: [], flavor_preference: [], adventurousness: 50 },
    })
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /save me a seat/i }))
    await userEvent.click(screen.getByRole('button', { name: /save me a seat/i }))
    await userEvent.click(await screen.findByRole('button', { name: 'UPDATE MY PREFERENCES' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Vegan' })) // deselect
    expect(screen.getByTestId('prefilled-badge')).toBeInTheDocument()
  })

  it('does not show badge when no taste_profiles row', async () => {
    await navigateToStep2()
    expect(screen.queryByTestId('prefilled-badge')).not.toBeInTheDocument()
  })
})

describe('host-customized questionnaire', () => {
  const CUSTOMIZED_CONFIG = {
    questions: [
      {
        id: 'dietary',
        kind: 'canonical',
        canonicalKey: 'dietary',
        order: 0,
        title: 'ANY LANE TO STAY IN, TRULY?',
        optionLabels: { 'No dairy': 'KEEP IT DAIRY-FREE' },
      },
      { id: 'avoid', kind: 'canonical', canonicalKey: 'avoid', order: 1 },
      { id: 'protein', kind: 'canonical', canonicalKey: 'protein', order: 2 },
      { id: 'flavor', kind: 'canonical', canonicalKey: 'flavor', order: 3 },
      { id: 'adventurousness', kind: 'canonical', canonicalKey: 'adventurousness', order: 4 },
      {
        id: 'q_custom1',
        kind: 'custom',
        type: 'text',
        title: 'Anything you are especially craving?',
        order: 5,
      },
    ],
  }

  it('shows the host-customized title and option label, with protein labels unaffected (no override on that question)', async () => {
    makeSupabase({ questionnaireConfig: CUSTOMIZED_CONFIG })
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /save me a seat/i }))
    await userEvent.click(screen.getByRole('button', { name: /save me a seat/i }))

    expect(await screen.findByText('ANY LANE TO STAY IN, TRULY?')).toBeInTheDocument()
    expect(screen.queryByText('ANY LANE TO STAY IN?')).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'KEEP IT DAIRY-FREE' })).toBeInTheDocument()
    // Protein has no override in this config -- must still show real labels, not raw slugs.
    expect(screen.getByRole('checkbox', { name: 'Beef or lamb' })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'beef_lamb' })).not.toBeInTheDocument()
  })

  it('submits the raw canonical value, not the customized display label', async () => {
    const sb = makeSupabase({ questionnaireConfig: CUSTOMIZED_CONFIG })
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /save me a seat/i }))
    await userEvent.click(screen.getByRole('button', { name: /save me a seat/i }))

    await userEvent.click(await screen.findByRole('checkbox', { name: 'KEEP IT DAIRY-FREE' }))
    await userEvent.click(screen.getByRole('button', { name: 'SAVE MY SEAT' }))

    await waitFor(() => expect(sb.profileUpsert).toHaveBeenCalled())
    expect(sb.profileUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ dietary: ['No dairy'] }),
      expect.anything()
    )
  })

  it('renders the custom question and persists its answer separately from canonical preferences', async () => {
    const sb = makeSupabase({ questionnaireConfig: CUSTOMIZED_CONFIG })
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /save me a seat/i }))
    await userEvent.click(screen.getByRole('button', { name: /save me a seat/i }))

    const textbox = await screen.findByLabelText('Anything you are especially craving?')
    await userEvent.type(textbox, 'Grandma’s knafeh')
    await userEvent.click(screen.getByRole('button', { name: 'SAVE MY SEAT' }))

    await waitFor(() => expect(sb.customResponseUpsert).toHaveBeenCalled())
    expect(sb.customResponseUpsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          event_id: 'event-1',
          user_id: 'uid-1',
          question_id: 'q_custom1',
          response: 'Grandma’s knafeh',
        }),
      ]),
      expect.anything()
    )
  })

  it('does not write a custom-question row when left blank', async () => {
    const sb = makeSupabase({ questionnaireConfig: CUSTOMIZED_CONFIG })
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /save me a seat/i }))
    await userEvent.click(screen.getByRole('button', { name: /save me a seat/i }))
    await screen.findByLabelText('Anything you are especially craving?')
    await userEvent.click(screen.getByRole('button', { name: 'SAVE MY SEAT' }))

    await waitFor(() => expect(sb.profileUpsert).toHaveBeenCalled())
    expect(sb.customResponseUpsert).toHaveBeenCalled()
    expect(sb.customResponseUpsert.mock.calls[0][0].some((row: { question_id: string }) => row.question_id === 'q_custom1')).toBe(false)
  })

  it('behaves exactly as the default questionnaire when no event_questionnaires row exists', async () => {
    makeSupabase({ questionnaireConfig: null })
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /save me a seat/i }))
    await userEvent.click(screen.getByRole('button', { name: /save me a seat/i }))

    expect(await screen.findByText('ANY LANE TO STAY IN?')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'No dairy' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Anything you are especially craving?')).not.toBeInTheDocument()
  })

  const SLIDER_CONFIG = {
    questions: [
      { id: 'dietary', kind: 'canonical', canonicalKey: 'dietary', order: 0 },
      { id: 'avoid', kind: 'canonical', canonicalKey: 'avoid', order: 1 },
      { id: 'protein', kind: 'canonical', canonicalKey: 'protein', order: 2 },
      { id: 'flavor', kind: 'canonical', canonicalKey: 'flavor', order: 3 },
      {
        id: 'adventurousness',
        kind: 'canonical',
        canonicalKey: 'adventurousness',
        order: 4,
        sliderMinLabel: 'KEEP IT FAMILIAR',
        sliderMaxLabel: 'SURPRISE ME',
      },
      {
        id: 'q_slider1',
        kind: 'custom',
        type: 'slider',
        title: 'How adventurous should tonight feel?',
        order: 5,
        sliderMinLabel: 'Keep it familiar',
        sliderMaxLabel: 'Surprise me',
        sliderSteps: 5,
      },
    ],
  }

  it('shows customized slider end labels for the canonical adventurousness question, not a set of choices', async () => {
    makeSupabase({ questionnaireConfig: SLIDER_CONFIG })
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /save me a seat/i }))
    await userEvent.click(screen.getByRole('button', { name: /save me a seat/i }))

    expect(await screen.findByText('KEEP IT FAMILIAR')).toBeInTheDocument()
    expect(screen.getByText('SURPRISE ME')).toBeInTheDocument()
    expect(screen.queryByText('THE USUAL')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Adventurousness')).toHaveAttribute('type', 'range')
  })

  it('renders a custom slider question and persists a numeric answer, separate from canonical preferences', async () => {
    const sb = makeSupabase({ questionnaireConfig: SLIDER_CONFIG })
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /save me a seat/i }))
    await userEvent.click(screen.getByRole('button', { name: /save me a seat/i }))

    const slider = await screen.findByLabelText('How adventurous should tonight feel?')
    expect(slider).toHaveAttribute('type', 'range')
    expect(slider).toHaveAttribute('max', '5')
    fireEvent.change(slider, { target: { value: '5' } })
    await userEvent.click(screen.getByRole('button', { name: 'SAVE MY SEAT' }))

    await waitFor(() => expect(sb.customResponseUpsert).toHaveBeenCalled())
    expect(sb.customResponseUpsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          event_id: 'event-1',
          user_id: 'uid-1',
          question_id: 'q_slider1',
          response: 5,
        }),
      ]),
      expect.anything()
    )
    // Canonical adventurousness (0-100 continuous) must be untouched by the custom slider.
    expect(sb.profileUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ adventurousness: 50 }),
      expect.anything()
    )
  })
})

describe('reuse saved preferences (confirm step)', () => {
  const CUSTOMIZED_CONFIG = {
    questions: [
      { id: 'dietary', kind: 'canonical', canonicalKey: 'dietary', order: 0, title: 'A CUSTOM QUESTION' },
      { id: 'avoid', kind: 'canonical', canonicalKey: 'avoid', order: 1 },
      { id: 'protein', kind: 'canonical', canonicalKey: 'protein', order: 2 },
      { id: 'flavor', kind: 'canonical', canonicalKey: 'flavor', order: 3 },
      { id: 'adventurousness', kind: 'canonical', canonicalKey: 'adventurousness', order: 4 },
    ],
  }
  const EXISTING_PROFILE = {
    user_id: 'uid-1', dietary: ['Vegan'], avoid: ['Nuts'], flavor_preference: ['Umami'], adventurousness: 60,
  }

  it('prompts to reuse or update when the guest has saved preferences and the questionnaire is unmodified', async () => {
    makeSupabase({ profileRow: EXISTING_PROFILE })
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /save me a seat/i }))
    await userEvent.click(screen.getByRole('button', { name: /save me a seat/i }))

    expect(await screen.findByText('Same taste as last time?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'USE MY SAVED PREFERENCES' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'UPDATE MY PREFERENCES' })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('skips the prompt for a first-time guest with no saved preferences', async () => {
    makeSupabase()
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /save me a seat/i }))
    await userEvent.click(screen.getByRole('button', { name: /save me a seat/i }))

    expect(screen.queryByText('Same taste as last time?')).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Vegetarian' })).toBeInTheDocument()
  })

  it('shows only a canonical question whose wording changed', async () => {
    makeSupabase({ profileRow: EXISTING_PROFILE, questionnaireConfig: CUSTOMIZED_CONFIG })
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /save me a seat/i }))
    await userEvent.click(screen.getByRole('button', { name: /save me a seat/i }))

    expect(await screen.findByText('A CUSTOM QUESTION')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Vegan' })).toBeChecked()
    expect(screen.queryByText('ANYTHING YOU AVOID?')).not.toBeInTheDocument()
    expect(screen.queryByText('Same taste as last time?')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'SAVE MY ANSWERS' })).toBeInTheDocument()
  })

  it('shows a returning guest only newly added unanswered custom questions', async () => {
    const configWithCustomQuestions = {
      questions: [
        ...CUSTOMIZED_CONFIG.questions.map((question) =>
          question.id === 'dietary' ? { ...question, title: undefined } : question
        ),
        { id: 'answered-question', kind: 'custom', type: 'text', title: 'Question already answered', order: 5 },
        { id: 'new-question', kind: 'custom', type: 'text', title: 'What should we know now?', order: 6 },
      ],
    }
    makeSupabase({
      profileRow: EXISTING_PROFILE,
      questionnaireConfig: configWithCustomQuestions,
      customResponseRows: [{ question_id: 'answered-question', response: 'Already shared' }],
    })
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /save me a seat/i }))
    await userEvent.click(screen.getByRole('button', { name: /save me a seat/i }))

    expect(await screen.findByLabelText('What should we know now?')).toBeInTheDocument()
    expect(screen.queryByLabelText('Question already answered')).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Vegan' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'SAVE MY ANSWERS' })).toBeInTheDocument()
  })

  it('USE MY SAVED PREFERENCES submits only the RSVP status, leaving taste_profiles untouched', async () => {
    const sb = makeSupabase({ profileRow: EXISTING_PROFILE })
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /save me a seat/i }))
    await userEvent.click(screen.getByRole('button', { name: /save me a seat/i }))

    await userEvent.click(await screen.findByRole('button', { name: 'USE MY SAVED PREFERENCES' }))

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/events/event-1'))
    expect(sb.rsvpUpsert).toHaveBeenCalledWith(
      { event_id: 'event-1', user_id: 'uid-1', status: 'going' },
      { onConflict: 'event_id,user_id' }
    )
    expect(sb.profileUpsert).not.toHaveBeenCalled()
  })

  it('UPDATE MY PREFERENCES leads to the normal prefilled form', async () => {
    makeSupabase({ profileRow: EXISTING_PROFILE })
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /save me a seat/i }))
    await userEvent.click(screen.getByRole('button', { name: /save me a seat/i }))

    await userEvent.click(await screen.findByRole('button', { name: 'UPDATE MY PREFERENCES' }))

    expect(screen.getByRole('checkbox', { name: 'Vegan' })).toBeChecked()
    expect(screen.getByTestId('prefilled-badge')).toBeInTheDocument()
  })

  it('Back from the confirm screen returns to the invite', async () => {
    makeSupabase({ profileRow: EXISTING_PROFILE })
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /save me a seat/i }))
    await userEvent.click(screen.getByRole('button', { name: /save me a seat/i }))
    await screen.findByText('Same taste as last time?')

    await userEvent.click(screen.getByRole('button', { name: '← Back' }))
    expect(screen.getByText('Casa Mekawi')).toBeInTheDocument()
  })
})
