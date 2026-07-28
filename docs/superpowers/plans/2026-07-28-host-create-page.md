# Host Create Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `app/(host)/host/new/page.tsx` — a single-page form for creating a Sofra event with title, tagline, date, venue, dress code, a five-swatch theme picker, and optional cover photo upload to Supabase Storage, with live preview as the invite background.

**Architecture:** Single `'use client'` file, no sub-components. Cover file held in a ref (no re-render); preview URL held in state (triggers cover button re-render). On submit: upload cover photo if picked → get public URL → insert `events` row → redirect to `/events/[id]`. Upload failure aborts before any DB write. Inline errors on both failure paths; `submitting` resets on error only — redirect handles cleanup on success.

**Tech Stack:** Next.js 14 App Router, `@supabase/ssr` browser client, React Testing Library + Jest 30 + `jest-environment-jsdom`

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `app/(host)/host/new/page.tsx` | The host create page — all state, UI, submit logic |
| Create | `__tests__/host-new-page.test.tsx` | RTL tests — auth redirect, cover button, swatches, field gating, submit flow |

---

### Task 1: Page scaffold, auth guard, page chrome

**Files:**
- Create: `__tests__/host-new-page.test.tsx`
- Create: `app/(host)/host/new/page.tsx`

- [ ] **Step 1: Write failing tests**

Create `__tests__/host-new-page.test.tsx`:

