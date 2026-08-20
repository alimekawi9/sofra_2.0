# Custom Event Detail Sections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a host add any number of custom label+body detail sections (e.g. "Parking", "Gift Registry") to an event, editable from the same create/edit form as Dress Code, and rendered on the guest-facing event page in the exact same row style as Date/Time/Location/Dress Code.

**Architecture:** One new JSONB column (`events.custom_details`, an ordered array of `{id,label,body}`) with no separate table. A small shared `lib/event-custom-details.ts` module holds the type and two pure helpers (id generation, save-time sanitization). `HostCreateForm` gets a repeatable add/remove row UI (mirroring the existing custom-questionnaire-question editor pattern); both `host/new` and `host/[id]/edit` pages own the array in local state and include it in their existing insert/update payloads; `EventPaper` renders the array inside its existing `<dl className="sv2-event-facts">` block; `EventDetailClient` fetches and passes it through.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Supabase, Jest + Testing Library.

---

### Task 1: Migration

**Files:**
- Create: `supabase/migrations/20260820000001_add_event_custom_details.sql`

- [ ] **Step 1: Write the migration**

```sql
alter table public.events
  add column custom_details jsonb not null default '[]'::jsonb;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260820000001_add_event_custom_details.sql
git commit -m "Add events.custom_details column for host-authored detail sections"
```

