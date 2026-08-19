# Host Update Messages ("Send an update") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a host (or accepted co-host) compose a shareable text update about their event — a photos reminder, a date/time/location update, or a from-scratch message — and copy it or hand it to WhatsApp. Sofra never sends anything itself.

**Architecture:** One pure template-builder module (`lib/event-updates.ts`, no React/Supabase dependency) produces the pre-filled message text. A new host-only page (`app/(guest)/events/[id]/update/page.tsx`) loads the event, gate-checks access with the existing `isEventManager` helper, and wires the templates into an editable textarea with copy/WhatsApp actions — mirroring the existing `copyInviteLink`/`shareViaWhatsApp` pattern in `EventDetailClient.tsx`. A new `SEND AN UPDATE` button on the event page (`EventPaper.tsx`) links to it.

**Tech Stack:** Next.js (App Router, client components), TypeScript, Supabase JS client, Jest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-20-event-update-messages-design.md`

**⚠️ Concurrent work in this repo:** `git status` shows an in-progress Next.js 15 async-`params` migration touching many page files right now (new `lib/next-params.ts` / `useUnwrappedParams` helper, `params` typed as `Promise<{ id: string }>`, `tsconfig.json` now excludes `__tests__` from type-checking). This plan is written against that migration's *current* state as of 2026-08-20. **Before starting Task 3**, re-check `app/(guest)/events/[id]/chat/page.tsx` and `app/(chef)/events/[id]/table/page.tsx` still use the `useUnwrappedParams(paramsPromise)` pattern shown below — if that's changed further, follow whatever the current pattern is instead of what's written here.

---

## File Structure

- **Create:** `lib/event-updates.ts` — pure `buildUpdateMessage()` template builder.
- **Create:** `__tests__/event-updates.test.ts` — unit tests for the builder.
- **Modify:** `components/sofra-v2/EventPaper.tsx` — add `onSendUpdate` prop and `SEND AN UPDATE` button.
- **Modify:** `app/(guest)/events/[id]/EventDetailClient.tsx` — wire `onSendUpdate` to navigate to `/events/[id]/update`.
- **Modify:** `__tests__/event-detail-page.test.tsx` — cover the new button.
- **Modify:** `components/sofra-v2/sofra-v2.css` — one layout tweak for the 3-button share row, plus new rules for the update page.
- **Create:** `app/(guest)/events/[id]/update/page.tsx` — the compose page.
- **Create:** `__tests__/event-update-page.test.tsx` — page-level tests.

---

### Task 1: Template builder module

**Files:**
- Create: `lib/event-updates.ts`
- Test: `__tests__/event-updates.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/event-updates.test.ts`:

```ts
import { buildUpdateMessage, type UpdateEventInput } from '@/lib/event-updates'

const INVITE_URL = 'https://sofra.app/events/ev-1'
const ALBUM_URL = 'https://sofra.app/events/ev-1/album'

const DECIDED_EVENT: UpdateEventInput = {
  title: "Layla's Long Table",
  event_date: '2027-08-11T19:00:00.000Z',
  venue: 'Krasi',
  address: '48 Gloucester St, Boston',
}

const UNDECIDED_EVENT: UpdateEventInput = {
  title: "Layla's Long Table",
  event_date: '9999-12-31T12:00:00.000Z',
  venue: null,
  address: null,
}

function expectedDateTime(iso: string): string {
  const date = new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
  const time = new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return `${date} at ${time}`
}

