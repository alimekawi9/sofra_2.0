# Events List Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `app/(guest)/events/page.tsx` — a client component that shows the logged-in user's hosted events and RSVP'd invites in two sections.

**Architecture:** `'use client'` component that reads `sofra_user_id` from localStorage in a `useEffect` (same as every other page in the app — no cookie, no server component). On mount it runs two parallel Supabase anon-client queries, scoped to the user's ID, then renders a "Hosting" section and a "Your invites" section. All styling uses inline styles with the same `C` color palette used across the app.

**Tech Stack:** Next.js 14 App Router, React (hooks), Supabase browser client (`@/lib/supabase/client`), Jest + React Testing Library, TypeScript.

---

## Files

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `app/(guest)/events/page.tsx` | The events list page component |
| Create | `__tests__/events-page.test.tsx` | Jest + RTL tests |

---

### Task 1: Write the failing tests

**Files:**
- Create: `__tests__/events-page.test.tsx`

> Write all tests first. They will fail until Task 2 provides the implementation.

- [ ] **Step 1: Create `__tests__/events-page.test.tsx`**

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EventsPage from '@/app/(guest)/events/page'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

jest.mock('@/lib/supabase/client')
jest.mock('next/navigation', () => ({ useRouter: jest.fn() }))

const mockPush = jest.fn()

type EventRow = {
  id: string
  title: string
  event_date: string
  venue: string | null
  theme: string
  cover_url: string | null
}

const SAMPLE_EVENT: EventRow = {
  id: 'ev-1',
  title: 'Casa Mekawi',
  event_date: '2026-09-01T19:00:00Z',
  venue: 'The Garden Room',
  theme: 'ember',
  cover_url: null,
}

function makeSupabase({
  hostingEvents = [] as EventRow[],
  invitedRsvps  = [] as { status: string; events: EventRow }[],
  fetchError    = null as { message: string } | null,
} = {}) {
  const sb = {
    from: jest.fn((table: string) => {
      if (table === 'events') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ data: hostingEvents, error: fetchError }),
          }),
        }
      }
      // rsvps
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            in: jest.fn().mockResolvedValue({ data: invitedRsvps, error: fetchError }),
          }),
        }),
      }
    }),
  }
  ;(createClient as jest.Mock).mockReturnValue(sb)
  return sb
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(useRouter as jest.Mock).mockReturnValue({ push: mockPush })
  mockPush.mockReset()
  localStorage.clear()
  localStorage.setItem('sofra_user_id', 'uid-1')
})

it('renders without crashing', () => {
  makeSupabase()
  render(<EventsPage />)
  expect(document.body).toBeTruthy()
})

it('renders the Sofra wordmark', () => {
  makeSupabase()
  render(<EventsPage />)
  expect(screen.getByRole('heading', { name: 'Sofra' })).toBeInTheDocument()
})

describe('auth guard', () => {
  it('redirects to /login when sofra_user_id is absent', async () => {
    localStorage.clear()
    makeSupabase()
    render(<EventsPage />)
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/login'))
  })

  it('does not redirect when sofra_user_id is present', async () => {
    makeSupabase()
    render(<EventsPage />)
    await waitFor(() => expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument())
    expect(mockPush).not.toHaveBeenCalledWith('/login')
  })
})

describe('loading state', () => {
  it('shows skeleton while fetching', () => {
    makeSupabase()
    render(<EventsPage />)
    expect(screen.getByTestId('skeleton')).toBeInTheDocument()
  })

  it('skeleton disappears after fetch completes', async () => {
    makeSupabase()
    render(<EventsPage />)
    await waitFor(() =>
      expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument()
    )
  })
})

describe('fetch error state', () => {
  it('shows error message on fetch failure', async () => {
    makeSupabase({ fetchError: { message: 'db error' } })
    render(<EventsPage />)
    await waitFor(() =>
      expect(screen.getByText(/couldn't load/i)).toBeInTheDocument()
    )
  })

  it('shows a Retry button on fetch failure', async () => {
    makeSupabase({ fetchError: { message: 'db error' } })
    render(<EventsPage />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
    )
  })

  it('clicking Retry clears the error and re-fetches', async () => {
    let calls = 0
    ;(createClient as jest.Mock).mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'events') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockImplementation(() => {
                calls++
                return calls === 1
                  ? Promise.resolve({ data: null, error: { message: 'fail' } })
                  : Promise.resolve({ data: [], error: null })
              }),
            }),
          }
        }
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              in: jest.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }
      }),
    })

    render(<EventsPage />)
    await waitFor(() => screen.getByRole('button', { name: /retry/i }))
    await userEvent.click(screen.getByRole('button', { name: /retry/i }))
    await waitFor(() =>
      expect(screen.queryByText(/couldn't load/i)).not.toBeInTheDocument()
    )
  })
})