(This migration is not applied to the live database as part of this plan — matches the existing repo convention of committing migrations and applying them separately. Note it in Task 8's docs update.)

---

### Task 2: Shared type and helpers

**Files:**
- Create: `lib/event-custom-details.ts`
- Test: `__tests__/event-custom-details.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { generateCustomDetailId, sanitizeCustomDetails, type CustomDetailSection } from '@/lib/event-custom-details'

describe('generateCustomDetailId', () => {
  it('generates a unique id each time, prefixed with d_', () => {
    const a = generateCustomDetailId()
    const b = generateCustomDetailId()
    expect(a).toMatch(/^d_/)
    expect(b).toMatch(/^d_/)
    expect(a).not.toEqual(b)
  })
})

describe('sanitizeCustomDetails', () => {
  it('trims whitespace from kept sections', () => {
    const input: CustomDetailSection[] = [{ id: '1', label: '  Parking  ', body: '  Free lot behind the theater  ' }]
    expect(sanitizeCustomDetails(input)).toEqual([{ id: '1', label: 'Parking', body: 'Free lot behind the theater' }])
  })

  it('drops a section with an empty label', () => {
    const input: CustomDetailSection[] = [{ id: '1', label: '   ', body: 'Some body' }]
    expect(sanitizeCustomDetails(input)).toEqual([])
  })

  it('drops a section with an empty body', () => {
    const input: CustomDetailSection[] = [{ id: '1', label: 'Parking', body: '   ' }]
    expect(sanitizeCustomDetails(input)).toEqual([])
  })

  it('keeps multiple valid sections in their original order', () => {
    const input: CustomDetailSection[] = [
      { id: '1', label: 'Parking', body: 'Free lot' },
      { id: '2', label: 'Gift registry', body: 'No gifts, just bring an appetite' },
    ]
    expect(sanitizeCustomDetails(input)).toEqual(input)
  })

  it('returns an empty array unchanged', () => {
    expect(sanitizeCustomDetails([])).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/event-custom-details.test.ts`
Expected: FAIL with "Cannot find module '@/lib/event-custom-details'"

- [ ] **Step 3: Write the implementation**

```ts
export type CustomDetailSection = {
  id: string
  label: string
  body: string
}

export function generateCustomDetailId(): string {
  return `d_${Math.random().toString(36).slice(2, 10)}`
}

// Drops rows missing a label or body rather than persisting them
// half-filled; trims whitespace from what's kept. Order is preserved --
// array order is display order, there's no separate ordering field.
export function sanitizeCustomDetails(sections: CustomDetailSection[]): CustomDetailSection[] {
  return sections
    .map((section) => ({ id: section.id, label: section.label.trim(), body: section.body.trim() }))
    .filter((section) => section.label.length > 0 && section.body.length > 0)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/event-custom-details.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/event-custom-details.ts __tests__/event-custom-details.test.ts
git commit -m "Add CustomDetailSection type and sanitizeCustomDetails helper"
```

---

### Task 3: Editable UI in `HostCreateForm`

**Files:**
- Modify: `components/sofra-v2/HostCreateForm.tsx`
- Modify: `components/sofra-v2/sofra-v2.css`

- [ ] **Step 1: Add the CSS this UI needs**

In `components/sofra-v2/sofra-v2.css`, find this existing line (around line 1328):

```css
.sv2-host-shell>h1{margin:6px 0 28px;font:italic clamp(42px,10vw,64px)/1 var(--sv2-display-family)}.sv2-host-shell form{display:grid;gap:17px}.sv2-host-shell label{display:grid;gap:7px;font-size:10px;text-transform:uppercase;letter-spacing:1px}.sv2-host-shell input,.sv2-host-shell select{min-height:48px;padding:12px;border:0;border-bottom:1px solid var(--sv2-ink);border-radius:0;background:transparent;color:inherit;font:400 15px var(--sv2-sans-family)}.sv2-host-shell form>button{min-height:50px;margin-top:12px;border:1px solid var(--sv2-ink);background:var(--sv2-ink);color:var(--sv2-card-bg);font:500 12px var(--sv2-sans-family);letter-spacing:1px}.sv2-host-shell [role="status"]{font-size:11px;text-align:center}
```

Replace `.sv2-host-shell input,.sv2-host-shell select{` with `.sv2-host-shell input,.sv2-host-shell select,.sv2-host-shell textarea{` (adds `textarea` to the shared field styling), and append this new line directly after it:

```css
.sv2-host-shell textarea{min-height:64px;resize:vertical}
.sv2-custom-details-field{min-width:0;margin:5px 0 0;padding:0;border:0}
.sv2-custom-details-field legend{margin-bottom:9px;font-size:10px;letter-spacing:1px}
.sv2-custom-details-field legend span{margin-left:6px;color:var(--sv2-muted);font-size:8px}
.sv2-add-detail-section{display:block;width:100%;margin:8px 0 0;padding:16px;border:1px dashed var(--sv2-line);border-radius:14px;background:transparent;color:var(--sv2-muted);font:500 11px var(--sv2-sans-family);letter-spacing:1px;text-align:center;cursor:pointer}
```

- [ ] **Step 2: Add the new props to `HostCreateFormProps`**

In `components/sofra-v2/HostCreateForm.tsx`, add this import at the top:

```ts
import type { CustomDetailSection } from '@/lib/event-custom-details'
```

In the `HostCreateFormProps` interface, add right after `onDressCodeChange: (value: string) => void`:

```ts
  customDetails: CustomDetailSection[]
  onAddCustomDetail: () => void
  onCustomDetailChange: (id: string, patch: Partial<Pick<CustomDetailSection, 'label' | 'body'>>) => void
  onRemoveCustomDetail: (id: string) => void
```

In the function's destructured parameters, add right after `onDressCodeChange,`:

```ts
  customDetails,
  onAddCustomDetail,
  onCustomDetailChange,
  onRemoveCustomDetail,
```

- [ ] **Step 3: Render the repeatable list**

In `components/sofra-v2/HostCreateForm.tsx`, right after the closing `</label>` of the Dress code field (immediately before `{onCustomizeQuestions && (`), add:

```tsx
          <fieldset className="sv2-custom-details-field">
            <legend>ADDITIONAL DETAILS <span>OPTIONAL</span></legend>
            {customDetails.map((section) => (
              <div key={section.id} className="sv2-question-card">
                <div className="sv2-question-card-headrow">
                  <span className="sv2-question-kind">Detail section</span>
                  <button
                    type="button"
                    aria-label={`Remove ${section.label || 'detail section'}`}
                    className="sv2-remove-question"
                    onClick={() => onRemoveCustomDetail(section.id)}
                  >
                    REMOVE
                  </button>
                </div>
                <label>
                  Section label
                  <input
                    value={section.label}
                    onChange={(event) => onCustomDetailChange(section.id, { label: event.target.value })}
                    placeholder="e.g. Parking"
                  />
                </label>
                <label>
                  Details
                  <textarea
                    value={section.body}
                    onChange={(event) => onCustomDetailChange(section.id, { body: event.target.value })}
                    placeholder="e.g. Free lot behind the theater"
                  />
                </label>
              </div>
            ))}
            <button type="button" className="sv2-add-detail-section" onClick={onAddCustomDetail}>
              + ADD DETAIL SECTION
            </button>
          </fieldset>

```

- [ ] **Step 4: Commit**

```bash
git add components/sofra-v2/HostCreateForm.tsx components/sofra-v2/sofra-v2.css
git commit -m "Add repeatable custom detail section editor to HostCreateForm"
```

---

### Task 4: Wire `host/new` (create flow)

**Files:**
- Modify: `app/(host)/host/new/page.tsx`
- Test: `__tests__/host-new-page.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `__tests__/host-new-page.test.tsx`, add this new `describe` block at the very end of the file, right after the closing `})` of the `describe('CUSTOMIZE GUEST QUESTIONS', ...)` block (the last block in the file):

```ts
describe('custom detail sections', () => {
  it('adds a section, fills it in, and includes it in the insert payload', async () => {
    const sb = makeSupabase()
    render(<HostNewPage />)
    await userEvent.click(screen.getByRole('button', { name: /add detail section/i }))
    await userEvent.type(screen.getByRole('textbox', { name: /section label/i }), 'Parking')
    await userEvent.type(screen.getByRole('textbox', { name: /details/i }), 'Free lot behind the theater')
    await fillRequired()
    await userEvent.click(screen.getByRole('button', { name: /continue/i }))
    await waitFor(() => expect(mockPush).toHaveBeenCalled())
    expect(sb.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        custom_details: [expect.objectContaining({ label: 'Parking', body: 'Free lot behind the theater' })],
      })
    )
  })

  it('drops a section that has a label but no body', async () => {
    const sb = makeSupabase()
    render(<HostNewPage />)
    await userEvent.click(screen.getByRole('button', { name: /add detail section/i }))
    await userEvent.type(screen.getByRole('textbox', { name: /section label/i }), 'Parking')
    await fillRequired()
    await userEvent.click(screen.getByRole('button', { name: /continue/i }))
    await waitFor(() => expect(mockPush).toHaveBeenCalled())
    expect(sb.insert).toHaveBeenCalledWith(expect.objectContaining({ custom_details: [] }))
  })

  it('REMOVE deletes a section before submit', async () => {
    makeSupabase()
    render(<HostNewPage />)
    await userEvent.click(screen.getByRole('button', { name: /add detail section/i }))
    await userEvent.click(screen.getByRole('button', { name: /remove detail section/i }))
    expect(screen.queryByRole('textbox', { name: /section label/i })).not.toBeInTheDocument()
  })

  it('an event with no custom detail sections submits an empty array', async () => {
    const sb = makeSupabase()
    render(<HostNewPage />)
    await fillRequired()
    await userEvent.click(screen.getByRole('button', { name: /continue/i }))
    await waitFor(() => expect(mockPush).toHaveBeenCalled())
    expect(sb.insert).toHaveBeenCalledWith(expect.objectContaining({ custom_details: [] }))
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/host-new-page.test.tsx -t "custom detail sections"`
Expected: FAIL — `HostCreateForm` doesn't receive the new props yet (`getByRole('button', {name: /add detail section/i})` not found), and `custom_details` isn't in the insert payload.

- [ ] **Step 3: Add state, handlers, and payload field**

In `app/(host)/host/new/page.tsx`, add this import:

```ts
import { generateCustomDetailId, sanitizeCustomDetails, type CustomDetailSection } from '@/lib/event-custom-details'
```

Add this state declaration right after `const [dressCode, setDressCode] = useState('')`:

```ts
  const [customDetails, setCustomDetails] = useState<CustomDetailSection[]>([])
```

Add these handlers right after `onImageRemove`:

```ts
  function addCustomDetail() {
    setCustomDetails((current) => [...current, { id: generateCustomDetailId(), label: '', body: '' }])
  }

  function updateCustomDetail(id: string, patch: Partial<Pick<CustomDetailSection, 'label' | 'body'>>) {
    setCustomDetails((current) => current.map((section) => (section.id === id ? { ...section, ...patch } : section)))
  }

  function removeCustomDetail(id: string) {
    setCustomDetails((current) => current.filter((section) => section.id !== id))
  }
```

In `saveEventRow`'s `payload` object, add this field right after `dress_code: dressCode.trim() || null,`:

```ts
      custom_details: sanitizeCustomDetails(customDetails),
```

- [ ] **Step 4: Pass the new props to `HostCreateForm`**

In the `<HostCreateForm ... />` JSX, add right after `onDressCodeChange={setDressCode}`:

```tsx
      customDetails={customDetails}
      onAddCustomDetail={addCustomDetail}
      onCustomDetailChange={updateCustomDetail}
      onRemoveCustomDetail={removeCustomDetail}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest __tests__/host-new-page.test.tsx`
Expected: PASS (all tests, including the 4 new ones)

- [ ] **Step 6: Commit**

```bash
git add app/\(host\)/host/new/page.tsx __tests__/host-new-page.test.tsx
git commit -m "Wire custom detail sections into event creation"
```

---

### Task 5: Wire `host/[id]/edit` (edit flow)

**Files:**
- Modify: `app/(host)/host/[id]/edit/page.tsx`
- Test: `__tests__/host-edit-page.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `__tests__/host-edit-page.test.tsx`, add `custom_details` to `SAMPLE_EVENT`:

```ts
const SAMPLE_EVENT = {
  host_id: 'uid-1',
  title: 'Test Dinner',
  tagline: 'A cozy evening',
  event_date: '2026-09-01T19:00:00Z',
  venue: 'The Garden Room',
  address: '123 Main St',
  dress_code: 'Smart casual',
  custom_details: [{ id: 'd_1', label: 'Parking', body: 'Free lot behind the theater' }],
  theme: 'olive',
  cover_url: 'https://cdn.example.com/existing.jpg',
}
```

Add this new `describe` block at the end of the file:

```ts
describe('custom detail sections', () => {
  it('prefills an existing custom detail section on load', async () => {
    makeSupabase()
    render(<HostEditPage params={PARAMS} />)
    await waitFor(() => expect(screen.getByRole('textbox', { name: /section label/i })).toHaveValue('Parking'))
    expect(screen.getByRole('textbox', { name: /details/i })).toHaveValue('Free lot behind the theater')
  })

  it('round-trips an edited section into the update payload', async () => {
    const sb = makeSupabase()
    render(<HostEditPage params={PARAMS} />)
    await waitFor(() => screen.getByRole('textbox', { name: /section label/i }))
    await userEvent.clear(screen.getByRole('textbox', { name: /section label/i }))
    await userEvent.type(screen.getByRole('textbox', { name: /section label/i }), 'Valet')
    await userEvent.click(screen.getByRole('button', { name: /update invite/i }))
    await waitFor(() => expect(mockPush).toHaveBeenCalled())
    expect(sb.update).toHaveBeenCalledWith(
      expect.objectContaining({
        custom_details: [expect.objectContaining({ label: 'Valet', body: 'Free lot behind the theater' })],
      })
    )
  })

  it('adding a new section and saving includes both the existing and new sections', async () => {
    const sb = makeSupabase()
    render(<HostEditPage params={PARAMS} />)
    await waitFor(() => screen.getByRole('button', { name: /add detail section/i }))
    await userEvent.click(screen.getByRole('button', { name: /add detail section/i }))
    const labelInputs = screen.getAllByRole('textbox', { name: /section label/i })
    await userEvent.type(labelInputs[1], 'Gift registry')
    const bodyInputs = screen.getAllByRole('textbox', { name: /details/i })
    await userEvent.type(bodyInputs[1], 'No gifts, just bring an appetite')
    await userEvent.click(screen.getByRole('button', { name: /update invite/i }))
    await waitFor(() => expect(mockPush).toHaveBeenCalled())
    expect(sb.update).toHaveBeenCalledWith(
      expect.objectContaining({
        custom_details: [
          expect.objectContaining({ label: 'Parking' }),
          expect.objectContaining({ label: 'Gift registry', body: 'No gifts, just bring an appetite' }),
        ],
      })
    )
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/host-edit-page.test.tsx -t "custom detail sections"`
Expected: FAIL — the section label/details fields don't exist yet on this page.

- [ ] **Step 3: Add state, load hydration, handlers, and payload field**

In `app/(host)/host/[id]/edit/page.tsx`, add this import:

```ts
import { generateCustomDetailId, sanitizeCustomDetails, type CustomDetailSection } from '@/lib/event-custom-details'
```

Add this state declaration right after `const [dressCode, setDressCode] = useState('')`:

```ts
  const [customDetails, setCustomDetails] = useState<CustomDetailSection[]>([])
```

In the `load()` function inside `useEffect`, update the `.select(...)` call to include the new column:

```ts
      const { data: ev, error: fetchError } = await supabase
        .from('events')
        .select('host_id,title,tagline,event_date,venue,address,dress_code,custom_details,theme,cover_url')
        .eq('id', params.id)
        .single()
```

Right after `setDressCode(ev.dress_code ?? '')`, add:

```ts
      setCustomDetails((ev.custom_details as CustomDetailSection[] | null) ?? [])
```

Add these handlers right after `onImageRemove`:

```ts
  function addCustomDetail() {
    setCustomDetails((current) => [...current, { id: generateCustomDetailId(), label: '', body: '' }])
  }

  function updateCustomDetail(id: string, patch: Partial<Pick<CustomDetailSection, 'label' | 'body'>>) {
    setCustomDetails((current) => current.map((section) => (section.id === id ? { ...section, ...patch } : section)))
  }

  function removeCustomDetail(id: string) {
    setCustomDetails((current) => current.filter((section) => section.id !== id))
  }
```

In `handleSubmit`'s update payload, add this field right after `dress_code: dressCode.trim() || null,`:

```ts
        custom_details: sanitizeCustomDetails(customDetails),
```

- [ ] **Step 4: Pass the new props to `HostCreateForm`**

In the `<HostCreateForm ... />` JSX, add right after `onDressCodeChange={setDressCode}`:

```tsx
      customDetails={customDetails}
      onAddCustomDetail={addCustomDetail}
      onCustomDetailChange={updateCustomDetail}
      onRemoveCustomDetail={removeCustomDetail}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest __tests__/host-edit-page.test.tsx`
Expected: PASS (all tests, including the 3 new ones)

- [ ] **Step 6: Commit**

```bash
git add app/\(host\)/host/\[id\]/edit/page.tsx __tests__/host-edit-page.test.tsx
git commit -m "Wire custom detail sections into event editing"
```

---

### Task 6: Display in `EventPaper`

**Files:**
- Modify: `components/sofra-v2/EventPaper.tsx`

- [ ] **Step 1: Add the prop**

In `components/sofra-v2/EventPaper.tsx`, add this import:

```ts
import type { CustomDetailSection } from '@/lib/event-custom-details'
```

In `EventPaperProps`, add right after `dressCode: string | null`:

```ts
  customDetails: CustomDetailSection[]
```

In the destructured function parameters, add right after `dressCode,`:

```ts
  customDetails,
```

- [ ] **Step 2: Render the sections**

In the `<dl className="sv2-event-facts">` block, add this right after the Dress code row (`{dressCode && <div><dt>Dress code</dt><dd>{dressCode}</dd></div>}`) and before the `{!isHost && (` Your RSVP row:

```tsx
              {customDetails.map((section) => (
                <div key={section.id}><dt>{section.label}</dt><dd>{section.body}</dd></div>
              ))}
```

- [ ] **Step 3: Commit**

```bash
git add components/sofra-v2/EventPaper.tsx
git commit -m "Render custom detail sections on the event detail page"
```

---

### Task 7: Wire `EventDetailClient`

**Files:**
- Modify: `app/(guest)/events/[id]/EventDetailClient.tsx`
- Test: `__tests__/event-detail-page.test.tsx`

- [ ] **Step 1: Write the failing test**

In `__tests__/event-detail-page.test.tsx`, add `custom_details: []` to `SAMPLE_EVENT`:

```ts
const SAMPLE_EVENT = {
  id: 'ev-1',
  host_id: HOST_UID,
  title: 'Casa Mekawi',
  tagline: 'An intimate gathering',
  event_date: '2026-09-01T19:00:00Z',
  venue: 'The Garden Room',
  address: '123 Main St',
  dress_code: 'Smart casual',
  custom_details: [],
  theme: 'ember',
  cover_url: null,
  is_published: true,
}
```

Add this new test at the very end of the file, right after the closing `})` of the last existing `describe` block (`'is replaced by the real guest grid once unlocked'` is the last test in the file, followed by a closing `})` at the end):

```ts

it('renders a custom detail section using the same row style as Dress code', async () => {
  makeSupabase({
    event: { ...SAMPLE_EVENT, custom_details: [{ id: 'd_1', label: 'Parking', body: 'Free lot behind the theater' }] },
  })
  render(<EventDetailPage params={PARAMS} />)
  await waitFor(() => expect(screen.getByText('Parking')).toBeInTheDocument())
  expect(screen.getByText('Free lot behind the theater')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/event-detail-page.test.tsx -t "renders a custom detail section"`
Expected: FAIL — `custom_details` isn't fetched or rendered yet.

- [ ] **Step 3: Add the field to the type, fetch, and prop-pass**

In `app/(guest)/events/[id]/EventDetailClient.tsx`, add this import:

```ts
import type { CustomDetailSection } from '@/lib/event-custom-details'
```

In the `EventRow` type, add right after `dress_code: string | null`:

```ts
  custom_details: CustomDetailSection[]
```

Update both `.select(...)` calls (there are two, both currently reading `'id,host_id,title,tagline,event_date,venue,address,dress_code,theme,cover_url,is_published'`) to:

```ts
          .select('id,host_id,title,tagline,event_date,venue,address,dress_code,custom_details,theme,cover_url,is_published')
```

In the `<EventPaper ... />` JSX, add right after `dressCode={event?.dress_code ?? null}`:

```tsx
      customDetails={event?.custom_details ?? []}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/event-detail-page.test.tsx`
Expected: PASS (all tests, including the new one)

- [ ] **Step 5: Commit**

```bash
git add app/\(guest\)/events/\[id\]/EventDetailClient.tsx __tests__/event-detail-page.test.tsx
git commit -m "Fetch and display custom_details on the event detail page"
```

---

### Task 8: Full verification and docs

**Files:**
- Modify: `docs/IMPLEMENTATION_STATUS.md`

- [ ] **Step 1: Run the full test suite**

Run: `npx jest --runInBand`
Expected: All new tests pass; no newly introduced failures (compare against the known pre-existing `design-preview-application.test.tsx` timeout failures already present before this change).

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: No new warnings/errors beyond the pre-existing `<img>` warnings.

- [ ] **Step 3: Verify with a clean worktree production build**

```bash
git worktree add /tmp/sofra-verify-details HEAD
# copy every file this plan touched into the worktree, then:
cd /tmp/sofra-verify-details && npm install && SOFRA_BUILD_DIST_DIR=.next-verify npm run build
```

Expected: Build succeeds. Then clean up:

```bash
cd <repo root> && git worktree remove /tmp/sofra-verify-details --force && git worktree prune
```

- [ ] **Step 4: Update `docs/IMPLEMENTATION_STATUS.md`**

Add a new entry under a `## Custom event detail sections (2026-08-20)` heading, describing: the new `custom_details` JSONB column and that it needs to be applied to the live database (matching how other uncommitted-to-live migrations are already flagged in this doc); that hosts can add/remove any number of label+body sections from the create/edit form; that they render in `EventPaper`'s existing fact-row style, always visible (not RSVP-gated); test/build verification results.

- [ ] **Step 5: Commit**

```bash
git add docs/IMPLEMENTATION_STATUS.md
git commit -m "Document custom event detail sections in IMPLEMENTATION_STATUS"
```