describe('buildUpdateMessage', () => {
  it('builds the photos template with the album link and the invite link', () => {
    const result = buildUpdateMessage('photos', DECIDED_EVENT, INVITE_URL, ALBUM_URL)
    expect(result).toBe(
      `Photos from Layla's Long Table are up! Add yours to the shared album: ${ALBUM_URL}\n\n${INVITE_URL}`
    )
  })

  it('builds the details template with a decided date, venue, and address', () => {
    const result = buildUpdateMessage('details', DECIDED_EVENT, INVITE_URL, ALBUM_URL)
    expect(result).toBe(
      `Update on Layla's Long Table:\n${expectedDateTime(DECIDED_EVENT.event_date)}\nKrasi — 48 Gloucester St, Boston\n\n${INVITE_URL}`
    )
  })

  it('builds the details template with a decided venue but no address', () => {
    const event: UpdateEventInput = { ...DECIDED_EVENT, address: null }
    const result = buildUpdateMessage('details', event, INVITE_URL, ALBUM_URL)
    expect(result).toBe(
      `Update on Layla's Long Table:\n${expectedDateTime(event.event_date)}\nKrasi\n\n${INVITE_URL}`
    )
  })

  it('builds the details template honestly when date and venue are both still undecided', () => {
    const result = buildUpdateMessage('details', UNDECIDED_EVENT, INVITE_URL, ALBUM_URL)
    expect(result).toBe(
      `Update on Layla's Long Table:\nDate & time: still being finalized\nLocation: still being finalized\n\n${INVITE_URL}`
    )
  })

  it('builds the custom template with just the invite link', () => {
    const result = buildUpdateMessage('custom', UNDECIDED_EVENT, INVITE_URL, ALBUM_URL)
    expect(result).toBe(INVITE_URL)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest __tests__/event-updates.test.ts`
Expected: FAIL — `Cannot find module '@/lib/event-updates'`

- [ ] **Step 3: Write the minimal implementation**

Create `lib/event-updates.ts`:

```ts
import { isEventDateUndecided } from './event-date'

export type UpdateTemplateId = 'photos' | 'details' | 'custom'

export type UpdateEventInput = {
  title: string
  event_date: string
  venue: string | null
  address: string | null
}

function formatUpdateDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
}

function formatUpdateTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function buildDetailsMessage(event: UpdateEventInput, inviteUrl: string): string {
  const lines = [`Update on ${event.title}:`]

  if (isEventDateUndecided(event.event_date)) {
    lines.push('Date & time: still being finalized')
  } else {
    lines.push(`${formatUpdateDate(event.event_date)} at ${formatUpdateTime(event.event_date)}`)
  }

  if (event.venue) {
    lines.push(event.address ? `${event.venue} — ${event.address}` : event.venue)
  } else {
    lines.push('Location: still being finalized')
  }

  lines.push('', inviteUrl)
  return lines.join('\n')
}

export function buildUpdateMessage(
  templateId: UpdateTemplateId,
  event: UpdateEventInput,
  inviteUrl: string,
  albumUrl: string
): string {
  if (templateId === 'photos') {
    return `Photos from ${event.title} are up! Add yours to the shared album: ${albumUrl}\n\n${inviteUrl}`
  }
  if (templateId === 'details') {
    return buildDetailsMessage(event, inviteUrl)
  }
  return inviteUrl
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest __tests__/event-updates.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/event-updates.ts __tests__/event-updates.test.ts
git commit -m "Add event-update message template builder"
```

---

### Task 2: `SEND AN UPDATE` button on the event page

**Files:**
- Modify: `components/sofra-v2/EventPaper.tsx:41-138` (props + destructure), `:186-193` (JSX)
- Modify: `app/(guest)/events/[id]/EventDetailClient.tsx:396` area (prop wiring)
- Modify: `components/sofra-v2/sofra-v2.css:1365-1366` area (layout for a 3rd button)
- Test: `__tests__/event-detail-page.test.tsx`

- [ ] **Step 1: Write the failing test**

In `__tests__/event-detail-page.test.tsx`, add this test near the other host-share-action tests (after the existing `COPY INVITE LINK`/`SHARE VIA WHATSAPP` coverage — search the file for `SHARE VIA WHATSAPP` to find the right neighborhood):

```ts
it('lets the host navigate to the update-compose page', async () => {
  makeSupabase()
  localStorage.setItem('sofra_user_id', HOST_UID)
  render(<EventDetailPage params={PARAMS} />)

  const sendUpdateButton = await screen.findByRole('button', { name: 'SEND AN UPDATE' })
  await userEvent.click(sendUpdateButton)

  expect(mockPush).toHaveBeenCalledWith('/events/ev-1/update')
})
```

(Uses the file's existing `PARAMS = { id: 'ev-1' }` constant — confirm it's still defined near the top of the file before adding this test; add it in the same neighborhood as the other `render(<EventDetailPage params={PARAMS} />)` calls.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest __tests__/event-detail-page.test.tsx -t "navigate to the update-compose page"`
Expected: FAIL — `Unable to find role="button" with name "SEND AN UPDATE"`

- [ ] **Step 3: Add the prop and button to `EventPaper.tsx`**

In `components/sofra-v2/EventPaper.tsx`, add `onSendUpdate` to `EventPaperProps` right after `onShareWhatsApp: () => void` (currently line 42):

```ts
  onShareWhatsApp: () => void
  onSendUpdate: () => void
```

Destructure it in the component signature right after `onShareWhatsApp,` (currently line 106):

```ts
  onShareWhatsApp,
  onSendUpdate,
```

Add the button inside the existing `.sv2-host-share-actions` div, right after the `SHARE VIA WHATSAPP` button (currently lines 188-193):

```tsx
                <div className="sv2-host-share-actions">
                  <button type="button" onClick={onCopyInviteLink}>
                    {copied ? 'COPIED!' : 'COPY INVITE LINK'}
                  </button>
                  <button type="button" onClick={onShareWhatsApp}>SHARE VIA WHATSAPP</button>
                  <button type="button" onClick={onSendUpdate}>SEND AN UPDATE</button>
                </div>
```

- [ ] **Step 4: Wire it in `EventDetailClient.tsx`**

In `app/(guest)/events/[id]/EventDetailClient.tsx`, add the prop to the `<EventPaper ... />` call right after `onShareWhatsApp={shareViaWhatsApp}` (currently line 397):

```tsx
      onShareWhatsApp={shareViaWhatsApp}
      onSendUpdate={() => router.push('/events/' + params.id + '/update')}
```

- [ ] **Step 5: Fix the share-row layout for a 3rd button**

`.sv2-host-share-actions` is a fixed 2-column grid (`components/sofra-v2/sofra-v2.css`, in the long rule beginning `.sv2-name-step{...}` around line 1365) — a 3rd button needs to span the full row instead of leaving an empty cell. Add this new rule right after that line (after the existing `@media(max-width:420px){.sv2-host-share-actions{...}...}` block on line 1366), so it applies at every width:

```css
.sv2-host-share-actions button:nth-child(3):last-child{grid-column:1 / -1}
```

This only matches a share-actions row that has exactly 3 buttons (the host's own row, once this change lands) — the co-host share row elsewhere in the same file still has only 2 buttons and is unaffected.

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx jest __tests__/event-detail-page.test.tsx -t "navigate to the update-compose page"`
Expected: PASS

- [ ] **Step 7: Run the full event-detail-page test file to check for regressions**

Run: `npx jest __tests__/event-detail-page.test.tsx`
Expected: PASS (all tests, including the pre-existing ones)

- [ ] **Step 8: Commit**

```bash
git add components/sofra-v2/EventPaper.tsx app/\(guest\)/events/\[id\]/EventDetailClient.tsx components/sofra-v2/sofra-v2.css __tests__/event-detail-page.test.tsx
git commit -m "Add SEND AN UPDATE button to the host event page"
```

---

### Task 3: Compose page

**Files:**
- Create: `app/(guest)/events/[id]/update/page.tsx`
- Modify: `components/sofra-v2/sofra-v2.css` (new rules)
- Test: `__tests__/event-update-page.test.tsx`

**Before writing the page**, re-read `app/(guest)/events/[id]/chat/page.tsx` in full — this task's page follows its exact shape (single client-component page, no server/client split): the `useUnwrappedParams(paramsPromise)` unwrap, the `sofra_user_id` localStorage identity check + redirect-to-login, the try/catch/finally `loadData()` shape, and the `sv2-chat-access-error` inline error block for a denied/failed load. Confirm the import path and call signature of `useUnwrappedParams` (`lib/next-params.ts`) match what's shown below before proceeding — per the migration note at the top of this plan, this is the one piece of the codebase most likely to have moved since this plan was written.

- [ ] **Step 1: Write the failing tests**

Create `__tests__/event-update-page.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EventUpdatePage from '@/app/(guest)/events/[id]/update/page'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

jest.mock('@/lib/supabase/client')
jest.mock('next/navigation', () => ({ useRouter: jest.fn() }))

const mockPush = jest.fn()
const mockReplace = jest.fn()
const HOST_UID = 'uid-host'
const COHOST_UID = 'uid-cohost'
const OUTSIDER_UID = 'uid-outsider'

const SAMPLE_EVENT = {
  id: 'ev-1',
  host_id: HOST_UID,
  title: "Layla's Long Table",
  event_date: '2027-08-11T19:00:00.000Z',
  venue: 'Krasi',
  address: '48 Gloucester St, Boston',
}

function makeSupabase({
  event = SAMPLE_EVENT as typeof SAMPLE_EVENT | null,
  isCohost = false,
} = {}) {
  const sb = {
    from: jest.fn((table: string) => {
      if (table === 'events') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: event, error: event ? null : { message: 'not found' } }),
            }),
          }),
        }
      }
      if (table === 'event_cohosts') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                maybeSingle: jest.fn().mockResolvedValue({ data: isCohost ? { user_id: COHOST_UID } : null, error: null }),
              }),
            }),
          }),
        }
      }
      throw new Error(`Unexpected table in test: ${table}`)
    }),
  }
  ;(createClient as jest.Mock).mockReturnValue(sb)
  return sb
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(useRouter as jest.Mock).mockReturnValue({ push: mockPush, replace: mockReplace })
  mockPush.mockReset()
  mockReplace.mockReset()
  localStorage.clear()

  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: jest.fn().mockResolvedValue(undefined) },
    configurable: true,
    writable: true,
  })
})