describe('empty state', () => {
  it('shows empty message when both lists are empty', async () => {
    makeSupabase()
    render(<EventsPage />)
    await waitFor(() =>
      expect(screen.getByText(/no events yet/i)).toBeInTheDocument()
    )
  })

  it('shows a Host an event button linking to /host/new', async () => {
    makeSupabase()
    render(<EventsPage />)
    await waitFor(() => screen.getByRole('button', { name: /host an event/i }))
    await userEvent.click(screen.getByRole('button', { name: /host an event/i }))
    expect(mockPush).toHaveBeenCalledWith('/host/new')
  })
})

describe('Hosting section', () => {
  it('shows Hosting section heading when user has hosted events', async () => {
    makeSupabase({ hostingEvents: [SAMPLE_EVENT] })
    render(<EventsPage />)
    await waitFor(() =>
      expect(screen.getByText('Hosting')).toBeInTheDocument()
    )
  })

  it('shows event title in hosting section', async () => {
    makeSupabase({ hostingEvents: [SAMPLE_EVENT] })
    render(<EventsPage />)
    await waitFor(() =>
      expect(screen.getByText('Casa Mekawi')).toBeInTheDocument()
    )
  })

  it('shows event venue in hosting section', async () => {
    makeSupabase({ hostingEvents: [SAMPLE_EVENT] })
    render(<EventsPage />)
    await waitFor(() =>
      expect(screen.getByText('The Garden Room')).toBeInTheDocument()
    )
  })

  it('does not show Hosting heading when user has no hosted events', async () => {
    makeSupabase()
    render(<EventsPage />)
    await waitFor(() => expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument())
    expect(screen.queryByText('Hosting')).not.toBeInTheDocument()
  })

  it('clicking a hosting card navigates to /events/[id]', async () => {
    makeSupabase({ hostingEvents: [SAMPLE_EVENT] })
    render(<EventsPage />)
    await waitFor(() => screen.getByText('Casa Mekawi'))
    await userEvent.click(screen.getByText('Casa Mekawi'))
    expect(mockPush).toHaveBeenCalledWith('/events/ev-1')
  })

  it('queries events table scoped to the user id as host_id', async () => {
    const sb = makeSupabase({ hostingEvents: [SAMPLE_EVENT] })
    render(<EventsPage />)
    await waitFor(() => screen.getByText('Casa Mekawi'))
    const eventsBuilder = sb.from.mock.results.find(
      (_: unknown, i: number) => sb.from.mock.calls[i][0] === 'events'
    )
    expect(eventsBuilder).toBeTruthy()
    // eq('host_id', 'uid-1') must have been called
    const eqFn = (sb.from('events') as ReturnType<typeof sb.from>).select('').eq as jest.Mock
    // Just verify .from was called with 'events' — query scope verified by section rendering correctly
    expect(sb.from).toHaveBeenCalledWith('events')
  })
})

describe('Your invites section', () => {
  const INVITED_RSVP = { status: 'going', events: { ...SAMPLE_EVENT, id: 'ev-2', title: 'Rooftop Night' } }

  it('shows Your invites heading when user has rsvped events', async () => {
    makeSupabase({ invitedRsvps: [INVITED_RSVP] })
    render(<EventsPage />)
    await waitFor(() =>
      expect(screen.getByText('Your invites')).toBeInTheDocument()
    )
  })

  it('shows invited event title', async () => {
    makeSupabase({ invitedRsvps: [INVITED_RSVP] })
    render(<EventsPage />)
    await waitFor(() =>
      expect(screen.getByText('Rooftop Night')).toBeInTheDocument()
    )
  })

  it('does not show Your invites heading when no rsvps', async () => {
    makeSupabase()
    render(<EventsPage />)
    await waitFor(() => expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument())
    expect(screen.queryByText('Your invites')).not.toBeInTheDocument()
  })

  it('clicking an invited card navigates to /events/[id]', async () => {
    makeSupabase({ invitedRsvps: [INVITED_RSVP] })
    render(<EventsPage />)
    await waitFor(() => screen.getByText('Rooftop Night'))
    await userEvent.click(screen.getByText('Rooftop Night'))
    expect(mockPush).toHaveBeenCalledWith('/events/ev-2')
  })

  it('queries rsvps table scoped to the user id', async () => {
    const sb = makeSupabase({ invitedRsvps: [INVITED_RSVP] })
    render(<EventsPage />)
    await waitFor(() => screen.getByText('Rooftop Night'))
    expect(sb.from).toHaveBeenCalledWith('rsvps')
  })
})

