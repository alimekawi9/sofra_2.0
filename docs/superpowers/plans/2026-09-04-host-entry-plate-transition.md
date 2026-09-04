# Host Entry Plate Transition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a burgundy "Ready to host your own Sofra?" plate intro screen in front of the Create-a-Sofra
wizard at `/host/new`, with a true shared-element (Framer Motion `layoutId`) transition from the plate into
the wizard's own card container.

**Architecture:** A new `HostEntryPlate` component renders the intro scene and shares a `layoutId` with
`HostCreateForm`'s existing shell element (now conditionally a `motion.main`). `app/(host)/host/new/page.tsx`
gates which one renders via one new piece of local state, wrapped in `MotionConfig` for
`prefers-reduced-motion` support across the swap.

**Tech Stack:** Next.js App Router (client components), React 18, Framer Motion (new dependency), Jest +
Testing Library.

**Reference:** `docs/superpowers/specs/2026-09-04-host-entry-plate-transition-design.md` — read this first
for full rationale. One deviation from that spec, decided during planning: `HostCreateForm`'s shell element
is always rendered as `motion.main` (not conditionally swapped between `motion.main`/plain `'main'` via a
dynamic `Shell` variable) — passing `layoutId={undefined}` to `motion.main` is already fully inert (no
shared-layout behavior triggers without a `layoutId`), and this avoids a polymorphic-JSX-tag TypeScript
headache for a large duplicated children subtree. Behavior for `/host/[id]/edit` (which never passes
`shellLayoutId`) is identical either way.

---

### Task 1: Install Framer Motion

**Files:**
- Modify: `package.json`, `package-lock.json` (via `npm install`)

- [ ] **Step 1: Install the dependency**

Run: `npm install framer-motion`

- [ ] **Step 2: Verify it installed correctly**

Run: `node -e "console.log(require('framer-motion/package.json').version)"`