```tsx
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import HostNewPage from '@/app/(host)/host/new/page'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

jest.mock('@/lib/supabase/client')
jest.mock('next/navigation', () => ({ useRouter: jest.fn() }))

const mockPush = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  ;(useRouter as jest.Mock).mockReturnValue({ push: mockPush })
  global.URL.createObjectURL = jest.fn(() => 'mock-object-url')
})

function makeSupabase({
  user        = { id: 'uid-1' } as { id: string } | null,
  uploadError = null as { message: string } | null,
  insertError = null as { message: string } | null,
  insertedId  = 'new-event-id',
} = {}) {
  const upload       = jest.fn().mockResolvedValue({ error: uploadError })
  const getPublicUrl = jest.fn().mockReturnValue({ data: { publicUrl: 'https://cdn.example.com/photo.jpg' } })
  const single       = jest.fn().mockResolvedValue({ data: { id: insertedId }, error: insertError })
  const select       = jest.fn().mockReturnValue({ single })
  const insert       = jest.fn().mockReturnValue({ select })

  const sb = {
    auth:    { getUser: jest.fn().mockResolvedValue({ data: { user } }) },
    storage: { from: jest.fn().mockReturnValue({ upload, getPublicUrl }) },
    from:    jest.fn().mockReturnValue({ insert }),
    upload, getPublicUrl, insert, select, single,
  }
  ;(createClient as jest.Mock).mockReturnValue(sb)
  return sb
}

it('renders without crashing', () => {
  makeSupabase()
  render(<HostNewPage />)
  expect(document.body).toBeTruthy()
})

it('renders the Sofra wordmark', () => {
  makeSupabase()
  render(<HostNewPage />)
  expect(screen.getByRole('heading', { name: 'Sofra' })).toBeInTheDocument()
})

it('renders the back link', () => {
  makeSupabase()
  render(<HostNewPage />)
  expect(screen.getByRole('button', { name: /← Events/i })).toBeInTheDocument()
})

it('redirects to /login when user is null', async () => {
  makeSupabase({ user: null })
  render(<HostNewPage />)
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/login'))
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```
npx jest __tests__/host-new-page.test.tsx --no-coverage
```

Expected: FAIL — `Cannot find module '@/app/(host)/host/new/page'`

- [ ] **Step 3: Create the page scaffold**

Create `app/(host)/host/new/page.tsx`:

```tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const THEMES = [
  { id: 'ember',    name: 'Ember',    bg: 'radial-gradient(120% 80% at 50% 0%, #7A2324 0%, #3A1416 45%, #140E10 100%)', accent: '#D9A15B' },
  { id: 'olive',    name: 'Olive',    bg: 'radial-gradient(120% 80% at 50% 0%, #5B6B4E 0%, #2E3826 50%, #14140E 100%)', accent: '#D9C05B' },
  { id: 'midnight', name: 'Midnight', bg: 'radial-gradient(120% 80% at 50% 0%, #26304A 0%, #161C2E 50%, #0C0E14 100%)', accent: '#C97B6E' },
  { id: 'saffron',  name: 'Saffron',  bg: 'radial-gradient(120% 80% at 50% 0%, #B5701E 0%, #6E4212 50%, #17100A 100%)', accent: '#F3D9A0' },
  { id: 'plum',     name: 'Plum',     bg: 'radial-gradient(120% 80% at 50% 0%, #4A2540 0%, #2A162A 50%, #120A12 100%)', accent: '#D98FB0' },
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

export default function HostNewPage() {
  const router       = useRouter()
  const supabase     = createClient()
  const uidRef       = useRef<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const coverFileRef = useRef<File | null>(null)

  const [theme,      setTheme]      = useState('ember')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [title,      setTitle]      = useState('')
  const [tagline,    setTagline]    = useState('')
  const [date,       setDate]       = useState('')
  const [venue,      setVenue]      = useState('')
  const [dressCode,  setDressCode]  = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState('')

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      uidRef.current = user.id
    }
    init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <style>{`
        input:focus { outline: none; border-color: #D9A15B; }
        input[type="datetime-local"]::-webkit-calendar-picker-indicator { filter: invert(0.6); }
      `}</style>
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

        <button
          onClick={() => router.push('/events')}
          style={{
            background: 'none', border: 'none', color: C.dim,
            alignSelf: 'flex-start', fontSize: 14,
            position: 'relative', zIndex: 1, cursor: 'pointer', padding: 0,
          }}
        >← Events</button>

        <h1 style={{
          fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 52,
          color: C.cream, textAlign: 'center', margin: '12px 0 24px',
          position: 'relative', zIndex: 1,
        }}>Sofra</h1>

        <div style={{
          width: '100%', maxWidth: 400,
          position: 'relative', zIndex: 1,
          display: 'flex', flexDirection: 'column', gap: 24,
        }}>
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```
npx jest __tests__/host-new-page.test.tsx --no-coverage
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add "app/(host)/host/new/page.tsx" "__tests__/host-new-page.test.tsx"
git commit -m "feat: scaffold host create page with auth guard and page chrome"
```

---

### Task 2: Cover button and file pick handler

**Files:**
- Modify: `__tests__/host-new-page.test.tsx` — append cover button tests
- Modify: `app/(host)/host/new/page.tsx` — add cover button to content div

- [ ] **Step 1: Write failing tests**

Append to `__tests__/host-new-page.test.tsx`:

```tsx
describe('cover button', () => {
  it('shows "Upload cover photo" initially', () => {
    makeSupabase()
    render(<HostNewPage />)
    expect(screen.getByText('Upload cover photo')).toBeInTheDocument()
  })

  it('shows "Recommended 1:1" badge initially', () => {
    makeSupabase()
    render(<HostNewPage />)
    expect(screen.getByText('Recommended 1:1')).toBeInTheDocument()
  })

  it('shows "Change photo" badge and hides upload prompt after file is picked', async () => {
    makeSupabase()
    render(<HostNewPage />)
    const file  = new File(['img'], 'photo.jpg', { type: 'image/jpeg' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, file)
    expect(screen.getByText('Change photo')).toBeInTheDocument()
    expect(screen.queryByText('Upload cover photo')).not.toBeInTheDocument()
  })

  it('calls URL.createObjectURL with the picked file', async () => {
    makeSupabase()
    render(<HostNewPage />)
    const file  = new File(['img'], 'photo.jpg', { type: 'image/jpeg' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, file)
    expect(global.URL.createObjectURL).toHaveBeenCalledWith(file)
  })
})
```

- [ ] **Step 2: Run tests to confirm new tests fail**

```
npx jest __tests__/host-new-page.test.tsx --no-coverage
```

Expected: 4 PASS, 4 new FAIL — `Unable to find element with text: Upload cover photo`

- [ ] **Step 3: Add cover button and file pick handler to the page**

In `app/(host)/host/new/page.tsx`:

Add `onFilePick` inside `HostNewPage`, before the `return` statement:

```tsx
  function onFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    coverFileRef.current = file
    setPreviewUrl(URL.createObjectURL(file))
  }
```

Replace the empty content `<div>` body with:

```tsx
        <div style={{
          width: '100%', maxWidth: 400,
          position: 'relative', zIndex: 1,
          display: 'flex', flexDirection: 'column', gap: 24,
        }}>

          {/* Cover button */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                width: '100%', height: 240, borderRadius: 16, overflow: 'hidden',
                background: previewUrl
                  ? '#000'
                  : (THEMES.find(t => t.id === theme) ?? THEMES[0]).bg,
                border: 'none', cursor: 'pointer',
                display: 'block', position: 'relative',
              }}
            >
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="cover"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <>
                  <div style={{
                    position: 'absolute', inset: 0, pointerEvents: 'none',
                    background: 'radial-gradient(ellipse 80% 40% at 50% 0%, rgba(217,161,91,0.18) 0%, transparent 70%)',
                  }} />
                  <div style={{
                    position: 'absolute', inset: 0,
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}>
                    <span style={{ fontSize: 28, color: C.dim }}>＋</span>
                    <span style={{ fontSize: 14, color: C.dim }}>Upload cover photo</span>
                  </div>
                </>
              )}
              <div style={{
                position: 'absolute', bottom: 10, left: 10,
                background: 'rgba(0,0,0,0.45)', borderRadius: 999,
                padding: '3px 10px', fontSize: 12, color: C.cream,
              }}>
                {previewUrl ? 'Change photo' : 'Recommended 1:1'}
              </div>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={onFilePick}
            />
          </div>

        </div>
```

- [ ] **Step 4: Run tests to confirm all 8 pass**

```
npx jest __tests__/host-new-page.test.tsx --no-coverage
```

Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add "app/(host)/host/new/page.tsx" "__tests__/host-new-page.test.tsx"
git commit -m "feat: add cover button with live preview and file pick handler"
```

---

### Task 3: Theme swatches

**Files:**
- Modify: `__tests__/host-new-page.test.tsx` — append swatch tests
- Modify: `app/(host)/host/new/page.tsx` — add swatch row after cover button

- [ ] **Step 1: Write failing tests**

Append to `__tests__/host-new-page.test.tsx`:

```tsx
describe('theme swatches', () => {
  it('renders all five theme names', () => {
    makeSupabase()
    render(<HostNewPage />)
    for (const name of ['Ember', 'Olive', 'Midnight', 'Saffron', 'Plum']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
  })

  it('Ember swatch is pre-selected on first render', () => {
    makeSupabase()
    render(<HostNewPage />)
    expect(screen.getByRole('button', { name: 'Ember' })).toHaveAttribute('data-selected', 'true')
  })

  it('clicking Olive makes it selected and deselects Ember', async () => {
    makeSupabase()
    render(<HostNewPage />)
    await userEvent.click(screen.getByRole('button', { name: 'Olive' }))
    expect(screen.getByRole('button', { name: 'Olive' })).toHaveAttribute('data-selected', 'true')
    expect(screen.getByRole('button', { name: 'Ember' })).toHaveAttribute('data-selected', 'false')
  })
})
```

- [ ] **Step 2: Run tests to confirm new tests fail**

```
npx jest __tests__/host-new-page.test.tsx --no-coverage
```

Expected: 8 PASS, 3 new FAIL — `Unable to find role="button" with name "Ember"`

- [ ] **Step 3: Add swatch row after the cover button div**

In `app/(host)/host/new/page.tsx`, add the following block inside the content `<div>`, immediately after the `{/* Cover button */}` div:

```tsx
          {/* Theme swatches */}
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
            {THEMES.map(t => {
              const selected = theme === t.id
              return (
                <button
                  key={t.id}
                  data-selected={selected}
                  onClick={() => setTheme(t.id)}
                  style={{
                    minWidth: 88, height: 60, borderRadius: 14,
                    background: t.bg, border: 'none', cursor: 'pointer',
                    flexShrink: 0,
                    outline: selected ? `2px solid ${t.accent}` : '2px solid transparent',
                    outlineOffset: 2,
                    display: 'flex', alignItems: 'flex-end',
                    justifyContent: 'center', paddingBottom: 8,
                  }}
                >
                  <span style={{ fontSize: 12, color: C.cream }}>{t.name}</span>
                </button>
              )
            })}
          </div>
```

- [ ] **Step 4: Run tests to confirm all 11 pass**

```
npx jest __tests__/host-new-page.test.tsx --no-coverage
```

Expected: PASS (11 tests)

- [ ] **Step 5: Commit**

```bash
git add "app/(host)/host/new/page.tsx" "__tests__/host-new-page.test.tsx"
git commit -m "feat: add theme swatch picker with ember pre-selected"
```

---

### Task 4: Form fields and Publish button disabled logic

**Files:**
- Modify: `__tests__/host-new-page.test.tsx` — append form field and button gating tests
- Modify: `app/(host)/host/new/page.tsx` — add 5 labeled inputs, stub handleSubmit, Publish button

- [ ] **Step 1: Write failing tests**

Append to `__tests__/host-new-page.test.tsx`:

```tsx
describe('form fields', () => {
  it('renders title, tagline, venue, and dress code text inputs', () => {
    makeSupabase()
    render(<HostNewPage />)
    expect(screen.getByRole('textbox', { name: /title/i })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /tagline/i })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /venue/i })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /dress code/i })).toBeInTheDocument()
  })

  it('renders the date & time input', () => {
    makeSupabase()
    render(<HostNewPage />)
    expect(screen.getByTestId('date-input')).toBeInTheDocument()
  })

  it('Publish invite button is disabled when title and date are empty', () => {
    makeSupabase()
    render(<HostNewPage />)
    expect(screen.getByRole('button', { name: /publish invite/i })).toBeDisabled()
  })

  it('Publish invite button is disabled when only title is filled', async () => {
    makeSupabase()
    render(<HostNewPage />)
    await userEvent.type(screen.getByRole('textbox', { name: /title/i }), 'Test Dinner')
    expect(screen.getByRole('button', { name: /publish invite/i })).toBeDisabled()
  })

  it('Publish invite button is disabled when only date is filled', () => {
    makeSupabase()
    render(<HostNewPage />)
    fireEvent.change(screen.getByTestId('date-input'), { target: { value: '2026-08-01T19:00' } })
    expect(screen.getByRole('button', { name: /publish invite/i })).toBeDisabled()
  })

  it('Publish invite button is enabled when title and date are both filled', async () => {
    makeSupabase()
    render(<HostNewPage />)
    await userEvent.type(screen.getByRole('textbox', { name: /title/i }), 'Test Dinner')
    fireEvent.change(screen.getByTestId('date-input'), { target: { value: '2026-08-01T19:00' } })
    expect(screen.getByRole('button', { name: /publish invite/i })).not.toBeDisabled()
  })
})
```

- [ ] **Step 2: Run tests to confirm new tests fail**

```
npx jest __tests__/host-new-page.test.tsx --no-coverage
```

Expected: 11 PASS, 6 new FAIL — `Unable to find role="textbox" with name /title/i`

- [ ] **Step 3: Add form fields, stub handleSubmit, and Publish button**

In `app/(host)/host/new/page.tsx`, add the `handleSubmit` stub inside `HostNewPage` before the `return` statement. Also add `onFilePick` if not already there from Task 2:

```tsx
  async function handleSubmit() {}