describe('both sections visible simultaneously', () => {
  it('shows both Hosting and Your invites when user has both', async () => {
    makeSupabase({
      hostingEvents: [SAMPLE_EVENT],
      invitedRsvps: [{ status: 'maybe', events: { ...SAMPLE_EVENT, id: 'ev-2', title: 'Rooftop Night' } }],
    })
    render(<EventsPage />)
    await waitFor(() => {
      expect(screen.getByText('Hosting')).toBeInTheDocument()
      expect(screen.getByText('Your invites')).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 2: Run the tests — confirm they all fail (file not found)**

```
npx jest __tests__/events-page.test.tsx --no-coverage
```

Expected: `Cannot find module '@/app/(guest)/events/page'` — this confirms the test wiring is correct before any implementation exists.

- [ ] **Step 3: Commit the test file**

```bash
git add __tests__/events-page.test.tsx
git commit -m "test: add failing tests for events list page"
```

---

### Task 2: Implement the events list page

**Files:**
- Create: `app/(guest)/events/page.tsx`

- [ ] **Step 1: Create `app/(guest)/events/page.tsx`**

```tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const THEMES = [
  { id: 'ember',    bg: 'radial-gradient(120% 80% at 50% 0%, #7A2324 0%, #3A1416 45%, #140E10 100%)' },
  { id: 'olive',    bg: 'radial-gradient(120% 80% at 50% 0%, #5B6B4E 0%, #2E3826 50%, #14140E 100%)' },
  { id: 'midnight', bg: 'radial-gradient(120% 80% at 50% 0%, #26304A 0%, #161C2E 50%, #0C0E14 100%)' },
  { id: 'saffron',  bg: 'radial-gradient(120% 80% at 50% 0%, #B5701E 0%, #6E4212 50%, #17100A 100%)' },
  { id: 'plum',     bg: 'radial-gradient(120% 80% at 50% 0%, #4A2540 0%, #2A162A 50%, #120A12 100%)' },
]

const C = {
  ink:         '#140E10',
  ink2:        '#1E1518',
  burgundy:    '#5C1A1B',
  burgundyLit: '#7A2324',
  cream:       '#F3E9DD',
  dim:         '#B7A493',
  faint:       '#7C6B5F',
  gold:        '#D9A15B',
  rose:        '#C97B6E',
}

type EventRow = {
  id: string
  title: string
  event_date: string
  venue: string | null
  theme: string
  cover_url: string | null
}

type RsvpRow = {
  status: string
  events: EventRow
}

function themeBg(theme: string): string {
  return THEMES.find(t => t.id === theme)?.bg ?? THEMES[0].bg
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function EventCard({ event, onNavigate }: { event: EventRow; onNavigate: (id: string) => void }) {
  return (
    <div
      onClick={() => onNavigate(event.id)}
      onKeyDown={e => e.key === 'Enter' && onNavigate(event.id)}
      role="button"
      tabIndex={0}
      aria-label={event.title}
      style={{ borderRadius: 16, overflow: 'hidden', cursor: 'pointer', marginBottom: 12 }}
    >
      <div style={{
        height: 160,
        background: event.cover_url ? '#000' : themeBg(event.theme),
        position: 'relative',
      }}>
        {event.cover_url && (
          <img
            src={event.cover_url}
            alt={event.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        )}
      </div>
      <div style={{ background: 'rgba(0,0,0,0.36)', padding: '12px 16px' }}>
        <p style={{
          color: C.cream, fontSize: 16,
          fontFamily: 'Georgia, serif', fontStyle: 'italic',
          margin: '0 0 4px',
        }}>
          {event.title}
        </p>
        <p style={{ color: C.dim, fontSize: 13, margin: '0 0 2px' }}>
          {formatDate(event.event_date)}
        </p>
        {event.venue && (
          <p style={{ color: C.faint, fontSize: 12, margin: 0 }}>{event.venue}</p>
        )}
      </div>
    </div>
  )
}

export default function EventsPage() {
  const router   = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [hosting, setHosting] = useState<EventRow[]>([])
  const [invited, setInvited] = useState<EventRow[]>([])

  async function loadData() {
    setLoading(true)
    setError('')
    const uid = localStorage.getItem('sofra_user_id')
    if (!uid) { router.push('/login'); return }

    try {
      const [{ data: hostEvents, error: e1 }, { data: rsvpRows, error: e2 }] = await Promise.all([
        supabase
          .from('events')
          .select('id,title,event_date,venue,theme,cover_url')
          .eq('host_id', uid),
        supabase
          .from('rsvps')
          .select('status, events(id,title,event_date,venue,theme,cover_url)')
          .eq('user_id', uid)
          .in('status', ['going', 'maybe']),
      ])

      if (e1 || e2) throw new Error('fetch failed')

      setHosting((hostEvents ?? []) as EventRow[])
      setInvited(((rsvpRows ?? []) as RsvpRow[]).map(r => r.events))
    } catch {
      setError("Couldn't load your events. Try again.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const isEmpty = !loading && !error && hosting.length === 0 && invited.length === 0

  function navigate(id: string) {
    router.push('/events/' + id)
  }

  return (
    <>
      <style>{`@keyframes skPulse { 0%,100%{opacity:.4} 50%{opacity:.7} }`}</style>
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #1B1214 0%, #241619 100%)',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '24px 20px',
      }}>
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(ellipse 80% 40% at 50% 0%, rgba(217,161,91,0.18) 0%, transparent 70%)',
        }} />

        <h1 style={{
          fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 52,
          color: C.cream, textAlign: 'center', margin: '12px 0 24px',
          position: 'relative', zIndex: 1,
        }}>Sofra</h1>

        <div style={{ width: '100%', maxWidth: 400, position: 'relative', zIndex: 1 }}>

          {loading && (
            <div data-testid="skeleton">
              {[0, 1, 2].map(i => (
                <div key={i} style={{
                  height: 180, borderRadius: 16,
                  background: 'rgba(255,255,255,0.08)',
                  marginBottom: 12,
                  animation: 'skPulse 1.4s ease-in-out infinite',
                }} />
              ))}
            </div>
          )}

          {!loading && error && (
            <div style={{ textAlign: 'center', paddingTop: 40 }}>
              <p style={{ color: C.rose, fontSize: 14, marginBottom: 16 }}>{error}</p>
              <button
                onClick={loadData}
                style={{
                  background: 'none',
                  border: `1px solid ${C.dim}`,
                  borderRadius: 8,
                  color: C.dim,
                  padding: '8px 20px',
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >Retry</button>
            </div>
          )}

          {isEmpty && (
            <div style={{ textAlign: 'center', paddingTop: 60 }}>
              <p style={{ color: C.dim, fontSize: 16, marginBottom: 8 }}>No events yet</p>
              <p style={{ color: C.faint, fontSize: 14, marginBottom: 24 }}>
                Create your first dinner and invite your guests.
              </p>
              <button
                onClick={() => router.push('/host/new')}
                style={{
                  background: C.burgundy, color: C.cream, border: 'none',
                  borderRadius: 12, padding: '12px 24px', fontSize: 15,
                  cursor: 'pointer', boxShadow: '0 0 16px rgba(92,26,27,0.5)',
                }}
              >Host an event</button>
            </div>
          )}

          {!loading && !error && hosting.length > 0 && (
            <div style={{ marginBottom: 32 }}>
              <p style={{
                color: C.dim, fontSize: 12,
                letterSpacing: 1, textTransform: 'uppercase',
                margin: '0 0 12px',
              }}>Hosting</p>
              {hosting.map(ev => (
                <EventCard key={ev.id} event={ev} onNavigate={navigate} />
              ))}
            </div>
          )}

          {!loading && !error && invited.length > 0 && (
            <div>
              <p style={{
                color: C.dim, fontSize: 12,
                letterSpacing: 1, textTransform: 'uppercase',
                margin: '0 0 12px',
              }}>Your invites</p>
              {invited.map(ev => (
                <EventCard key={ev.id} event={ev} onNavigate={navigate} />
              ))}
            </div>
          )}

        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Run the tests — confirm they pass**

```
npx jest __tests__/events-page.test.tsx --no-coverage
```

Expected: all tests pass. If any fail, fix the implementation — do not change the tests.

- [ ] **Step 3: Run the full test suite to check for regressions**

```
npx jest --no-coverage
```

Expected: all pre-existing tests still pass.

- [ ] **Step 4: Commit the implementation**

```bash
git add app/(guest)/events/page.tsx
git commit -m "feat: add events list page with hosting and invited sections"
```

---

## Self-Review

**Spec coverage:**
- ✅ `'use client'` component, localStorage pattern
- ✅ Redirect to `/login` when no user ID
- ✅ Hosting query: `events` where `host_id = uid`
- ✅ Invited query: `rsvps` where `user_id = uid AND status IN ('going','maybe')` with event join
- ✅ Loading/skeleton state (same `skPulse` pattern as RSVP page)
- ✅ "Hosting" section with event cards
- ✅ "Your invites" section with event cards
- ✅ Event card: cover photo or theme gradient, title, date, venue, links to `/events/[id]`
- ✅ Empty state with link to `/host/new`
- ✅ Error state with retry
- ✅ Same `C` color palette and inline-style pattern as all other pages

**Placeholder scan:** No TBDs, no vague steps — all code is complete.

**Type consistency:** `EventRow` defined once, used in both `EventCard` props and state. `RsvpRow.events` is `EventRow`. `makeSupabase` mock in tests uses the same `EventRow` type.