Expected: prints a version number (e.g. `11.x.x`) with no error.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "Add framer-motion dependency for the host entry plate transition"
```

---

### Task 2: `shellLayoutId` prop on `HostCreateForm`

**Files:**
- Modify: `components/sofra-v2/HostCreateForm.tsx`

- [ ] **Step 1: Add the Framer Motion import**

In `components/sofra-v2/HostCreateForm.tsx`, change:

```ts
import { useState, type ChangeEvent, type DragEvent } from 'react'
```

to:

```ts
import { useState, type ChangeEvent, type DragEvent } from 'react'
import { motion } from 'framer-motion'
```

- [ ] **Step 2: Add the new prop to the interface**

Change the end of `HostCreateFormProps` (currently ending):

```ts
  budgetCurrency?: string
  onBudgetCurrencyChange?: (value: string) => void
}
```

to:

```ts
  budgetCurrency?: string
  onBudgetCurrencyChange?: (value: string) => void
  // Set only by /host/new, right after the entry-plate transition — lets this
  // component's shell share a Framer Motion layoutId with the plate it grew
  // out of. Omitted (and therefore inert) everywhere else, including edit mode.
  shellLayoutId?: string
}
```

- [ ] **Step 3: Destructure the new prop**

Change:

```ts
export function HostCreateForm({
  mode = 'create',
  title,
```

to:

```ts
export function HostCreateForm({
  mode = 'create',
  shellLayoutId,
  title,
```

- [ ] **Step 4: Render the shell as `motion.main`**

Change the opening shell tag:

```tsx
      <main className="sv2-device-shell sv2-app-shell sv2-host-shell">
```

to:

```tsx
      <motion.main className="sv2-device-shell sv2-app-shell sv2-host-shell" layoutId={shellLayoutId}>
```

And its matching closing tag:

```tsx
      </main>
```

to:

```tsx
      </motion.main>
```

(This is the *only* `</main>` in this file, immediately following the `{isEdit && onDelete && (...)}` DELETE
EVENT button block — search for it to confirm before editing.)

- [ ] **Step 5: Confirm nothing broke**

Run: `npx jest __tests__/host-new-page.test.tsx __tests__/host-edit-page.test.tsx`

Expected: same results as before this change (`shellLayoutId` is `undefined` in every current caller, so
this step should be a no-op behaviorally — Framer Motion renders `motion.main` as a plain `<main>` DOM
element when no `layoutId`/`initial`/`animate`/`exit` props are set that would trigger animation).

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit -p .`

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add components/sofra-v2/HostCreateForm.tsx
git commit -m "Add an optional shellLayoutId prop to HostCreateForm for shared-element transitions"
```

---

### Task 3: `HostEntryPlate` component

**Files:**
- Create: `components/sofra-v2/HostEntryPlate.tsx`
- Modify: `components/sofra-v2/sofra-v2.css`
- Test: `__tests__/host-entry-plate.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `__tests__/host-entry-plate.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HostEntryPlate } from '@/components/sofra-v2/HostEntryPlate'

jest.mock('framer-motion', () => ({
  motion: new Proxy({}, { get: (_target, tag) => tag }),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
}))

it('renders the plate scene with the ready-to-host card', () => {
  render(<HostEntryPlate onEnter={jest.fn()} />)
  expect(screen.getByRole('button', { name: /start hosting a sofra/i })).toBeInTheDocument()
  expect(screen.getByText(/ready to host/i)).toBeInTheDocument()
  expect(screen.getByText(/your own sofra\?/i)).toBeInTheDocument()
})

it('calls onEnter once the leave transition has had time to play', async () => {
  const onEnter = jest.fn()
  render(<HostEntryPlate onEnter={onEnter} />)

  await userEvent.click(screen.getByRole('button', { name: /start hosting a sofra/i }))
  expect(onEnter).not.toHaveBeenCalled()

  await waitFor(() => expect(onEnter).toHaveBeenCalledTimes(1), { timeout: 1000 })
})

it('does not call onEnter a second time from a rapid double click', async () => {
  const onEnter = jest.fn()
  render(<HostEntryPlate onEnter={onEnter} />)

  const button = screen.getByRole('button', { name: /start hosting a sofra/i })
  await userEvent.click(button)
  await userEvent.click(button) // second click should be a no-op — button is disabled once leaving

  await waitFor(() => expect(onEnter).toHaveBeenCalledTimes(1), { timeout: 1000 })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx jest __tests__/host-entry-plate.test.tsx`

Expected: FAIL — `@/components/sofra-v2/HostEntryPlate` doesn't exist yet (module not found).

- [ ] **Step 3: Implement the component**

Create `components/sofra-v2/HostEntryPlate.tsx`:

```tsx
'use client'

import { useState } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { sv2Display, sv2Sans } from './fonts'

export interface HostEntryPlateProps {
  onEnter: () => void
}

export function HostEntryPlate({ onEnter }: HostEntryPlateProps) {
  const [leaving, setLeaving] = useState(false)

  function handleClick() {
    if (leaving) return
    setLeaving(true)
    window.setTimeout(onEnter, 500)
  }

  return (
    <div className={`sv2-root sv2-host-entry-page${leaving ? ' leaving' : ''} ${sv2Display.variable} ${sv2Sans.variable}`}>
      <button
        type="button"
        className="sv2-host-entry-trigger"
        onClick={handleClick}
        disabled={leaving}
        aria-label="Start hosting a Sofra"
      >
        <motion.div layoutId="host-entry-shell" className="sv2-host-entry-plate">
          <Image src="/design-preview/silver-plate.png" alt="" width={1254} height={1254} priority />
        </motion.div>
        {!leaving && (
          <AnimatePresence>
            <motion.div className="sv2-host-entry-overlay" exit={{ opacity: 0 }} transition={{ duration: 0.22 }}>
              <svg className="sv2-host-entry-fork" width="18" height="90" viewBox="0 0 18 90" aria-hidden="true">
                <g fill="none" stroke="#C4A35A" strokeWidth="2">
                  <path d="M4 0v22M9 0v22M14 0v22" />
                  <path d="M4 22c0 8 5 8 5 14s-5 6-5 14v40" />
                  <path d="M14 22c0 8-5 8-5 14" />
                </g>
              </svg>
              <svg className="sv2-host-entry-knife" width="16" height="90" viewBox="0 0 16 90" aria-hidden="true">
                <g fill="none" stroke="#C4A35A" strokeWidth="2">
                  <path d="M8 0c5 4 5 20 0 30s-5 8 0 8v52" />
                </g>
              </svg>
              <div className="sv2-host-entry-card">
                <p>Ready to host<br />your own Sofra?</p>
              </div>
            </motion.div>
          </AnimatePresence>
        )}
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Add the CSS**

In `components/sofra-v2/sofra-v2.css`, find these three lines (the end of the Welcome/Auth section):

```css
.sv2-yalla-btn:disabled{
  opacity:.4;
  cursor:not-allowed;
}
.sv2-yalla-btn:disabled:hover{opacity:.4;}
```

Add this new block directly after `.sv2-yalla-btn:disabled:hover{opacity:.4;}` and before the next
`/* ---- 06 — ... ---- */` comment:

```css

.sv2-host-entry-page{min-height:100dvh;display:flex;align-items:center;justify-content:center;background-color:#5C1515;transition:background-color .5s ease}
.sv2-host-entry-page.leaving{background-color:var(--sv2-page-bg)}
.sv2-host-entry-trigger{position:relative;display:flex;align-items:center;justify-content:center;width:min(78vw,340px);aspect-ratio:1;padding:0;border:0;background:transparent;cursor:pointer}
.sv2-host-entry-trigger:disabled{cursor:default}
.sv2-host-entry-plate{position:absolute;inset:0;border-radius:50%;overflow:hidden}
.sv2-host-entry-plate img{width:100%;height:100%;object-fit:contain}
.sv2-host-entry-overlay{position:relative;z-index:1;display:flex;align-items:center;justify-content:center;gap:14px;width:100%;padding:0 8px}
.sv2-host-entry-fork,.sv2-host-entry-knife{flex-shrink:0;opacity:.9}
.sv2-host-entry-card{padding:16px 14px;background:#F7F4ED;border-radius:3px;box-shadow:0 8px 20px rgba(0,0,0,.35);text-align:center}
.sv2-host-entry-card p{margin:0;font:italic 16px/1.3 var(--sv2-display-family);color:#5C1515}
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `npx jest __tests__/host-entry-plate.test.tsx`

Expected: PASS — all 3 tests pass.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit -p .`

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add components/sofra-v2/HostEntryPlate.tsx components/sofra-v2/sofra-v2.css __tests__/host-entry-plate.test.tsx
git commit -m "Add the HostEntryPlate intro screen component"
```

---

### Task 4: Wire the plate into `/host/new` and update its tests

**Files:**
- Modify: `app/(host)/host/new/page.tsx`
- Modify: `__tests__/host-new-page.test.tsx`

- [ ] **Step 1: Update the page**

In `app/(host)/host/new/page.tsx`, change the import block (currently):

```ts
'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { HostCreateForm, type NewEventQuestionChoice } from '@/components/sofra-v2/HostCreateForm'
import type { PreviewPlace } from '@/components/sofra-v2/HostLocationAutocomplete'
import '@/components/sofra-v2/sofra-v2.css'
import { eventDateForStorage } from '@/lib/event-date'
import { generateCustomDetailId, sanitizeCustomDetails, type CustomDetailSection } from '@/lib/event-custom-details'
```

to:

```ts
'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { MotionConfig } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { HostCreateForm, type NewEventQuestionChoice } from '@/components/sofra-v2/HostCreateForm'
import { HostEntryPlate } from '@/components/sofra-v2/HostEntryPlate'
import type { PreviewPlace } from '@/components/sofra-v2/HostLocationAutocomplete'
import '@/components/sofra-v2/sofra-v2.css'
import { eventDateForStorage } from '@/lib/event-date'
import { generateCustomDetailId, sanitizeCustomDetails, type CustomDetailSection } from '@/lib/event-custom-details'
```

Add one new state field alongside the existing ones — change:

```ts
  const [kitchenPlan, setKitchenPlan] = useState<'now' | 'later' | 'chef' | null>(null)
  const [questionChoice, setQuestionChoice] = useState<NewEventQuestionChoice>('default')
```

to:

```ts
  const [kitchenPlan, setKitchenPlan] = useState<'now' | 'later' | 'chef' | null>(null)
  const [questionChoice, setQuestionChoice] = useState<NewEventQuestionChoice>('default')
  const [entryRevealed, setEntryRevealed] = useState(false)
```

Finally, change the component's `return`, currently:

```tsx
  return (
    <>
      <HostCreateForm
      title={title}
      onTitleChange={(value) => { setTitle(value); setError('') }}
      tagline={tagline}
      onTaglineChange={setTagline}
      dateTime={dateTime}
      onDateTimeChange={(value) => { setDateTime(value); setError('') }}
      location={location}
      onLocationChange={(value) => { setLocation(value); setPlace(null); setError('') }}
      onPlaceSelect={setPlace}
      dressCode={dressCode}
      onDressCodeChange={setDressCode}
      customDetails={customDetails}
      onAddCustomDetail={addCustomDetail}
      onCustomDetailChange={updateCustomDetail}
      onRemoveCustomDetail={removeCustomDetail}
      imageDataUrl={imageDataUrl}
      onImageChange={onImageChange}
      onImageRemove={onImageRemove}
      submitting={submitting}
      error={error}
      kitchenPlan={kitchenPlan}
      onKitchenPlanChange={setKitchenPlan}
      questionChoice={questionChoice}
      onQuestionChoiceChange={setQuestionChoice}
      onSubmit={handleSubmit}
      />
    </>
  )
}
```

to:

```tsx
  return (
    <MotionConfig reducedMotion="user">
      {!entryRevealed ? (
        <HostEntryPlate onEnter={() => setEntryRevealed(true)} />
      ) : (
        <HostCreateForm
        shellLayoutId="host-entry-shell"
        title={title}
        onTitleChange={(value) => { setTitle(value); setError('') }}
        tagline={tagline}
        onTaglineChange={setTagline}
        dateTime={dateTime}
        onDateTimeChange={(value) => { setDateTime(value); setError('') }}
        location={location}
        onLocationChange={(value) => { setLocation(value); setPlace(null); setError('') }}
        onPlaceSelect={setPlace}
        dressCode={dressCode}
        onDressCodeChange={setDressCode}
        customDetails={customDetails}
        onAddCustomDetail={addCustomDetail}
        onCustomDetailChange={updateCustomDetail}
        onRemoveCustomDetail={removeCustomDetail}
        imageDataUrl={imageDataUrl}
        onImageChange={onImageChange}
        onImageRemove={onImageRemove}
        submitting={submitting}
        error={error}
        kitchenPlan={kitchenPlan}
        onKitchenPlanChange={setKitchenPlan}
        questionChoice={questionChoice}
        onQuestionChoiceChange={setQuestionChoice}
        onSubmit={handleSubmit}
        />
      )}
    </MotionConfig>
  )
}
```

- [ ] **Step 2: Replace the entire test file**

`__tests__/host-new-page.test.tsx` needs a `framer-motion` mock and a `renderHostForm()` helper that clicks
through the new entry plate, used everywhere the old tests called `render(<HostNewPage />)` and expected the
wizard to already be visible. Replace the complete file with:

```tsx
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
  await userEvent.click(await screen.findByRole('button', { name: /start hosting a sofra/i }))
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Create a Sofra' })).toBeInTheDocument(), { timeout: 1000 })
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
```

(Two behavioral notes on this rewrite: the new first test, `'shows the entry plate first, not the wizard'`,
is the only genuinely new test case — everything else is the same 13 pre-existing tests, each with
`render(<HostNewPage />)` replaced by `await renderHostForm()` and, where the test wasn't already `async`,
made `async`. The final `'redirects to login...'` test deliberately keeps the bare `render()` call — a
logged-out visitor never sees the plate at all.)

- [ ] **Step 2: Run the test file and confirm it passes**

Run: `npx jest __tests__/host-new-page.test.tsx`

Expected: PASS — 14 tests (13 pre-existing + 1 new) pass.

- [ ] **Step 3: Run the full restaurant/host/edit-adjacent suites for safety**

Run: `npx jest __tests__/host-new-page.test.tsx __tests__/host-edit-page.test.tsx __tests__/host-entry-plate.test.tsx __tests__/host-questionnaire-page.test.tsx`

Expected: all pass.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p .`

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "app/(host)/host/new/page.tsx" __tests__/host-new-page.test.tsx
git commit -m "Show the entry plate before the Create-a-Sofra wizard"
```

---

### Task 5: Full verification, manual check, and documentation

**Files:**
- Modify: `docs/IMPLEMENTATION_STATUS.md`

- [ ] **Step 1: Run the complete test suite**

Run: `npx jest --silent`

Expected: the same pre-existing baseline failures as before this feature (`login-page.test.tsx`,
`events-page.test.tsx`, `event-detail-page.test.tsx`, `design-preview-application.test.tsx` — 4 suites, 19
tests, all unrelated to hosting/the entry plate), plus every host/entry-plate-related suite passing. If
anything else newly fails, stop and fix it before continuing.

- [ ] **Step 2: Type-check the whole project**

Run: `npx tsc --noEmit -p .`

Expected: no errors.

- [ ] **Step 3: Manual browser check**

This is a genuinely visual, animated feature that automated jsdom tests cannot verify (jsdom has no real
layout engine, which is exactly why Task 3/4's tests mock `framer-motion` rather than assert on the
animation itself). Start the dev server (`npm run dev`), sign in, and actually click through
`/host/new` in a real browser:

- Confirm the plate scene appears first, on a solid burgundy background, with the plate, "Ready to host
  your own Sofra?" card, and fork/knife all visible and reasonably positioned (the CSS values in Task 3 are
  reasoned estimates, not pixel-tested — expect to nudge `width`, `gap`, or font-size in
  `.sv2-host-entry-*` rules if proportions look off against the actual rendered plate image).
- Click the plate and confirm: the card/cutlery fade out, the plate visibly grows and reshapes into the
  wizard's card, the background crossfades from burgundy to the wizard's actual page background, and it
  lands cleanly on step 1 with no visual jump/flash.
- Resize the browser (or check on a real mobile viewport) to confirm the transition still looks reasonable
  at a small screen width, since `.sv2-device-shell` has different `border-radius`/sizing above and below
  600px (see Task 3 background in the design spec).
- Confirm `/host/[id]/edit` (open an existing event's edit page) is completely unchanged — no plate, no
  animation, normal instant render.

Fix any visual issues found directly in `components/sofra-v2/sofra-v2.css`'s new `.sv2-host-entry-*` rules
before moving on — do not defer visual polish found here.

- [ ] **Step 4: Document the feature**

Add a new dated section to `docs/IMPLEMENTATION_STATUS.md`, after the most recent existing entry:

```markdown
# Host entry plate transition (2026-09-04)

- Visiting `/host/new` now shows a new intro screen first: a centered silver plate on a fixed burgundy
  background, captioned "Ready to host your own Sofra?" with a fork and knife flanking it. It shows on
  every visit — there's no "seen it once" persistence — and only appears after the existing
  logged-in-identity check already passes.
- Clicking the plate plays a true shared-element transition (via the new `framer-motion` dependency's
  `layoutId`) into the existing, otherwise-unmodified four-step Create-a-Sofra wizard: the plate's position,
  size, and shape animate directly into the wizard's own card container, while the card text/cutlery fade
  out and the background crossfades from burgundy to the wizard's actual page background.
- `HostCreateForm` gained one new optional prop, `shellLayoutId`, used only by `/host/new` to make its shell
  element a Framer Motion shared-layout target; `/host/[id]/edit` never passes it and is unaffected.
- A `prefers-reduced-motion` user gets an instant transition instead of the morph, via `MotionConfig
  reducedMotion="user"` wrapping both the plate and wizard branches in `/host/new`.
```

- [ ] **Step 5: Commit**

```bash
git add docs/IMPLEMENTATION_STATUS.md
git commit -m "Document the host entry plate transition"
```

---

## Acceptance criteria (from the spec)

- [x] Visiting `/host/new` while logged in shows the burgundy plate scene first, every time.
- [x] The plate scene's background is always burgundy, regardless of the site's light/dark setting.
- [x] Clicking anywhere in the plate scene triggers the transition; no second CTA button.
- [x] The transition is a true shared-element morph, not a generic fade/cut.
- [x] The card text and cutlery fade out during the transition.
- [x] Landing state is the existing, unmodified step 1.
- [x] `/host/[id]/edit` is unchanged.
- [x] A `prefers-reduced-motion` user gets an instant transition.
- [ ] Visual proportions/spacing hold up in a real browser (blocked on Task 5 Step 3's manual check — jsdom
      cannot verify this).