```

Then add the form fields and button inside the content `<div>`, after the swatches div:

```tsx
          {/* Form fields */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            <div>
              <p style={{ color: C.dim, fontSize: 12, margin: '0 0 6px' }}>Title</p>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Dinner at Casa Mekawi"
                aria-label="Title"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: 'rgba(0,0,0,0.24)',
                  border: '1px solid rgba(243,233,221,0.16)',
                  borderRadius: 14, padding: '12px 16px',
                  color: C.cream, fontSize: 14,
                }}
              />
            </div>

            <div>
              <p style={{ color: C.dim, fontSize: 12, margin: '0 0 6px' }}>Tagline</p>
              <input
                type="text"
                value={tagline}
                onChange={e => setTagline(e.target.value)}
                placeholder="A night of good food and conversation"
                aria-label="Tagline"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: 'rgba(0,0,0,0.24)',
                  border: '1px solid rgba(243,233,221,0.16)',
                  borderRadius: 14, padding: '12px 16px',
                  color: C.cream, fontSize: 14,
                }}
              />
            </div>

            <div>
              <p style={{ color: C.dim, fontSize: 12, margin: '0 0 6px' }}>Date & Time</p>
              <input
                type="datetime-local"
                value={date}
                onChange={e => setDate(e.target.value)}
                data-testid="date-input"
                aria-label="Date & Time"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: 'rgba(0,0,0,0.24)',
                  border: '1px solid rgba(243,233,221,0.16)',
                  borderRadius: 14, padding: '12px 16px',
                  color: C.cream, fontSize: 14,
                  colorScheme: 'dark',
                }}
              />
            </div>

            <div>
              <p style={{ color: C.dim, fontSize: 12, margin: '0 0 6px' }}>Venue</p>
              <input
                type="text"
                value={venue}
                onChange={e => setVenue(e.target.value)}
                placeholder="The Garden Room, San Francisco"
                aria-label="Venue"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: 'rgba(0,0,0,0.24)',
                  border: '1px solid rgba(243,233,221,0.16)',
                  borderRadius: 14, padding: '12px 16px',
                  color: C.cream, fontSize: 14,
                }}
              />
            </div>

            <div>
              <p style={{ color: C.dim, fontSize: 12, margin: '0 0 6px' }}>Dress code</p>
              <input
                type="text"
                value={dressCode}
                onChange={e => setDressCode(e.target.value)}
                placeholder="Smart casual"
                aria-label="Dress code"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: 'rgba(0,0,0,0.24)',
                  border: '1px solid rgba(243,233,221,0.16)',
                  borderRadius: 14, padding: '12px 16px',
                  color: C.cream, fontSize: 14,
                }}
              />
            </div>

          </div>

          {/* Publish button */}
          <div>
            <button
              onClick={handleSubmit}
              disabled={!title || !date || submitting}
              style={{
                width: '100%', padding: '14px', borderRadius: 12,
                background: C.burgundy, color: C.cream, border: 'none',
                fontSize: 16,
                cursor: !title || !date ? 'default' : 'pointer',
                opacity: !title || !date || submitting ? 0.5 : 1,
                boxShadow: '0 0 16px rgba(92,26,27,0.5)',
              }}
            >Publish invite</button>

            {error && (
              <p style={{ color: C.rose, fontSize: 13, textAlign: 'center', marginTop: 12 }}>
                {error}
              </p>
            )}
          </div>