const PARAMS = Promise.resolve({ id: 'ev-1' })

describe('EventUpdatePage', () => {
  it('lets the host see the compose screen with the custom template pre-filled with the invite link', async () => {
    makeSupabase()
    localStorage.setItem('sofra_user_id', HOST_UID)
    render(<EventUpdatePage params={PARAMS} />)

    const textarea = await screen.findByRole('textbox')
    expect((textarea as HTMLTextAreaElement).value).toBe('http://localhost/events/ev-1')
  })

  it('lets an accepted co-host see the compose screen', async () => {
    makeSupabase({ isCohost: true })
    localStorage.setItem('sofra_user_id', COHOST_UID)
    render(<EventUpdatePage params={PARAMS} />)

    await screen.findByRole('textbox')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('denies a user who is neither host nor co-host', async () => {
    makeSupabase({ isCohost: false })
    localStorage.setItem('sofra_user_id', OUTSIDER_UID)
    render(<EventUpdatePage params={PARAMS} />)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/host or a co-host/i)
    })
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('fills the textarea with the photos template, including the album link and the invite link', async () => {
    makeSupabase()
    localStorage.setItem('sofra_user_id', HOST_UID)
    render(<EventUpdatePage params={PARAMS} />)

    await screen.findByRole('textbox')
    await userEvent.click(screen.getByRole('button', { name: 'PHOTOS ARE UP' }))

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    expect(textarea.value).toContain('http://localhost/events/ev-1/album')
    expect(textarea.value).toContain('http://localhost/events/ev-1')
  })

  it('fills the textarea with the details template reflecting the real event date and venue', async () => {
    makeSupabase()
    localStorage.setItem('sofra_user_id', HOST_UID)
    render(<EventUpdatePage params={PARAMS} />)

    await screen.findByRole('textbox')
    await userEvent.click(screen.getByRole('button', { name: 'UPDATE TO DATE/TIME/LOCATION' }))

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    expect(textarea.value).toContain('Krasi — 48 Gloucester St, Boston')
    expect(textarea.value).toContain('http://localhost/events/ev-1')
  })

  it('copies whatever text is currently in the textarea, including hand edits', async () => {
    makeSupabase()
    localStorage.setItem('sofra_user_id', HOST_UID)
    render(<EventUpdatePage params={PARAMS} />)

    const textarea = await screen.findByRole('textbox')
    await userEvent.clear(textarea)
    await userEvent.type(textarea, 'Hand-typed message')
    await userEvent.click(screen.getByRole('button', { name: 'COPY MESSAGE' }))

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Hand-typed message')
    })
  })

  it('opens WhatsApp with the current textarea content', async () => {
    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null)
    makeSupabase()
    localStorage.setItem('sofra_user_id', HOST_UID)
    render(<EventUpdatePage params={PARAMS} />)

    const textarea = await screen.findByRole('textbox')
    await userEvent.clear(textarea)
    await userEvent.type(textarea, 'Hand-typed message')
    await userEvent.click(screen.getByRole('button', { name: 'SHARE VIA WHATSAPP' }))

    expect(openSpy).toHaveBeenCalledWith(
      'https://wa.me/?text=' + encodeURIComponent('Hand-typed message'),
      '_blank'
    )
    openSpy.mockRestore()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest __tests__/event-update-page.test.tsx`
Expected: FAIL — `Cannot find module '@/app/(guest)/events/[id]/update/page'`

- [ ] **Step 3: Write the page**

Create `app/(guest)/events/[id]/update/page.tsx`:

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { sv2Display, sv2Sans } from '@/components/sofra-v2/fonts'
import { createClient } from '@/lib/supabase/client'
import { isEventManager } from '@/lib/event-access'
import { buildUpdateMessage, type UpdateEventInput, type UpdateTemplateId } from '@/lib/event-updates'
import { useUnwrappedParams } from '@/lib/next-params'
import '@/components/sofra-v2/sofra-v2.css'

type EventRow = UpdateEventInput & { id: string; host_id: string }

const TEMPLATES: Array<{ id: UpdateTemplateId; label: string }> = [
  { id: 'photos', label: 'PHOTOS ARE UP' },
  { id: 'details', label: 'UPDATE TO DATE/TIME/LOCATION' },
  { id: 'custom', label: 'CUSTOM' },
]

function canonicalUrl(path: string): string {
  return new URL(path, window.location.origin).toString()
}

export default function EventUpdatePage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = useUnwrappedParams(paramsPromise)
  const router = useRouter()
  const supabase = createClient()
  const uidRef = useRef<string | null>(null)

  const [event, setEvent] = useState<EventRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [canManage, setCanManage] = useState(false)
  const [message, setMessage] = useState('')
  const [copied, setCopied] = useState(false)
  const [copyFallback, setCopyFallback] = useState('')

  function messageUrls() {
    return {
      inviteUrl: canonicalUrl('/events/' + params.id),
      albumUrl: canonicalUrl('/events/' + params.id + '/album'),
    }
  }

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      const stored = localStorage.getItem('sofra_user_id')
      if (!stored) {
        router.replace('/login?next=' + encodeURIComponent('/events/' + params.id + '/update'))
        return
      }
      uidRef.current = stored

      const { data: ev, error: eventError } = await supabase
        .from('events')
        .select('id,host_id,title,event_date,venue,address')
        .eq('id', params.id)
        .single()
      if (eventError || !ev) throw new Error('event not found')
      const loadedEvent = ev as EventRow
      setEvent(loadedEvent)

      const allowed = await isEventManager(supabase, params.id, stored, loadedEvent.host_id)
      setCanManage(allowed)
      if (!allowed) {
        setError('Only the host or a co-host can send an update for this Sofra.')
        return
      }

      const { inviteUrl, albumUrl } = messageUrls()
      setMessage(buildUpdateMessage('custom', loadedEvent, inviteUrl, albumUrl))
    } catch {
      setError("Couldn't load this event. Try again.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadData() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function applyTemplate(templateId: UpdateTemplateId) {
    if (!event) return
    const { inviteUrl, albumUrl } = messageUrls()
    setMessage(buildUpdateMessage(templateId, event, inviteUrl, albumUrl))
  }

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(message)
      setCopyFallback('')
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopyFallback(message)
    }
  }

  function shareWhatsApp() {
    window.open('https://wa.me/?text=' + encodeURIComponent(message), '_blank')
  }

  return (
    <div className={`sv2-root sv2-device-page sv2-app-page ${sv2Display.variable} ${sv2Sans.variable}`}>
      <main className="sv2-device-shell sv2-app-shell sv2-update-page-shell">
        <Link className="sv2-back-link" href={'/events/' + params.id}>← Event details</Link>
        <header className="sv2-update-page-header">
          <p>{event?.title ?? 'Your Sofra'}</p>
          <h1>Send an update</h1>
        </header>

        {loading ? (
          <p style={{ fontSize: 13 }}>Loading…</p>
        ) : !canManage ? (
          <div className="sv2-chat-access-error"><p role="alert">{error}</p><Link href={'/events/' + params.id}>BACK TO EVENT</Link></div>
        ) : (
          <>
            <div className="sv2-update-templates">
              {TEMPLATES.map((template) => (
                <button key={template.id} type="button" onClick={() => applyTemplate(template.id)}>
                  {template.label}
                </button>
              ))}
            </div>

            <textarea
              className="sv2-update-textarea"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={8}
            />

            {copyFallback && (
              <input
                readOnly
                value={copyFallback}
                autoFocus
                onFocus={(e) => e.target.select()}
                style={{ display: 'block', width: '100%', margin: '10px 0', fontSize: 12 }}
              />
            )}

            <div className="sv2-update-actions">
              <button type="button" onClick={copyMessage}>{copied ? 'COPIED!' : 'COPY MESSAGE'}</button>
              <button type="button" onClick={shareWhatsApp}>SHARE VIA WHATSAPP</button>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
```

- [ ] **Step 4: Add page styles**

Append to `components/sofra-v2/sofra-v2.css`, right after the `.sv2-chat-access-error{...}` rule (currently line 1480):

```css
.sv2-update-page-shell{padding-block:28px 90px}
.sv2-update-page-header{margin:34px 0 22px}
.sv2-update-page-header p{margin:0 0 4px;color:var(--sv2-muted);font-size:10px;letter-spacing:1px;text-transform:uppercase}
.sv2-update-page-header h1{margin:0;font:italic clamp(28px,7vw,38px)/1.1 var(--sv2-display-family)}
.sv2-update-templates{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:18px}
.sv2-update-templates button{min-height:40px;padding:0 14px;border:1px solid var(--sv2-ink);border-radius:999px;background:transparent;color:inherit;font:500 9px var(--sv2-sans-family);letter-spacing:.8px;cursor:pointer}
.sv2-update-textarea{width:100%;min-height:160px;box-sizing:border-box;padding:14px;border:1px solid var(--sv2-line);border-radius:15px;background:transparent;color:var(--sv2-ink);font:400 13px/1.5 var(--sv2-sans-family);resize:vertical}
.sv2-update-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}
.sv2-update-actions button{min-height:46px;padding:10px 14px;border:1px solid var(--sv2-ink);border-radius:999px;background:transparent;color:inherit;font:500 10px var(--sv2-sans-family);letter-spacing:.8px}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest __tests__/event-update-page.test.tsx`
Expected: PASS (7 tests)

- [ ] **Step 6: Commit**

```bash
git add "app/(guest)/events/[id]/update/page.tsx" components/sofra-v2/sofra-v2.css __tests__/event-update-page.test.tsx
git commit -m "Add host update-message compose page"
```

---

### Task 4: Full verification

- [ ] **Step 1: Run the complete test suite**

Run: `npx jest`
Expected: All tests pass. If there are pre-existing failures unrelated to this feature (check by running `git stash` and re-running `npx jest` to compare), report them separately rather than treating them as caused by this work — do not `git stash` if it would discard other in-progress changes in this working tree; instead just note which failures existed in the checked-out state before this plan's own commits.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: No new errors in the files touched by this plan (`lib/event-updates.ts`, `components/sofra-v2/EventPaper.tsx`, `app/(guest)/events/[id]/EventDetailClient.tsx`, `app/(guest)/events/[id]/update/page.tsx`).

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: Build succeeds. If a stale-`.next`/Windows EPERM trace-lock error occurs (a known issue in this repo — see `docs/IMPLEMENTATION_STATUS.md`), retry with an isolated output dir: `SOFRA_BUILD_DIST_DIR=.next-update-feature npm run build`. **Do not run this while a dev server (`npm run dev`) is also running against the default `.next` directory** — the two will corrupt each other's build output (confirmed earlier in this session). Check for a running dev server first and either stop it or use the isolated `SOFRA_BUILD_DIST_DIR` for the build.

- [ ] **Step 4: Manual smoke test**

With the dev server running (`npm run dev`), as a logged-in host: open an event page, click `SEND AN UPDATE`, confirm it navigates to `/events/[id]/update`, click each of the three template buttons and confirm the textarea updates, edit the text by hand, click `COPY MESSAGE` and confirm the edited text is what's on the clipboard (paste it somewhere to check), and click `SHARE VIA WHATSAPP` and confirm it opens `web.whatsapp.com` (or the WhatsApp app) with that same edited text pre-filled.

---

## Self-Review Notes

- **Spec coverage:** All four spec requirements (quick-select templates, editable pre-fill, auto-appended real invite link, copy/WhatsApp actions) are implemented in Task 3; the trigger button (spec section "Trigger button") is Task 2; the template logic (spec section "Template builder") is Task 1.
- **Self-review from the spec** ("confirm the date/time/location template correctly pulls live, current event data" / "confirm the generated link is the real, working event URL"): both are satisfied structurally, not just by inspection — `messageUrls()` and the `event` state are read from the same live Supabase fetch used to render the rest of the page (no separate/cached source), and Task 3's tests assert the actual textarea content contains the real venue/address and the real `canonicalUrl`-constructed link, not a placeholder.
- **Type consistency check:** `UpdateEventInput` (Task 1) is reused directly by `EventRow` in Task 3 (`type EventRow = UpdateEventInput & { id: string; host_id: string }`) rather than being redefined — so a field rename in one place cannot silently drift from the other.