```

- [ ] **Step 4: Run tests to confirm all 17 pass**

```
npx jest __tests__/host-new-page.test.tsx --no-coverage
```

Expected: PASS (17 tests)

- [ ] **Step 5: Commit**

```bash
git add "app/(host)/host/new/page.tsx" "__tests__/host-new-page.test.tsx"
git commit -m "feat: add form fields and Publish invite button with disabled gating"
```

---

### Task 5: Submit handler — upload, insert, redirect

**Files:**
- Modify: `__tests__/host-new-page.test.tsx` — append submit flow tests
- Modify: `app/(host)/host/new/page.tsx` — replace stub handleSubmit with full implementation

- [ ] **Step 1: Write failing tests**

Append to `__tests__/host-new-page.test.tsx`:

```tsx
// Helper: fill required fields so the Publish invite button is enabled
async function fillRequired() {
  await userEvent.type(screen.getByRole('textbox', { name: /title/i }), 'Test Dinner')
  fireEvent.change(screen.getByTestId('date-input'), { target: { value: '2026-08-01T19:00' } })
}

describe('submit handler', () => {
  it('does not call storage.upload when no cover file was picked', async () => {
    const sb = makeSupabase()
    render(<HostNewPage />)
    await fillRequired()
    await userEvent.click(screen.getByRole('button', { name: /publish invite/i }))
    await waitFor(() => expect(mockPush).toHaveBeenCalled())
    expect(sb.upload).not.toHaveBeenCalled()
  })

  it('calls storage.upload when a cover file was picked', async () => {
    const sb = makeSupabase()
    render(<HostNewPage />)
    const file  = new File(['img'], 'photo.jpg', { type: 'image/jpeg' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, file)
    await fillRequired()
    await userEvent.click(screen.getByRole('button', { name: /publish invite/i }))
    await waitFor(() => expect(mockPush).toHaveBeenCalled())
    expect(sb.upload).toHaveBeenCalledWith(
      expect.stringMatching(/^uid-1\/.+\.jpg$/),
      file
    )
  })

  it('shows upload error and does not call insert when upload fails', async () => {
    const sb = makeSupabase({ uploadError: { message: 'network error' } })
    render(<HostNewPage />)
    const file  = new File(['img'], 'photo.jpg', { type: 'image/jpeg' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, file)
    await fillRequired()
    await userEvent.click(screen.getByRole('button', { name: /publish invite/i }))
    await waitFor(() =>
      expect(screen.getByText(/photo upload failed/i)).toBeInTheDocument()
    )
    expect(sb.insert).not.toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('inserts event row with correct column values and redirects on success', async () => {
    const sb = makeSupabase()
    render(<HostNewPage />)
    await userEvent.type(screen.getByRole('textbox', { name: /title/i }), 'Test Dinner')
    await userEvent.type(screen.getByRole('textbox', { name: /tagline/i }), 'A cozy evening')
    fireEvent.change(screen.getByTestId('date-input'), { target: { value: '2026-08-01T19:00' } })
    await userEvent.type(screen.getByRole('textbox', { name: /venue/i }), 'The Garden Room')
    await userEvent.type(screen.getByRole('textbox', { name: /dress code/i }), 'Smart casual')
    await userEvent.click(screen.getByRole('button', { name: /publish invite/i }))
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/events/new-event-id'))
    expect(sb.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        host_id:    'uid-1',
        title:      'Test Dinner',
        tagline:    'A cozy evening',
        event_date: new Date('2026-08-01T19:00').toISOString(),
        venue:      'The Garden Room',
        dress_code: 'Smart casual',
        theme:      'ember',
        cover_url:  null,
      })
    )
  })

  it('shows insert error and does not redirect when insert fails', async () => {
    makeSupabase({ insertError: { message: 'db error' } })
    render(<HostNewPage />)
    await fillRequired()
    await userEvent.click(screen.getByRole('button', { name: /publish invite/i }))
    await waitFor(() =>
      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument()
    )
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('uses the storage public URL as cover_url when a cover is uploaded', async () => {
    const sb = makeSupabase()
    render(<HostNewPage />)
    const file  = new File(['img'], 'photo.jpg', { type: 'image/jpeg' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, file)
    await fillRequired()
    await userEvent.click(screen.getByRole('button', { name: /publish invite/i }))
    await waitFor(() => expect(mockPush).toHaveBeenCalled())
    expect(sb.insert).toHaveBeenCalledWith(
      expect.objectContaining({ cover_url: 'https://cdn.example.com/photo.jpg' })
    )
  })

  it('empty optional fields are inserted as null not empty string', async () => {
    const sb = makeSupabase()
    render(<HostNewPage />)
    await fillRequired()
    await userEvent.click(screen.getByRole('button', { name: /publish invite/i }))
    await waitFor(() => expect(mockPush).toHaveBeenCalled())
    expect(sb.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tagline:    null,
        venue:      null,
        dress_code: null,
      })
    )
  })
})
```

- [ ] **Step 2: Run tests to confirm new tests fail**

```
npx jest __tests__/host-new-page.test.tsx --no-coverage
```

Expected: 17 PASS, 7 new FAIL — tests fail because `handleSubmit` is a no-op stub

- [ ] **Step 3: Replace stub handleSubmit with full implementation**

In `app/(host)/host/new/page.tsx`, replace `async function handleSubmit() {}` with:

```tsx
  async function handleSubmit() {
    if (!uidRef.current || submitting) return
    setSubmitting(true)
    setError('')

    let publicUrl: string | null = null
    if (coverFileRef.current) {
      const file = coverFileRef.current
      const ext  = file.name.split('.').pop() ?? 'jpg'
      const path = `${uidRef.current}/${crypto.randomUUID()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('covers')
        .upload(path, file)

      if (uploadError) {
        setError('Photo upload failed. Please try again.')
        setSubmitting(false)
        return
      }

      publicUrl = supabase.storage
        .from('covers')
        .getPublicUrl(path).data.publicUrl
    }

    const { data, error: insertError } = await supabase
      .from('events')
      .insert({
        host_id:    uidRef.current,
        title,
        tagline:    tagline   || null,
        event_date: new Date(date).toISOString(),
        venue:      venue     || null,
        dress_code: dressCode || null,
        theme,
        cover_url:  publicUrl,
      })
      .select('id')
      .single()

    if (insertError) {
      setError('Something went wrong. Please try again.')
      setSubmitting(false)
      return
    }

    router.push('/events/' + data!.id)
  }
```

- [ ] **Step 4: Run the host create tests to confirm all 24 pass**

```
npx jest __tests__/host-new-page.test.tsx --no-coverage
```

Expected: PASS (24 tests)

- [ ] **Step 5: Run the full test suite to confirm no regressions**

```
npx jest --no-coverage
```

Expected: All tests pass across both `host-new-page.test.tsx` and `rsvp-page.test.tsx`

- [ ] **Step 6: Commit**

```bash
git add "app/(host)/host/new/page.tsx" "__tests__/host-new-page.test.tsx"
git commit -m "feat: add submit handler — upload then insert then redirect with inline error paths"
```
