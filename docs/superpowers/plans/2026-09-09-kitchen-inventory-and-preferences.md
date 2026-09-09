# Kitchen Inventory Sleekness and Preferences Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sleek multi-item staging for the Kitchen page's custom dish/ingredient entry (no per-item submit
button), kitchen-setup buttons that reflect already-complete state, custom items that respect category/role
filter tabs instead of appearing everywhere, an optional free-text supplement on the guest "avoid" question,
and raising the protein-preference cap from 2 to 3.

**Architecture:** Two small independent migrations (Task 1) unblock Tasks 3 and 4. Task 2 (protein cap) is
fully independent. Tasks 5 and 6 (category/role filtering) are independent of each other and must land
before Task 8, which depends on both (staged items must respect the same filters as saved ones) and on
Task 7 (the suggestion API must always return usable tags before the frontend can rely on that).

**Tech Stack:** Next.js App Router (client components), React 18, Supabase, Jest + Testing Library.

**Reference:** `docs/superpowers/specs/2026-09-09-kitchen-inventory-and-preferences-design.md` — read this
first for full rationale.

**Baseline before Task 1:** commit `e76a145` (current `main` HEAD in this plan's authoring session). Every
task's exact code below was read directly from the current file at that commit — if a later task's
starting point has shifted (e.g. line numbers), re-read the actual current file before editing; the shown
*surrounding code* is what to search for, not a line-number promise.

---

### Task 1: Two migrations

**Files:**
- Create: `supabase/migrations/20260909000001_add_event_kitchen_type.sql`
- Create: `supabase/migrations/20260909000002_add_taste_profile_avoid_other.sql`

- [ ] **Step 1: Write the kitchen-type migration**

```sql
alter table public.events
  add column if not exists kitchen_type text;

alter table public.events
  add constraint events_kitchen_type_check
  check (kitchen_type in ('independent', 'restaurant'));
```

- [ ] **Step 2: Write the avoid-other migration**

```sql
alter table public.taste_profiles
  add column if not exists avoid_other text;
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260909000001_add_event_kitchen_type.sql supabase/migrations/20260909000002_add_taste_profile_avoid_other.sql
git commit -m "Add events.kitchen_type and taste_profiles.avoid_other migrations"
```

These are not applied to the live database as part of this plan (no Supabase CLI/DB credentials assumed
available) — Task 3 and Task 4's application code changes still work against a database that hasn't run
these yet only in the sense that the new columns simply won't exist; document this the same way prior
"migration not yet applied" limitations have been documented in `docs/IMPLEMENTATION_STATUS.md` (Task 9's
final documentation step covers this).

---

### Task 2: Protein preference cap 2 → 3

**Files:**
- Modify: `lib/protein-preferences.ts`
- Modify: `lib/questionnaire.ts`
- Modify: `components/sofra-v2/PreferencesReceipt.tsx`
- Modify: `__tests__/protein-preferences.test.ts`

- [ ] **Step 1: Update the cap and the legacy-normalization slice**

In `lib/protein-preferences.ts`, change:

```ts
  if (specific.length >= 2) {
    return { preferences: [...specific], blocked: true }
  }
```

to:

```ts
  if (specific.length >= 3) {
    return { preferences: [...specific], blocked: true }
  }
```

And change (a few lines later in the same file, `normalizeProteinPreferences`):

```ts
  const unique = Array.from(new Set(normalized)).slice(0, 2)
```

to:

```ts
  const unique = Array.from(new Set(normalized)).slice(0, 3)
```

(This second change matters even though it's not the interactive cap — without it, legacy/normalized data
with 3 stored preferences would silently get truncated back to 2 on load.)

- [ ] **Step 2: Update the default helper text**

In `lib/questionnaire.ts`, change:

```ts
  protein: { title: 'WHAT SOUNDS BEST TONIGHT?', helperText: 'Choose up to two.' },
```

to:

```ts
  protein: { title: 'WHAT SOUNDS BEST TONIGHT?', helperText: 'Choose up to three.' },
```

- [ ] **Step 3: Update the component's fallback text**

In `components/sofra-v2/PreferencesReceipt.tsx`, change:

```tsx
        <p className="sv2-section-sub">{proteinHelperText || 'Choose up to two.'}</p>
```

to:

```tsx
        <p className="sv2-section-sub">{proteinHelperText || 'Choose up to three.'}</p>
```

- [ ] **Step 4: Update the existing test to prove 3 succeed and a 4th is blocked**

In `__tests__/protein-preferences.test.ts`, replace the `'applies the same selection rules to create and
edit state'` test body:

```ts
  it('applies the same selection rules to create and edit state', () => {
    expect(updateProteinPreferenceSelection([], 'fish')).toEqual({
      preferences: ['fish'], blocked: false,
    })
    expect(updateProteinPreferenceSelection(['fish'], 'grain_pasta')).toEqual({
      preferences: ['fish', 'grain_pasta'], blocked: false,
    })
    expect(updateProteinPreferenceSelection(['fish', 'grain_pasta'], 'chicken')).toEqual({
      preferences: ['fish', 'grain_pasta'], blocked: true,
    })
    expect(updateProteinPreferenceSelection(['fish', 'grain_pasta'], 'fish')).toEqual({
      preferences: ['grain_pasta'], blocked: false,
    })
    expect(updateProteinPreferenceSelection(['fish'], 'no_preference')).toEqual({
      preferences: ['no_preference'], blocked: false,
    })
    expect(updateProteinPreferenceSelection(['no_preference'], 'fish')).toEqual({
      preferences: ['fish'], blocked: false,
    })
  })
```

with:

```ts
  it('applies the same selection rules to create and edit state, now allowing three', () => {
    expect(updateProteinPreferenceSelection([], 'fish')).toEqual({
      preferences: ['fish'], blocked: false,
    })
    expect(updateProteinPreferenceSelection(['fish'], 'grain_pasta')).toEqual({
      preferences: ['fish', 'grain_pasta'], blocked: false,
    })
    expect(updateProteinPreferenceSelection(['fish', 'grain_pasta'], 'chicken')).toEqual({
      preferences: ['fish', 'grain_pasta', 'chicken'], blocked: false,
    })
    expect(updateProteinPreferenceSelection(['fish', 'grain_pasta', 'chicken'], 'shellfish')).toEqual({
      preferences: ['fish', 'grain_pasta', 'chicken'], blocked: true,
    })
    expect(updateProteinPreferenceSelection(['fish', 'grain_pasta', 'chicken'], 'fish')).toEqual({
      preferences: ['grain_pasta', 'chicken'], blocked: false,
    })
    expect(updateProteinPreferenceSelection(['fish'], 'no_preference')).toEqual({
      preferences: ['no_preference'], blocked: false,
    })
    expect(updateProteinPreferenceSelection(['no_preference'], 'fish')).toEqual({
      preferences: ['fish'], blocked: false,
    })
  })

  it('caps normalized legacy preferences at three, not two', () => {
    expect(normalizeProteinPreferences(['fish', 'grain_pasta', 'chicken', 'shellfish'], null))
      .toEqual(['fish', 'grain_pasta', 'chicken'])
  })
```

- [ ] **Step 5: Run the tests**

Run: `npx jest __tests__/protein-preferences.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/protein-preferences.ts lib/questionnaire.ts components/sofra-v2/PreferencesReceipt.tsx __tests__/protein-preferences.test.ts
git commit -m "Raise the protein preference cap from two to three"
```

---

### Task 3: "Anything you avoid?" free-text supplement

**Files:**
- Modify: `components/sofra-v2/PreferencesReceipt.tsx`
- Modify: `app/(guest)/events/[id]/rsvp/page.tsx`
- Modify: `app/(guest)/profile/preferences/page.tsx`
- Modify: `__tests__/rsvp-page.test.tsx`
- Modify: `__tests__/profile-preferences-page.test.tsx`

- [ ] **Step 1: Add the prop to `PreferencesReceiptProps` and destructure it**

In `components/sofra-v2/PreferencesReceipt.tsx`, change:

```ts
  avoid: string[]
  onToggleAvoid: (value: string) => void
```

to:

```ts
  avoid: string[]
  onToggleAvoid: (value: string) => void
  avoidOther: string
  onAvoidOtherChange: (value: string) => void
```

and change the destructured props:

```ts
  avoid,
  onToggleAvoid,
```

to:

```ts
  avoid,
  onToggleAvoid,
  avoidOther,
  onAvoidOtherChange,
```

- [ ] **Step 2: Render the field beneath the existing checkboxes**

Change:

```tsx
        <div className="sv2-checkbox-grid">
          {NOGOS.filter((item) => !hiddenCanonicalOptions.avoid?.includes(item)).map((item) => (
            <CheckboxRow
              key={item}
              label={avoidOptionLabels?.[item] || item}
              checked={avoid.includes(item)}
              onChange={() => onToggleAvoid(item)}
            />
          ))}
        </div>
        </div>}
```

to:

```tsx
        <div className="sv2-checkbox-grid">
          {NOGOS.filter((item) => !hiddenCanonicalOptions.avoid?.includes(item)).map((item) => (
            <CheckboxRow
              key={item}
              label={avoidOptionLabels?.[item] || item}
              checked={avoid.includes(item)}
              onChange={() => onToggleAvoid(item)}
            />
          ))}
        </div>
        <input
          type="text"
          className="sv2-avoid-other-input"
          placeholder="Anything else to avoid? (optional)"
          value={avoidOther}
          onChange={(e) => onAvoidOtherChange(e.target.value)}
          maxLength={200}
        />
        </div>}
```

- [ ] **Step 3: Wire it in the RSVP page**

In `app/(guest)/events/[id]/rsvp/page.tsx`, change:

```ts
  const [avoid, setAvoid] = useState<string[]>([])
```

to:

```ts
  const [avoid, setAvoid] = useState<string[]>([])
  const [avoidOther, setAvoidOther] = useState('')
```

Change:

```ts
        setAvoid((p.avoid as string[]) ?? [])
```

to:

```ts
        setAvoid((p.avoid as string[]) ?? [])
        setAvoidOther((p.avoid_other as string | null) ?? '')
```

Change (the `taste_profiles` upsert payload):

```ts
        {
          user_id: uidRef.current,
          dietary,
          avoid,
          protein_preferences: proteinPreferencesForSubmit,
```

to:

```ts
        {
          user_id: uidRef.current,
          dietary,
          avoid,
          avoid_other: avoidOther.trim() || null,
          protein_preferences: proteinPreferencesForSubmit,
```

Change the `<PreferencesReceipt>` invocation:

```tsx
        avoid={avoid}
        onToggleAvoid={(it) => toggleChip(avoid, setAvoid, it)}
```

to:

```tsx
        avoid={avoid}
        onToggleAvoid={(it) => toggleChip(avoid, setAvoid, it)}
        avoidOther={avoidOther}
        onAvoidOtherChange={setAvoidOther}
```

- [ ] **Step 4: Wire it in the standalone preferences editor**

In `app/(guest)/profile/preferences/page.tsx`, change:

```ts
type TasteProfileRow = {
  dietary: string[] | null
  avoid: string[] | null
```

to:

```ts
type TasteProfileRow = {
  dietary: string[] | null
  avoid: string[] | null
  avoid_other: string | null
```

Change:

```ts
  const [avoid, setAvoid] = useState<string[]>([])
```

to:

```ts
  const [avoid, setAvoid] = useState<string[]>([])
  const [avoidOther, setAvoidOther] = useState('')
```

Change:

```ts
      .select('dietary,avoid,protein_anchor,protein_preferences,flavor_preference,adventurousness')
```

to:

```ts
      .select('dietary,avoid,avoid_other,protein_anchor,protein_preferences,flavor_preference,adventurousness')
```

Change:

```ts
        setDietary(data.dietary ?? [])
        setAvoid(data.avoid ?? [])
```

to:

```ts
        setDietary(data.dietary ?? [])
        setAvoid(data.avoid ?? [])
        setAvoidOther(data.avoid_other ?? '')
```

Change (the `save()` upsert payload):

```ts
    const { error: saveError } = await supabase.from('taste_profiles').upsert({
      user_id: userId,
      dietary,
      avoid,
      protein_preferences: proteinPreferences,
```

to:

```ts
    const { error: saveError } = await supabase.from('taste_profiles').upsert({
      user_id: userId,
      dietary,
      avoid,
      avoid_other: avoidOther.trim() || null,
      protein_preferences: proteinPreferences,
```

Change the `<PreferencesReceipt>` invocation:

```tsx
      avoid={avoid}
      onToggleAvoid={(value) => toggleValue(avoid, value, setAvoid)}
```

to:

```tsx
      avoid={avoid}
      onToggleAvoid={(value) => toggleValue(avoid, value, setAvoid)}
      avoidOther={avoidOther}
      onAvoidOtherChange={setAvoidOther}
```

- [ ] **Step 5: Add a test to `__tests__/rsvp-page.test.tsx`**

Find the existing `'renders all avoid checkboxes'` test (around line 249) and add a new test right after it
in the same `describe`/file scope:

```tsx
it('round-trips the optional avoid-other text field', async () => {
  const sb = makeSupabase({
    profileRow: { user_id: 'uid-1', dietary: [], avoid: ['Nuts'], avoid_other: 'no cilantro please', flavor_preference: [], adventurousness: 50 },
  })
  render(<RsvpPage params={{ id: 'event-1' }} />)
  const input = await screen.findByPlaceholderText('Anything else to avoid? (optional)')
  expect(input).toHaveValue('no cilantro please')
  fireEvent.change(input, { target: { value: 'also no raw onions' } })
  fireEvent.click(screen.getByRole('button', { name: /save/i }))
  await waitFor(() => {
    const upsertCall = sb.tasteProfileUpsert.mock.calls[0][0]
    expect(upsertCall.avoid_other).toBe('also no raw onions')
  })
})
```

Read the actual current test file first to match its real `makeSupabase` signature, mock-tracking variable
names (e.g. however it currently exposes the `taste_profiles` upsert call for assertions), and the actual
save-button accessible name used elsewhere in the same file — adapt the illustrative snippet above to match
those exactly rather than introducing a new, inconsistent mocking pattern.

- [ ] **Step 6: Add an equivalent test to `__tests__/profile-preferences-page.test.tsx`**

This file's `makeSupabase(profile)` mock and save flow are simpler than the RSVP page's — match its actual
existing convention:

```tsx
it('round-trips the optional avoid-other text field', async () => {
  localStorage.setItem('sofra_user_id', 'guest-1')
  const sb = makeSupabase({
    dietary: [],
    avoid: ['Nuts'],
    avoid_other: 'no cilantro please',
    protein_anchor: null,
    protein_preferences: ['fish'],
    flavor_preference: [],
    adventurousness: 50,
  })
  render(<ProfilePreferencesPage />)

  const input = await screen.findByPlaceholderText('Anything else to avoid? (optional)')
  expect(input).toHaveValue('no cilantro please')
  fireEvent.change(input, { target: { value: 'also no raw onions' } })
  fireEvent.click(screen.getByRole('button', { name: 'SAVE MY PREFERENCES' }))

  await waitFor(() => expect(sb.upsert).toHaveBeenCalledWith(expect.objectContaining({
    user_id: 'guest-1',
    avoid_other: 'also no raw onions',
  }), { onConflict: 'user_id' }))
})
```

- [ ] **Step 7: Run the tests**

Run: `npx jest __tests__/rsvp-page.test.tsx __tests__/profile-preferences-page.test.tsx __tests__/design-preview.test.tsx __tests__/custom-question-field.test.tsx`

Expected: PASS. (The last two are included because they were found referencing `PreferencesReceipt`/`avoid`
in the earlier research pass — confirm they don't break from the new required props; if either renders
`<PreferencesReceipt>` directly without the two new props, add them there too, following the same pattern.)

- [ ] **Step 8: Commit**

```bash
git add components/sofra-v2/PreferencesReceipt.tsx "app/(guest)/events/[id]/rsvp/page.tsx" "app/(guest)/profile/preferences/page.tsx" __tests__/rsvp-page.test.tsx __tests__/profile-preferences-page.test.tsx
git commit -m "Add an optional free-text supplement to the avoid question"
```

---

### Task 4: Kitchen setup buttons reflect "already done"

**Files:**
- Modify: `app/(chef)/events/[id]/kitchen-setup/page.tsx`
- Modify: `components/ChefTabs.tsx`
- Modify: `__tests__/kitchen-setup-choice.test.tsx`
- Modify: `__tests__/chef-tabs.test.tsx`

- [ ] **Step 1: Read `kitchen_type` and skip the choice when already set**

In `app/(chef)/events/[id]/kitchen-setup/page.tsx`, change:

```ts
      const { data: event, error: eventError } = await supabase.from('events').select('host_id,chef_id,title').eq('id', params.id).maybeSingle()
      if (eventError || !event) { setError("Couldn't load this kitchen."); setLoading(false); return }
      const isManager = await isEventManager(supabase, params.id, stored, event.host_id)
      const isChef = event.chef_id === stored && !isManager
      if (!isManager && !isChef) { router.replace(`/events/${params.id}`); return }
      setManager(isManager)
      setDelegatedChef(isChef)
      setTitle(event.title)
      setLoading(false)
```

to:

```ts
      const { data: event, error: eventError } = await supabase.from('events').select('host_id,chef_id,title,kitchen_type').eq('id', params.id).maybeSingle()
      if (eventError || !event) { setError("Couldn't load this kitchen."); setLoading(false); return }
      const isManager = await isEventManager(supabase, params.id, stored, event.host_id)
      const isChef = event.chef_id === stored && !isManager
      if (!isManager && !isChef) { router.replace(`/events/${params.id}`); return }
      const delegate = isChef ? '&delegate=1' : ''
      if (event.kitchen_type === 'restaurant') { router.replace(`/events/${params.id}/out?from_page=${fromPage}${delegate}`); return }
      if (event.kitchen_type === 'independent') { router.replace(`/kitchen?from=${params.id}&from_page=${fromPage}${delegate}`); return }
      setManager(isManager)
      setDelegatedChef(isChef)
      setTitle(event.title)
      setLoading(false)
```

(`fromPage` is already computed above this effect from `search.get('from_page')`, so it's in scope.)

- [ ] **Step 2: Persist the choice in `choose()`**

Change:

```ts
  async function choose(kind: KitchenKind) {
    setBusy(kind)
    setError('')
    if (manager) {
      const { error: updateError } = await supabase.from('events').update({ chef_id: null, kitchen_status: 'pending' }).eq('id', params.id)
      if (updateError) { setError('Could not open this kitchen. Try again.'); setBusy(null); return }
    }
```

to:

```ts
  async function choose(kind: KitchenKind) {
    setBusy(kind)
    setError('')
    const updatePayload = manager
      ? { chef_id: null, kitchen_status: 'pending', kitchen_type: kind }
      : { kitchen_type: kind }
    const { error: updateError } = await supabase.from('events').update(updatePayload).eq('id', params.id)
    if (updateError) { setError('Could not open this kitchen. Try again.'); setBusy(null); return }
```

(Previously, a delegated chef's `choose()` never wrote to `events` at all — only a manager's did. Now both
write, since the delegated chef's choice also needs to persist `kitchen_type` so the redirect-skip in Step 1
works for them too on a future visit.)

- [ ] **Step 3: Update `__tests__/kitchen-setup-choice.test.tsx`**

The `makeSupabase` mock in this file returns a fixed `{ host_id, chef_id, title }` row with no
`kitchen_type` — add `kitchen_type: null` to it so existing tests (which exercise the first-time choice)
keep working unchanged:

```ts
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({
              data: { host_id: 'host-1', chef_id: chefId, title: 'Sunday Table', kitchen_type: null },
              error: null,
            }),
          }),
        }),
        update,
      }
```

The two existing tests assert `db.update` was called with exactly `{ chef_id: null, kitchen_status:
'pending' }` (manager) — since Step 2 above adds `kitchen_type: kind` to that same call, update both
assertions:

```ts
  expect(db.update).toHaveBeenCalledWith({ chef_id: null, kitchen_status: 'pending' })
```

to:

```ts
  expect(db.update).toHaveBeenCalledWith({ chef_id: null, kitchen_status: 'pending', kitchen_type: 'restaurant' })
```

and the second test (`'gives an assigned chef the same choice...'`, which currently asserts
`expect(db.update).not.toHaveBeenCalled()`) now needs updating since a delegated chef's choice DOES call
update per Step 2:

```ts
  await userEvent.click(await screen.findByRole('button', { name: /home \/ other/i }))
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/kitchen?from=event-1&from_page=table&delegate=1'))
  expect(db.update).not.toHaveBeenCalled()
```

to:

```ts
  await userEvent.click(await screen.findByRole('button', { name: /home \/ other/i }))
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/kitchen?from=event-1&from_page=table&delegate=1'))
  expect(db.update).toHaveBeenCalledWith({ kitchen_type: 'independent' })
```

Add two new tests for the redirect-skip behavior:

```ts
it('redirects straight to the restaurant flow when kitchen_type is already set, without showing the choice', async () => {
  localStorage.setItem('sofra_user_id', 'host-1')
  const updateEq = jest.fn().mockResolvedValue({ error: null })
  const update = jest.fn().mockReturnValue({ eq: updateEq })
  const sb = {
    from: jest.fn(() => ({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          maybeSingle: jest.fn().mockResolvedValue({
            data: { host_id: 'host-1', chef_id: null, title: 'Sunday Table', kitchen_type: 'restaurant' },
            error: null,
          }),
        }),
      }),
      update,
    })),
  }
  ;(createClient as jest.Mock).mockReturnValue(sb)
  ;(isEventManager as jest.Mock).mockResolvedValue(true)

  render(<KitchenSetupChoicePage params={{ id: 'event-1' }} />)

  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/events/event-1/out?from_page=table'))
  expect(screen.queryByRole('button', { name: /restaurant/i })).not.toBeInTheDocument()
})

it('redirects straight to the kitchen when kitchen_type is already independent', async () => {
  localStorage.setItem('sofra_user_id', 'host-1')
  const update = jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) })
  const sb = {
    from: jest.fn(() => ({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          maybeSingle: jest.fn().mockResolvedValue({
            data: { host_id: 'host-1', chef_id: null, title: 'Sunday Table', kitchen_type: 'independent' },
            error: null,
          }),
        }),
      }),
      update,
    })),
  }
  ;(createClient as jest.Mock).mockReturnValue(sb)
  ;(isEventManager as jest.Mock).mockResolvedValue(true)

  render(<KitchenSetupChoicePage params={{ id: 'event-1' }} />)

  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/kitchen?from=event-1&from_page=table'))
  expect(screen.queryByRole('button', { name: /home \/ other/i })).not.toBeInTheDocument()
})
```

- [ ] **Step 4: Update `ChefTabs.tsx` to show "Kitchen set up ✓" once complete**

Change:

```ts
  useEffect(() => {
    if (restrictedChef) return
    async function checkHost() {
      const userId = localStorage.getItem('sofra_user_id')
      if (!userId) return
      const { data } = await supabase.from('events').select('host_id').eq('id', eventId).maybeSingle()
      const allowed = data !== null && await isEventManager(supabase, eventId, userId, data.host_id)
      setCanDelegateKitchen(allowed)
      if (allowed && new URLSearchParams(window.location.search).get('kitchenShare') === '1') setKitchenSharing(true)
    }
    void checkHost()
  }, [eventId, restrictedChef]) // eslint-disable-line react-hooks/exhaustive-deps
```

to:

```ts
  const [kitchenComplete, setKitchenComplete] = useState(false)

  useEffect(() => {
    if (restrictedChef) return
    async function checkHost() {
      const userId = localStorage.getItem('sofra_user_id')
      if (!userId) return
      const { data } = await supabase.from('events').select('host_id,kitchen_status').eq('id', eventId).maybeSingle()
      const allowed = data !== null && await isEventManager(supabase, eventId, userId, data.host_id)
      setCanDelegateKitchen(allowed)
      setKitchenComplete(data?.kitchen_status === 'complete')
      if (allowed && new URLSearchParams(window.location.search).get('kitchenShare') === '1') setKitchenSharing(true)
    }
    void checkHost()
  }, [eventId, restrictedChef]) // eslint-disable-line react-hooks/exhaustive-deps
```

Change:

```tsx
        {canDelegateKitchen && <div className="sv2-chef-kitchen-actions">
          <button
            onClick={fillKitchenMyself}
            className="sv2-chef-kitchen-action"
            aria-label="Fill kitchen myself"
          >
            Fill Kitchen Myself
          </button>
          <div className="sv2-chef-share-wrap">
            <button
              onClick={() => setKitchenSharing((open) => !open)}
              className="sv2-chef-kitchen-action"
              aria-expanded={kitchenSharing}
            >
              Send To A Chef
            </button>
            {kitchenSharing && (
              <div className="sv2-host-invite-popover sv2-chef-share-popover" aria-label="Chef sharing options">
                <p>This link lets one person choose whether they are working with a restaurant menu or at home / elsewhere.</p>
                <button type="button" onClick={() => void copyKitchenLink()}>{kitchenCopied ? 'COPIED!' : 'COPY CHEF LINK'}</button>
                <button type="button" onClick={() => void shareKitchenWhatsApp()}>SEND VIA WHATSAPP</button>
              </div>
            )}
          </div>
        </div>}
```

to:

```tsx
        {canDelegateKitchen && (kitchenComplete ? (
          <div className="sv2-chef-kitchen-actions">
            <span className="sv2-chef-kitchen-complete" aria-label="Kitchen set up">Kitchen set up ✓</span>
          </div>
        ) : (
          <div className="sv2-chef-kitchen-actions">
            <button
              onClick={fillKitchenMyself}
              className="sv2-chef-kitchen-action"
              aria-label="Fill kitchen myself"
            >
              Fill Kitchen Myself
            </button>
            <div className="sv2-chef-share-wrap">
              <button
                onClick={() => setKitchenSharing((open) => !open)}
                className="sv2-chef-kitchen-action"
                aria-expanded={kitchenSharing}
              >
                Send To A Chef
              </button>
              {kitchenSharing && (
                <div className="sv2-host-invite-popover sv2-chef-share-popover" aria-label="Chef sharing options">
                  <p>This link lets one person choose whether they are working with a restaurant menu or at home / elsewhere.</p>
                  <button type="button" onClick={() => void copyKitchenLink()}>{kitchenCopied ? 'COPIED!' : 'COPY CHEF LINK'}</button>
                  <button type="button" onClick={() => void shareKitchenWhatsApp()}>SEND VIA WHATSAPP</button>
                </div>
              )}
            </div>
          </div>
        ))}
```

- [ ] **Step 5: Add `.sv2-chef-kitchen-complete` styling**

Append to `components/sofra-v2/sofra-v2.css`:

```css
.sv2-chef-kitchen-complete{color:var(--sf-intel-text,#f4ead9);font-size:13px;font-family:system-ui,sans-serif;opacity:.85}
```

Read the actual current stylesheet near `.sv2-chef-kitchen-action` first to match whatever color token
convention is already used there (the `--sf-intel-text` fallback above is illustrative — use the real
token/hex already in use for this component's text color).

- [ ] **Step 6: Update `__tests__/chef-tabs.test.tsx`**

The `makeSupabase` mock's `events` table only returns `{ host_id }` — add `kitchen_status` to it (defaulted
to `'pending'` so the three existing "shows kitchen-delegation actions" tests keep passing unchanged):

```ts
function makeSupabase({ isCohost = false, kitchenStatus = 'pending' }: { isCohost?: boolean; kitchenStatus?: string } = {}) {
  const sb = {
    from: jest.fn((table: string) => {
      if (table === 'events') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({ data: { host_id: HOST_UID, kitchen_status: kitchenStatus }, error: null }),
            }),
          }),
        }
      }
```

(Keep the rest of the function, including the `event_cohosts` branch, unchanged.)

Add a new test:

```ts
it('replaces the delegation buttons with a quiet label once the kitchen is complete', async () => {
  localStorage.setItem('sofra_user_id', HOST_UID)
  makeSupabase({ kitchenStatus: 'complete' })
  render(<ChefTabs eventId="event-1" active="table" title="Dinner" />)
  expect(await screen.findByText('Kitchen set up ✓')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Fill kitchen myself' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Send To A Chef' })).not.toBeInTheDocument()
})
```

- [ ] **Step 7: Run the tests**

Run: `npx jest __tests__/kitchen-setup-choice.test.tsx __tests__/chef-tabs.test.tsx`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add "app/(chef)/events/[id]/kitchen-setup/page.tsx" components/ChefTabs.tsx components/sofra-v2/sofra-v2.css __tests__/kitchen-setup-choice.test.tsx __tests__/chef-tabs.test.tsx
git commit -m "Kitchen setup buttons reflect already-chosen type and completed status"
```

---

### Task 5: Custom pantry items respect the category filter

**Files:**
- Modify: `lib/ingredient-presets.ts`
- Modify: `app/(chef)/kitchen/page.tsx`
- Modify: `__tests__/kitchen-page.test.tsx`

- [ ] **Step 1: Add the category-inference helper**

Append to `lib/ingredient-presets.ts`:

```ts
// Best-effort mapping from a custom pantry item's stored Protein-group tag
// (lib/kitchen-tags.ts's DESCRIPTIVE_TAG_GROUPS "Protein" group) to the
// curated category it belongs to in this picker. An item whose tags don't
// map to any of these returns null and is only ever shown under "All" --
// never guessed into the wrong tab, and never excluded from "All".
const PROTEIN_TAG_TO_CATEGORY: Record<string, (typeof INGREDIENT_CATEGORIES)[number]> = {
  beef: 'Proteins', lamb: 'Proteins', chicken: 'Proteins', turkey: 'Proteins', pork: 'Proteins',
  duck: 'Proteins', fish: 'Proteins', shellfish: 'Proteins', legume: 'Proteins', tofu: 'Proteins', mushroom: 'Proteins',
  vegetable: 'Vegetables',
  fruit: 'Fruits',
  dairy: 'Dairy & Eggs', egg: 'Dairy & Eggs',
  grain: 'Grains & Starches', pasta: 'Grains & Starches',
}

export function inferIngredientCategory(tags: readonly string[]): (typeof INGREDIENT_CATEGORIES)[number] | null {
  for (const tag of tags) {
    const mapped = PROTEIN_TAG_TO_CATEGORY[tag]
    if (mapped) return mapped
  }
  return null
}
```

- [ ] **Step 2: Filter `customPantry` by the selected category**

In `app/(chef)/kitchen/page.tsx`, change the import:

```ts
import { INGREDIENT_PRESETS, INGREDIENT_CATEGORIES } from '@/lib/ingredient-presets'
```

to:

```ts
import { INGREDIENT_PRESETS, INGREDIENT_CATEGORIES, inferIngredientCategory } from '@/lib/ingredient-presets'
```

Change:

```ts
  const customPantry = pantry.filter((item) => !presetPantryNamesLC.has(item.name.toLowerCase()))
```

to:

```ts
  const customPantry = pantry.filter((item) => {
    if (presetPantryNamesLC.has(item.name.toLowerCase())) return false
    if (ingredientCategory === 'All') return true
    return inferIngredientCategory(item.tags) === ingredientCategory
  })
```

- [ ] **Step 3: Add tests to `__tests__/kitchen-page.test.tsx`**

Add a new custom pantry row to the test file's fixtures and a test proving the filter works. Read the
current file's `pantryRows` seeding (`beforeEach`) and the `Vegetables`/`Proteins` tab button labels first
to match exact conventions, then add:

```tsx
test('a custom pantry item only shows under its inferred category tab, not every tab', async () => {
  pantryRows.push({
    id: 'pantry-carrot',
    name: 'Heirloom Carrots',
    week_of: '2026-08-03',
    tags: ['vegetable', 'savory'],
    contains_allergens: [],
  })
  render(<KitchenPage />)
  activatePantry()
  await screen.findByRole('button', { name: 'Heirloom Carrots' })

  fireEvent.click(screen.getByRole('button', { name: 'Proteins' }))
  expect(screen.queryByRole('button', { name: 'Heirloom Carrots' })).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Vegetables' }))
  expect(screen.getByRole('button', { name: 'Heirloom Carrots' })).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'All' }))
  expect(screen.getByRole('button', { name: 'Heirloom Carrots' })).toBeInTheDocument()
})

test('a custom pantry item with no confident category mapping only shows under All', async () => {
  pantryRows.push({
    id: 'pantry-mystery',
    name: 'House Spice Blend',
    week_of: '2026-08-03',
    tags: ['savory'],
    contains_allergens: [],
  })
  render(<KitchenPage />)
  activatePantry()
  await screen.findByRole('button', { name: 'House Spice Blend' })

  fireEvent.click(screen.getByRole('button', { name: 'Proteins' }))
  expect(screen.queryByRole('button', { name: 'House Spice Blend' })).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'All' }))
  expect(screen.getByRole('button', { name: 'House Spice Blend' })).toBeInTheDocument()
})
```

- [ ] **Step 4: Run the tests**

Run: `npx jest __tests__/kitchen-page.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/ingredient-presets.ts "app/(chef)/kitchen/page.tsx" __tests__/kitchen-page.test.tsx
git commit -m "Filter custom pantry items by their inferred category tab"
```

---

### Task 6: Add a Role filter row for signature dishes

**Files:**
- Modify: `app/(chef)/kitchen/page.tsx`
- Modify: `__tests__/kitchen-page.test.tsx`

- [ ] **Step 1: Import `DISH_ROLES` and add the filter constant/state**

Change the import block:

```ts
import {
  DISH_PRESETS,
  CUISINES,
  isDishRole,
  withDishRole,
  withoutDishRoles,
  canonicalDishName,
  dishPresetKey,
  type DishPreset,
} from '@/lib/dish-presets'
```

to:

```ts
import {
  DISH_PRESETS,
  CUISINES,
  DISH_ROLES,
  isDishRole,
  withDishRole,
  withoutDishRoles,
  canonicalDishName,
  dishPresetKey,
  type DishPreset,
} from '@/lib/dish-presets'
```

Change:

```ts
const CUISINE_FILTERS = ['All', ...CUISINES] as const
type CuisineFilter = (typeof CUISINE_FILTERS)[number]
```

to:

```ts
const CUISINE_FILTERS = ['All', ...CUISINES] as const
type CuisineFilter = (typeof CUISINE_FILTERS)[number]

const ROLE_FILTERS = ['All', ...DISH_ROLES] as const
type RoleFilter = (typeof ROLE_FILTERS)[number]
```

Change:

```ts
  const [presetCuisine, setPresetCuisine] = useState<CuisineFilter>('All')
```

to:

```ts
  const [presetCuisine, setPresetCuisine] = useState<CuisineFilter>('All')
  const [presetRole, setPresetRole] = useState<RoleFilter>('All')
```

- [ ] **Step 2: Filter presets and custom signatures by role**

Change:

```ts
  const filteredPresets =
    presetCuisine === 'All'
      ? DISH_PRESETS
      : DISH_PRESETS.filter((d) => d.cuisine === presetCuisine)
```

to:

```ts
  const filteredPresets = DISH_PRESETS.filter((d) =>
    (presetCuisine === 'All' || d.cuisine === presetCuisine)
    && (presetRole === 'All' || d.role === presetRole)
  )
```

Change:

```ts
  const presetSignatureNamesLC = new Set(DISH_PRESETS.map((preset) => canonicalDishName(preset.name)))
  const customSignatures = signatures.filter(
    (signature) => !signature.preset_key && !presetSignatureNamesLC.has(canonicalDishName(signature.name))
  )
```

to:

```ts
  const presetSignatureNamesLC = new Set(DISH_PRESETS.map((preset) => canonicalDishName(preset.name)))
  const customSignatures = signatures.filter((signature) => {
    if (signature.preset_key || presetSignatureNamesLC.has(canonicalDishName(signature.name))) return false
    if (presetRole === 'All') return true
    return signature.tags.find(isDishRole) === presetRole
  })
```

- [ ] **Step 3: Render the Role tab row**

Change (right after the existing Cuisine `sv2-preset-categories` div, before the chips grid):

```tsx
                <div className="sv2-preset-categories" aria-label="Signature categories">
                  {CUISINE_FILTERS.map((c) => {
                    const on = presetCuisine === c
                    return (
                      <button
                        key={c}
                        className="chip"
                        onClick={() => setPresetCuisine(c)}
                        style={{
                          background: on ? C.burgundy : 'transparent',
                          borderColor: on ? C.onBurgundy : C.cream,
                          color: on ? C.onBurgundy : C.cream,
                          padding: '5px 11px',
                          fontSize: 12,
                          fontFamily: 'system-ui, sans-serif',
                          borderRadius: 14,
                        }}
                      >
                        {c}
                      </button>
                    )
                  })}
                </div>
                <div
                  className="sv2-production-inventory-chips sv2-preset-subjects"
                  aria-label="Signature dishes"
                  tabIndex={0}
                >
```

to:

```tsx
                <div className="sv2-preset-categories" aria-label="Signature cuisine categories">
                  {CUISINE_FILTERS.map((c) => {
                    const on = presetCuisine === c
                    return (
                      <button
                        key={c}
                        className="chip"
                        onClick={() => setPresetCuisine(c)}
                        style={{
                          background: on ? C.burgundy : 'transparent',
                          borderColor: on ? C.onBurgundy : C.cream,
                          color: on ? C.onBurgundy : C.cream,
                          padding: '5px 11px',
                          fontSize: 12,
                          fontFamily: 'system-ui, sans-serif',
                          borderRadius: 14,
                        }}
                      >
                        {c}
                      </button>
                    )
                  })}
                </div>
                <div className="sv2-preset-categories" aria-label="Signature role categories">
                  {ROLE_FILTERS.map((r) => {
                    const on = presetRole === r
                    return (
                      <button
                        key={r}
                        className="chip"
                        onClick={() => setPresetRole(r)}
                        style={{
                          background: on ? C.burgundy : 'transparent',
                          borderColor: on ? C.onBurgundy : C.cream,
                          color: on ? C.onBurgundy : C.cream,
                          padding: '5px 11px',
                          fontSize: 12,
                          fontFamily: 'system-ui, sans-serif',
                          borderRadius: 14,
                        }}
                      >
                        {r === 'All' ? 'All' : formatTagLabel(r)}
                      </button>
                    )
                  })}
                </div>
                <div
                  className="sv2-production-inventory-chips sv2-preset-subjects"
                  aria-label="Signature dishes"
                  tabIndex={0}
                >
```

- [ ] **Step 4: Add tests to `__tests__/kitchen-page.test.tsx`**

```tsx
test('a preset dish only shows under its matching Role tab, not every role', async () => {
  render(<KitchenPage />)
  await screen.findByRole('button', { name: 'Hummus' }) // Levantine starter preset

  fireEvent.click(screen.getByRole('button', { name: 'Main' }))
  expect(screen.queryByRole('button', { name: 'Hummus' })).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Starter' }))
  expect(screen.getByRole('button', { name: 'Hummus' })).toBeInTheDocument()
})

test('a custom signature dish only shows under its matching Role tab', async () => {
  signatureRows.push({
    id: 'sig-custom-dessert',
    name: 'Rosewater Panna Cotta',
    tags: ['dessert', 'savory'],
    contains_allergens: [],
    preset_key: null,
  })
  render(<KitchenPage />)
  await screen.findByRole('button', { name: 'Rosewater Panna Cotta' })

  fireEvent.click(screen.getByRole('button', { name: 'Main' }))
  expect(screen.queryByRole('button', { name: 'Rosewater Panna Cotta' })).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Dessert' }))
  expect(screen.getByRole('button', { name: 'Rosewater Panna Cotta' })).toBeInTheDocument()
})
```

Read the current file's `DISH_PRESETS`/seeded fixture data first to confirm `'Hummus'` is genuinely a
`starter`-role Levantine preset (it was as of the design-spec research pass, `lib/dish-presets.ts:64`) and
adjust the illustrative names/roles above if the actual current data differs.

- [ ] **Step 5: Run the tests**

Run: `npx jest __tests__/kitchen-page.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "app/(chef)/kitchen/page.tsx" __tests__/kitchen-page.test.tsx
git commit -m "Add a Role filter row for signature dishes"
```

---

### Task 7: Suggestion API always returns usable tags

**Files:**
- Modify: `app/api/signatures/suggest-metadata/route.ts`
- Find or create: `__tests__/suggest-metadata-route.test.ts` (check first whether a test file for this route
  already exists under a different name — search `__tests__` for `suggest-metadata` before creating a new
  one)

- [ ] **Step 1: Read the current file to confirm exact current state**

Read `app/api/signatures/suggest-metadata/route.ts` in full — Task 1-6 didn't touch it, so it should still
match what's quoted below, but confirm before editing.

- [ ] **Step 2: Soften the prompt to always commit to a guess**

Change:

```ts
  const roleInstruction = kind === 'signature'
    ? `Choose exactly one role from: ${DISH_ROLES.join(', ')}. Also choose at least one descriptive label.`
    : 'This is a raw pantry ingredient. Never assign a dish role.'
  const prompt = `Classify the kitchen item named "${name}" for a cooking and menu-planning application.
${roleInstruction}
Select only labels strongly implied by the ordinary meaning of the name. Do not invent ingredients, preparation methods, temperature, diet claims, or allergens that the name does not support. Allergens are cautious suggestions for the user to review, not a safety guarantee. Return only the requested structured JSON.`
```

to:

```ts
  const roleInstruction = kind === 'signature'
    ? `Choose exactly one role from: ${DISH_ROLES.join(', ')}. Also choose at least one descriptive label.`
    : 'This is a raw pantry ingredient. Never assign a dish role.'
  const prompt = `Classify the kitchen item named "${name}" for a cooking and menu-planning application.
${roleInstruction}
Always commit to your single best reasonable guess for every relevant label, even if the name is unfamiliar, vague, or ambiguous -- a human reviews every suggestion afterward and can correct it, so an imperfect guess is far more useful than no guess at all. Only choose from the exact provided label lists. Do not invent ingredients, preparation methods, or claims the name doesn't support, but never simply omit a label out of caution. Allergens are cautious suggestions for the user to review, not a safety guarantee. Return only the requested structured JSON.`
```

- [ ] **Step 3: Remove the "no reliable tags" failure modes, replacing with a deterministic fallback**

Change:

```ts
    if (kind === 'signature') {
      const role = tags.find(isDishRole) ?? 'flex'
      tags = withDishRole(withoutDishRoles(tags), role)
      if (withoutDishRoles(tags).length === 0) {
        return NextResponse.json({ error: 'No reliable descriptive tags were found. Choose them manually.' }, { status: 422 })
      }
    } else {
      tags = pantryTagsForPersistence(tags)
      if (tags.length === 0) {
        return NextResponse.json({ error: 'No reliable tags were found. Choose them manually.' }, { status: 422 })
      }
    }
```

to:

```ts
    if (kind === 'signature') {
      const role = tags.find(isDishRole) ?? 'flex'
      const descriptive = withoutDishRoles(tags)
      // The prompt asks the model to always commit to a guess, but this never trusts that blindly -- if it
      // still returns nothing usable, fall back to one safe, neutral descriptive tag so the response is
      // never empty (submitKitchen's own validation already requires at least one descriptive tag).
      tags = withDishRole(descriptive.length > 0 ? descriptive : ['savory'], role)
    } else {
      const pantryTags = pantryTagsForPersistence(tags)
      tags = pantryTags.length > 0 ? pantryTags : ['savory']
    }
```

- [ ] **Step 4: Search for and update any existing test that asserts the old 422 behavior**

Run: `grep -rn "No reliable" __tests__/ app/`

If a test file exercises `suggest-metadata`'s route handler directly and asserts a 422/"No reliable..."
response for a low-confidence name, update it to assert the new fallback (`tags` includes `'savory'` plus
the guessed role for signatures) instead. If no such test exists (the route may currently only be exercised
indirectly through `app/(chef)/kitchen/page.tsx`'s mocked `fetch` in `__tests__/kitchen-page.test.tsx`,
which never hits the real route handler), note that in the implementer's self-review rather than inventing
a new dedicated route test file speculatively — Task 8 will exercise the always-guess behavior end-to-end
through the Kitchen page's own tests, using its existing `global.fetch` mock.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit -p .`

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add "app/api/signatures/suggest-metadata/route.ts"
git commit -m "Suggestion API always returns a usable tag guess instead of declining"
```

---

### Task 8: Sleek multi-item staging for custom dishes/ingredients

This is the largest task. It depends on Task 6 (Role filter, so staged signature drafts can be filtered the
same way as saved ones) and Task 7 (the suggestion API must always return usable tags before blur-to-stage
can rely on that).

**Files:**
- Modify: `app/(chef)/kitchen/page.tsx`
- Modify: `__tests__/kitchen-page.test.tsx`

- [ ] **Step 1: Read the current file in full immediately before starting**

Tasks 5 and 6 both touched `app/(chef)/kitchen/page.tsx` — re-read the actual current file now to confirm
exact current line numbers and surrounding code before applying any of the steps below. The snippets below
show the code to search for; trust the file over any line-number assumption.

- [ ] **Step 2: Add the staged-draft types and state**

Near the top of the file, alongside the existing `Signature`/`PantryItem` types, add:

```ts
type StagedSignatureDraft = { localId: string; name: string; tags: string[]; allergens: string[] }
type StagedPantryDraft = { localId: string; name: string; tags: string[]; allergens: string[] }
```

Inside `KitchenPageInner`, near the other signature-related state (after `sigSuggestionRequestRef`), add:

```ts
  const [stagedSignatureDrafts, setStagedSignatureDrafts] = useState<StagedSignatureDraft[]>([])
  const sigStageIntentRef = useRef(false)
  const suppressSigSuggestRef = useRef(false)
  const sigDraftContainerRef = useRef<HTMLDivElement>(null)
```

And near the other pantry-related state (after `pantrySuggestionRequestRef`), add:

```ts
  const [stagedPantryDrafts, setStagedPantryDrafts] = useState<StagedPantryDraft[]>([])
  const pantryStageIntentRef = useRef(false)
  const suppressPantrySuggestRef = useRef(false)
  const pantryDraftContainerRef = useRef<HTMLDivElement>(null)
```

Add a shared local-id generator near `currentMonday`:

```ts
let draftIdCounter = 0
function nextLocalDraftId(): string {
  draftIdCounter += 1
  return `draft-${draftIdCounter}`
}
```

- [ ] **Step 3: Suppress one re-suggestion when a staged draft is reopened for editing**

Change the signature suggestion effect:

```ts
  useEffect(() => {
    const name = sigName.trim()
    if (editingSignatureId || !name) {
      sigSuggestionRequestRef.current += 1
      setSigSuggesting(false)
      return
    }
    const requestId = sigSuggestionRequestRef.current + 1
    sigSuggestionRequestRef.current = requestId
    setSigSuggesting(true)
    const timer = setTimeout(() => void suggestKitchenMetadata('signature', name, requestId), 550)
    return () => clearTimeout(timer)
  }, [editingSignatureId, sigName]) // eslint-disable-line react-hooks/exhaustive-deps
```

to:

```ts
  useEffect(() => {
    const name = sigName.trim()
    if (suppressSigSuggestRef.current) {
      suppressSigSuggestRef.current = false
      sigSuggestionRequestRef.current += 1
      setSigSuggesting(false)
      return
    }
    if (editingSignatureId || !name) {
      sigSuggestionRequestRef.current += 1
      setSigSuggesting(false)
      return
    }
    const requestId = sigSuggestionRequestRef.current + 1
    sigSuggestionRequestRef.current = requestId
    setSigSuggesting(true)
    const timer = setTimeout(() => void suggestKitchenMetadata('signature', name, requestId), 550)
    return () => clearTimeout(timer)
  }, [editingSignatureId, sigName]) // eslint-disable-line react-hooks/exhaustive-deps
```

Apply the equivalent change to the pantry suggestion effect:

```ts
  useEffect(() => {
    const name = pantryName.trim()
    if (!name) {
      pantrySuggestionRequestRef.current += 1
      setPantrySuggesting(false)
      return
    }
    const requestId = pantrySuggestionRequestRef.current + 1
    pantrySuggestionRequestRef.current = requestId
    setPantrySuggesting(true)
    const timer = setTimeout(() => void suggestKitchenMetadata('pantry', name, requestId), 550)
    return () => clearTimeout(timer)
  }, [pantryName]) // eslint-disable-line react-hooks/exhaustive-deps
```

to:

```ts
  useEffect(() => {
    const name = pantryName.trim()
    if (suppressPantrySuggestRef.current) {
      suppressPantrySuggestRef.current = false
      pantrySuggestionRequestRef.current += 1
      setPantrySuggesting(false)
      return
    }
    if (!name) {
      pantrySuggestionRequestRef.current += 1
      setPantrySuggesting(false)
      return
    }
    const requestId = pantrySuggestionRequestRef.current + 1
    pantrySuggestionRequestRef.current = requestId
    setPantrySuggesting(true)
    const timer = setTimeout(() => void suggestKitchenMetadata('pantry', name, requestId), 550)
    return () => clearTimeout(timer)
  }, [pantryName]) // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 4: Auto-stage once a pending suggestion resolves**

Add two new effects (place them right after the two effects modified in Step 3):

```ts
  useEffect(() => {
    if (sigSuggestionReady && sigStageIntentRef.current) {
      sigStageIntentRef.current = false
      tryStageSignatureDraft()
    }
  }, [sigSuggestionReady]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (pantrySuggestionReady && pantryStageIntentRef.current) {
      pantryStageIntentRef.current = false
      tryStagePantryDraft()
    }
  }, [pantrySuggestionReady]) // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 5: Write `tryStageSignatureDraft`/`tryStagePantryDraft` and the blur/focus handlers**

Add these functions (a reasonable spot is right before `submitKitchen`, since they're used by the JSX blur
handlers wired in Step 7):

```ts
  function tryStageSignatureDraft() {
    const name = sigName.trim()
    if (!name) return
    if (sigSuggesting && !sigSuggestionReady) {
      sigStageIntentRef.current = true
      return
    }
    const hasRole = sigTagsList.some(isDishRole)
    const hasDescriptive = withoutDishRoles(sigTagsList).length > 0
    if (!hasRole || !hasDescriptive) return
    setStagedSignatureDrafts((prev) => [...prev, { localId: nextLocalDraftId(), name, tags: [...sigTagsList], allergens: [...sigAllergensList] }])
    cancelSignatureEdit()
  }

  function editStagedSignatureDraft(draft: StagedSignatureDraft) {
    setStagedSignatureDrafts((prev) => prev.filter((d) => d.localId !== draft.localId))
    suppressSigSuggestRef.current = true
    setSigName(draft.name)
    setSigTagsList(draft.tags)
    setSigAllergensList(draft.allergens)
    setSigTagsRevealed(true)
    setSigSuggestionReady(true)
    sigDraftContainerRef.current?.querySelector('input')?.focus()
  }

  function handleSignatureDraftBlur() {
    setTimeout(() => {
      const active = document.activeElement
      if (!sigDraftContainerRef.current) return
      if (!active || !sigDraftContainerRef.current.contains(active)) tryStageSignatureDraft()
    }, 0)
  }

  function tryStagePantryDraft() {
    const name = pantryName.trim()
    if (!name) return
    if (pantrySuggesting && !pantrySuggestionReady) {
      pantryStageIntentRef.current = true
      return
    }
    const tags = pantryTagsForPersistence(pantryTagsList)
    if (tags.length === 0) return
    setStagedPantryDrafts((prev) => [...prev, { localId: nextLocalDraftId(), name, tags, allergens: [...pantryAllergensList] }])
    cancelPantryEdit()
  }

  function editStagedPantryDraft(draft: StagedPantryDraft) {
    setStagedPantryDrafts((prev) => prev.filter((d) => d.localId !== draft.localId))
    suppressPantrySuggestRef.current = true
    setPantryName(draft.name)
    setPantryTagsList(draft.tags)
    setPantryAllergensList(draft.allergens)
    setPantryTagsRevealed(true)
    setPantrySuggestionReady(true)
    pantryDraftContainerRef.current?.querySelector('input')?.focus()
  }

  function handlePantryDraftBlur() {
    setTimeout(() => {
      const active = document.activeElement
      if (!pantryDraftContainerRef.current) return
      if (!active || !pantryDraftContainerRef.current.contains(active)) tryStagePantryDraft()
    }, 0)
  }
```

- [ ] **Step 6: Update the "has anything selected" checks**

Change:

```ts
  const pantryHasAnythingSelected = selectedIngredients.length > 0
    || Boolean(pantryName.trim())
    || (!nothingInPantry && pantry.length > 0)
  const signatureHasAnythingSelected = selectedDishKeys.length > 0
    || pendingRemovedSignatureIds.length > 0
    || Boolean(sigName.trim() || editingSignatureId || sigTagsList.length || sigAllergensList.length)
```

to:

```ts
  const pantryHasAnythingSelected = selectedIngredients.length > 0
    || stagedPantryDrafts.length > 0
    || Boolean(pantryName.trim())
    || (!nothingInPantry && pantry.length > 0)
  const signatureHasAnythingSelected = selectedDishKeys.length > 0
    || pendingRemovedSignatureIds.length > 0
    || stagedSignatureDrafts.length > 0
    || Boolean(sigName.trim() || editingSignatureId || sigTagsList.length || sigAllergensList.length)
```

- [ ] **Step 7: Wire the blur/focus handlers onto the existing draft-editing containers**

For signatures, change the opening tag of the existing "Add your own dish" wrapper div:

```tsx
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  marginTop: 14,
                  paddingTop: 14,
                  borderTop: `1px solid ${C.line}`,
                }}
              >
                <div
                  style={{
                    color: C.faint,
                    fontSize: 11,
                    fontFamily: 'system-ui, sans-serif',
                    letterSpacing: 0.5,
                    textTransform: 'uppercase',
                  }}
                >
                  {editingSignatureId ? 'Edit signature dish' : 'Add your own dish'}
                </div>
```

to (adding `ref`/`onBlur`/`onFocus` to the outer div only — its inner content is unchanged):

```tsx
              <div
                ref={sigDraftContainerRef}
                onBlur={handleSignatureDraftBlur}
                onFocus={() => { sigStageIntentRef.current = false }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  marginTop: 14,
                  paddingTop: 14,
                  borderTop: `1px solid ${C.line}`,
                }}
              >
                <div
                  style={{
                    color: C.faint,
                    fontSize: 11,
                    fontFamily: 'system-ui, sans-serif',
                    letterSpacing: 0.5,
                    textTransform: 'uppercase',
                  }}
                >
                  {editingSignatureId ? 'Edit signature dish' : 'Add your own dish'}
                </div>
```

For pantry, the input/suggestion/picker/error blocks are currently separate sibling elements (not one
wrapping div) — introduce a new wrapping div around all of them. Change:

```tsx
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <input
                  className="field sm"
                  placeholder="Add an ingredient…"
                  value={pantryName}
                  onChange={(e) => {
                    setNothingInPantry(false)
                    setPantryName(e.target.value)
                    setPantryAddError('')
                    setPantryTagsList([])
                    setPantryAllergensList([])
                    setPantryTagsRevealed(false)
                    setPantrySuggestionReady(false)
                  }}
                />
              </div>
              {pantrySuggesting && <SuggestionLoadingNotice />}
              {pantrySuggestionReady && <SuggestionReviewNotice />}
              {/* Tag/allergen chips apply to whichever pantry insert fires next —
                  the manual "Add" button OR the preset "Add selected" batch —
                  and clear on success. Same UX pattern as signatures. */}
              {pantryTagsRevealed && <><div style={{ marginTop: 12 }}>
                <TagGroupsPicker
                  groups={PANTRY_TAG_GROUPS}
                  selected={pantryTagsList}
                  onToggle={togglePantryTag}
                />
              </div>
              <div
                style={{
                  color: C.faint,
                  fontSize: 11,
                  fontFamily: 'system-ui, sans-serif',
                  marginTop: 10,
                }}
              >
                Contains allergens
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                {KITCHEN_ALLERGENS.map((a) => {
                  const on = pantryAllergensList.includes(a)
                  return (
                    <button
                      key={a}
                      onClick={() => togglePantryAllergen(a)}
                      style={vocabChip(on, true)}
                      aria-pressed={on}
                    >
                      {formatTagLabel(a)}
                    </button>
                  )
                })}
              </div>
              </>}

              {pantryAddError && (
                <p style={{ color: C.rose, fontSize: 13, marginTop: 8 }}>{pantryAddError}</p>
              )}
```

to:

```tsx
              <div
                ref={pantryDraftContainerRef}
                onBlur={handlePantryDraftBlur}
                onFocus={() => { pantryStageIntentRef.current = false }}
              >
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <input
                  className="field sm"
                  placeholder="Add an ingredient…"
                  value={pantryName}
                  onChange={(e) => {
                    setNothingInPantry(false)
                    setPantryName(e.target.value)
                    setPantryAddError('')
                    setPantryTagsList([])
                    setPantryAllergensList([])
                    setPantryTagsRevealed(false)
                    setPantrySuggestionReady(false)
                  }}
                />
              </div>
              {pantrySuggesting && <SuggestionLoadingNotice />}
              {pantrySuggestionReady && <SuggestionReviewNotice />}
              {/* Tag/allergen chips apply to whichever pantry insert fires next —
                  the manual "Add" button OR the preset "Add selected" batch —
                  and clear on success. Same UX pattern as signatures. */}
              {pantryTagsRevealed && <><div style={{ marginTop: 12 }}>
                <TagGroupsPicker
                  groups={PANTRY_TAG_GROUPS}
                  selected={pantryTagsList}
                  onToggle={togglePantryTag}
                />
              </div>
              <div
                style={{
                  color: C.faint,
                  fontSize: 11,
                  fontFamily: 'system-ui, sans-serif',
                  marginTop: 10,
                }}
              >
                Contains allergens
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                {KITCHEN_ALLERGENS.map((a) => {
                  const on = pantryAllergensList.includes(a)
                  return (
                    <button
                      key={a}
                      onClick={() => togglePantryAllergen(a)}
                      style={vocabChip(on, true)}
                      aria-pressed={on}
                    >
                      {formatTagLabel(a)}
                    </button>
                  )
                })}
              </div>
              </>}

              {pantryAddError && (
                <p style={{ color: C.rose, fontSize: 13, marginTop: 8 }}>{pantryAddError}</p>
              )}
              </div>
```

- [ ] **Step 8: Render staged drafts as name-only chips with an edit pencil**

Change (the Signatures chip grid):

```tsx
                  {customSignatures.map((signature) => (
                    <button key={signature.id} type="button" aria-pressed={!pendingRemovedSignatureIds.includes(signature.id)} onClick={() => toggleSignatureRemoval(signature)} style={presetChip(!pendingRemovedSignatureIds.includes(signature.id))}>
                      {signature.name}
                    </button>
                  ))}
```

to:

```tsx
                  {customSignatures.map((signature) => (
                    <button key={signature.id} type="button" aria-pressed={!pendingRemovedSignatureIds.includes(signature.id)} onClick={() => toggleSignatureRemoval(signature)} style={presetChip(!pendingRemovedSignatureIds.includes(signature.id))}>
                      {signature.name}
                    </button>
                  ))}
                  {stagedSignatureDrafts
                    .filter((draft) => presetRole === 'All' || draft.tags.find(isDishRole) === presetRole)
                    .map((draft) => (
                      <span key={draft.localId} className="sv2-staged-draft-chip">
                        <button type="button" aria-pressed="true" style={presetChip(true)} disabled>{draft.name}</button>
                        <button type="button" aria-label={`Edit ${draft.name}`} onClick={() => editStagedSignatureDraft(draft)} className="sv2-staged-draft-edit">✎</button>
                      </span>
                    ))}
```

Change (the Pantry chip grid):

```tsx
                  {customPantry.map((item) => nothingInPantry ? (
                    <button key={item.id} type="button" aria-pressed="false" style={presetChip(false)} onClick={() => setNothingInPantry(false)}>{item.name}</button>
                  ) : (
                    <button key={item.id} type="button" aria-pressed={!pendingRemovedPantryIds.includes(item.id)} style={presetChip(!pendingRemovedPantryIds.includes(item.id))} onClick={() => togglePantryRemoval(item)}>{item.name}</button>
                  ))}
```

to:

```tsx
                  {customPantry.map((item) => nothingInPantry ? (
                    <button key={item.id} type="button" aria-pressed="false" style={presetChip(false)} onClick={() => setNothingInPantry(false)}>{item.name}</button>
                  ) : (
                    <button key={item.id} type="button" aria-pressed={!pendingRemovedPantryIds.includes(item.id)} style={presetChip(!pendingRemovedPantryIds.includes(item.id))} onClick={() => togglePantryRemoval(item)}>{item.name}</button>
                  ))}
                  {stagedPantryDrafts
                    .filter((draft) => ingredientCategory === 'All' || inferIngredientCategory(draft.tags) === ingredientCategory)
                    .map((draft) => (
                      <span key={draft.localId} className="sv2-staged-draft-chip">
                        <button type="button" aria-pressed="true" style={presetChip(true)} disabled>{draft.name}</button>
                        <button type="button" aria-label={`Edit ${draft.name}`} onClick={() => editStagedPantryDraft(draft)} className="sv2-staged-draft-edit">✎</button>
                      </span>
                    ))}
```

Add the two small styling classes to `components/sofra-v2/sofra-v2.css`:

```css
.sv2-staged-draft-chip{display:inline-flex;align-items:center;gap:4px}
.sv2-staged-draft-edit{width:20px;height:20px;border-radius:50%;border:none;background:rgba(255,255,255,.25);cursor:pointer;font-size:11px;line-height:1}
```

- [ ] **Step 9: Extend `submitKitchen`'s `KitchenOp` union and batch**

Change:

```ts
    type KitchenOp =
      | { kind: 'dishInsert'; key: string }
      | { kind: 'sigRemove'; id: string }
      | { kind: 'sigForm' }
      | { kind: 'pantryClearAll'; id: string }
      | { kind: 'pantryRemove'; id: string }
      | { kind: 'ingredientInsert'; name: string }
      | { kind: 'pantryForm' }
```

to:

```ts
    type KitchenOp =
      | { kind: 'dishInsert'; key: string }
      | { kind: 'sigRemove'; id: string }
      | { kind: 'sigForm' }
      | { kind: 'stagedSignature'; localId: string }
      | { kind: 'pantryClearAll'; id: string }
      | { kind: 'pantryRemove'; id: string }
      | { kind: 'ingredientInsert'; name: string }
      | { kind: 'pantryForm' }
      | { kind: 'stagedPantry'; localId: string }
```

Change:

```ts
      ...(sigFormOperation ? [{ meta: { kind: 'sigForm' } as KitchenOp, run: () => sigFormOperation }] : []),
      ...pantryClearIds.map((id) => ({
```

to:

```ts
      ...(sigFormOperation ? [{ meta: { kind: 'sigForm' } as KitchenOp, run: () => sigFormOperation }] : []),
      ...stagedSignatureDrafts.map((draft) => ({
        meta: { kind: 'stagedSignature', localId: draft.localId } as KitchenOp,
        run: () => supabase.from('signatures').insert({
          chef_id: uid, name: draft.name, tags: Array.from(new Set(draft.tags)), contains_allergens: draft.allergens,
          novelty_score: null, is_substantial: null,
        }),
      })),
      ...pantryClearIds.map((id) => ({
```

Change:

```ts
      ...(pantryFormOperation ? [{ meta: { kind: 'pantryForm' } as KitchenOp, run: () => pantryFormOperation }] : []),
    ]
```

to:

```ts
      ...(pantryFormOperation ? [{ meta: { kind: 'pantryForm' } as KitchenOp, run: () => pantryFormOperation }] : []),
      ...stagedPantryDrafts.map((draft) => ({
        meta: { kind: 'stagedPantry', localId: draft.localId } as KitchenOp,
        run: () => supabase.from('pantry_items').insert({
          chef_id: uid, name: draft.name, week_of: weekOf, tags: draft.tags, contains_allergens: draft.allergens,
        }),
      })),
    ]
```

- [ ] **Step 10: Reconcile staged drafts on partial failure**

Change:

```ts
    const failedDishKeys = new Set(failed.filter((m) => m.kind === 'dishInsert').map((m) => (m as { key: string }).key))
    const failedSigRemoveIds = new Set(failed.filter((m) => m.kind === 'sigRemove').map((m) => (m as { id: string }).id))
    const sigFormFailed = failed.some((m) => m.kind === 'sigForm')
    const failedPantryClearIds = new Set(failed.filter((m) => m.kind === 'pantryClearAll').map((m) => (m as { id: string }).id))
    const failedPantryRemoveIds = new Set(failed.filter((m) => m.kind === 'pantryRemove').map((m) => (m as { id: string }).id))
    const failedIngredientNames = new Set(failed.filter((m) => m.kind === 'ingredientInsert').map((m) => (m as { name: string }).name))
    const pantryFormFailed = failed.some((m) => m.kind === 'pantryForm')
```

to:

```ts
    const failedDishKeys = new Set(failed.filter((m) => m.kind === 'dishInsert').map((m) => (m as { key: string }).key))
    const failedSigRemoveIds = new Set(failed.filter((m) => m.kind === 'sigRemove').map((m) => (m as { id: string }).id))
    const sigFormFailed = failed.some((m) => m.kind === 'sigForm')
    const failedStagedSignatureIds = new Set(failed.filter((m) => m.kind === 'stagedSignature').map((m) => (m as { localId: string }).localId))
    const failedPantryClearIds = new Set(failed.filter((m) => m.kind === 'pantryClearAll').map((m) => (m as { id: string }).id))
    const failedPantryRemoveIds = new Set(failed.filter((m) => m.kind === 'pantryRemove').map((m) => (m as { id: string }).id))
    const failedIngredientNames = new Set(failed.filter((m) => m.kind === 'ingredientInsert').map((m) => (m as { name: string }).name))
    const pantryFormFailed = failed.some((m) => m.kind === 'pantryForm')
    const failedStagedPantryIds = new Set(failed.filter((m) => m.kind === 'stagedPantry').map((m) => (m as { localId: string }).localId))
```

Change:

```ts
    setSelectedDishKeys((prev) => prev.filter((k) => failedDishKeys.has(k)))
    setPendingRemovedSignatureIds((prev) => prev.filter((id) => failedSigRemoveIds.has(id)))
    if (!sigFormFailed) cancelSignatureEdit()
```

to:

```ts
    setSelectedDishKeys((prev) => prev.filter((k) => failedDishKeys.has(k)))
    setPendingRemovedSignatureIds((prev) => prev.filter((id) => failedSigRemoveIds.has(id)))
    setStagedSignatureDrafts((prev) => prev.filter((d) => failedStagedSignatureIds.has(d.localId)))
    if (!sigFormFailed) cancelSignatureEdit()
```

Change:

```ts
    setSelectedIngredients((prev) => prev.filter((n) => failedIngredientNames.has(n)))
    if (!pantryFormFailed) cancelPantryEdit()
```

to:

```ts
    setSelectedIngredients((prev) => prev.filter((n) => failedIngredientNames.has(n)))
    setStagedPantryDrafts((prev) => prev.filter((d) => failedStagedPantryIds.has(d.localId)))
    if (!pantryFormFailed) cancelPantryEdit()
```

- [ ] **Step 11: Run the existing suite once before adding new tests**

Run: `npx jest __tests__/kitchen-page.test.tsx`

Expected: PASS — everything through Step 10 is additive (new state, new ops, new reconciliation
branches) and shouldn't change any existing behavior. If anything existing breaks, fix it before continuing
to new tests.

- [ ] **Step 12: Add the new tests**

Read the current file's mock `builder(table)` and `beforeEach` first (Task 5/6 additions may have touched
it) to match its real current shape, then add:

```tsx
test('a valid custom dish stages as a name-only chip when the draft area loses focus', async () => {
  render(<KitchenPage />)
  await screen.findByRole('button', { name: 'Roast Chicken' })

  fireEvent.change(screen.getByPlaceholderText('Add a signature dish…'), { target: { value: 'Grilled Salmon' } })
  await screen.findByRole('button', { name: 'Main' }) // suggestion resolved
  fireEvent.blur(screen.getByPlaceholderText('Add a signature dish…'), { relatedTarget: document.body })

  await waitFor(() => expect(screen.getByRole('button', { name: 'Grilled Salmon' })).toBeInTheDocument())
  expect(screen.getByPlaceholderText('Add a signature dish…')).toHaveValue('')
  expect(writes.some((w) => w.table === 'signatures' && w.kind === 'insert')).toBe(false)
})

test('blurring before the suggestion resolves still stages once it\'s ready', async () => {
  render(<KitchenPage />)
  await screen.findByRole('button', { name: 'Roast Chicken' })

  const input = screen.getByPlaceholderText('Add a signature dish…')
  fireEvent.change(input, { target: { value: 'Grilled Salmon' } })
  fireEvent.blur(input, { relatedTarget: document.body })

  await waitFor(() => expect(screen.getByRole('button', { name: 'Grilled Salmon' })).toBeInTheDocument())
})

test('editing a staged draft removes it from the list and repopulates the form', async () => {
  render(<KitchenPage />)
  await screen.findByRole('button', { name: 'Roast Chicken' })

  fireEvent.change(screen.getByPlaceholderText('Add a signature dish…'), { target: { value: 'Grilled Salmon' } })
  await screen.findByRole('button', { name: 'Main' })
  fireEvent.blur(screen.getByPlaceholderText('Add a signature dish…'), { relatedTarget: document.body })
  await screen.findByRole('button', { name: 'Grilled Salmon' })

  fireEvent.click(screen.getByRole('button', { name: 'Edit Grilled Salmon' }))
  expect(screen.queryByRole('button', { name: 'Grilled Salmon' })).not.toBeInTheDocument()
  expect(screen.getByPlaceholderText('Add a signature dish…')).toHaveValue('Grilled Salmon')
  expect(screen.getByRole('button', { name: 'Main' })).toHaveAttribute('aria-pressed', 'true')
})

test('multiple staged dish and ingredient drafts submit together in one batch', async () => {
  render(<KitchenPage />)
  await screen.findByRole('button', { name: 'Roast Chicken' })

  fireEvent.change(screen.getByPlaceholderText('Add a signature dish…'), { target: { value: 'Grilled Salmon' } })
  await screen.findByRole('button', { name: 'Main' })
  fireEvent.blur(screen.getByPlaceholderText('Add a signature dish…'), { relatedTarget: document.body })
  await screen.findByRole('button', { name: 'Grilled Salmon' })

  activatePantry()
  fireEvent.change(screen.getByPlaceholderText('Add an ingredient…'), { target: { value: 'Fresh Basil' } })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Savory' })).toBeInTheDocument())
  fireEvent.blur(screen.getByPlaceholderText('Add an ingredient…'), { relatedTarget: document.body })
  await screen.findByRole('button', { name: 'Fresh Basil' })

  fireEvent.click(screen.getByRole('button', { name: 'UPDATE' }))

  await waitFor(() => {
    expect(writes.some((w) => w.table === 'signatures' && w.kind === 'insert' && w.payload.name === 'Grilled Salmon')).toBe(true)
    expect(writes.some((w) => w.table === 'pantry_items' && w.kind === 'insert' && w.payload.name === 'Fresh Basil')).toBe(true)
  })
})
```

Read the actual current `builder(table)` mock's `insert` behavior first — if it needs a `.select().single()`
chain to resolve successfully for `signatures` inserts (matching how preset-dish inserts already work per
`submitKitchen`'s existing `dishInsert` operations), confirm whether the new `stagedSignature`/`stagedPantry`
insert calls (which, per Step 9 above, do NOT chain `.select().single()` for the staged case, matching the
existing plain `sigFormOperation` insert shape) resolve correctly against the current mock without needing
`.single()` — adjust the mock's `insert`/`delete` chain only if a real gap is found, rather than assuming.

- [ ] **Step 13: Run the tests and iterate to green**

Run: `npx jest __tests__/kitchen-page.test.tsx --verbose`

Expected: PASS — all existing tests plus the new ones in Step 12.

- [ ] **Step 14: Type-check**

Run: `npx tsc --noEmit -p .`

Expected: no errors.

- [ ] **Step 15: Run the full suite**

Run: `npx jest --silent`

Expected: no new failures beyond the known pre-existing baseline (4 unrelated failing suites:
`login-page.test.tsx`, `events-page.test.tsx`, `event-detail-page.test.tsx`,
`design-preview-application.test.tsx`).

- [ ] **Step 16: Self-review**

Before committing, re-read the complete `submitKitchen` function once more end to end (it's now been
touched by this task on top of the prior session's Task-1/fix-up work) and confirm: every new `KitchenOp`
variant has a matching `failed*` set AND a matching state-reconciliation line; the blur-container `onBlur`
handlers don't accidentally fire on every keystroke (only on actual focus-loss); `suppressSigSuggestRef`/
`suppressPantrySuggestRef` are each read and reset exactly once per reopened draft (no risk of permanently
stuck suppression).

- [ ] **Step 17: Commit**

```bash
git add "app/(chef)/kitchen/page.tsx" components/sofra-v2/sofra-v2.css __tests__/kitchen-page.test.tsx
git commit -m "Sleek multi-item staging for custom dishes and ingredients"
```

---

### Task 9: Documentation

**Files:**
- Modify: `docs/IMPLEMENTATION_STATUS.md`

- [ ] **Step 1: Add a dated section**

Add after the most recent existing entry:

```markdown
# Kitchen inventory sleekness and preferences (2026-09-09)

- Adding a custom signature dish or pantry ingredient no longer needs its own submit button. The
  suggestion API now always commits to a best guess across every relevant tag group (role, protein,
  texture, method, temperature, flavor) instead of ever declining for low confidence; that guess is shown
  while typing, and stepping away from the draft area (blur) auto-stages it as a name-only chip — no Enter
  key required, mobile-first. A small edit pencil on the staged chip reopens it (repopulating the form and
  removing it from the staged list) if the guess needs correcting. Multiple staged drafts across both
  signatures and pantry submit together with the existing single page-wide submit action, using the same
  per-operation partial-failure reconciliation already built for the rest of this page — a failed staged
  insert stays staged for retry; a succeeded one clears.
- Signature dishes gained a Role filter row (Starter/Main/Side/Dessert/Flex) alongside the existing Cuisine
  tabs, and custom/staged dishes are now filterable by it. Custom pantry ingredients are now filtered by
  their inferred category (derived from their existing protein/base tag) instead of always appearing under
  every tab; an ingredient with no confident category mapping shows only under "All".
- The recurring "Fill Kitchen Myself" / "Send To A Chef" header pair is replaced with a quiet "Kitchen set
  up ✓" label once `kitchen_status` is `'complete'`. The independent-vs-restaurant kitchen-type choice is
  now persisted (`events.kitchen_type`, migration `20260909000001_add_event_kitchen_type.sql`) and skipped
  entirely on repeat visits once already chosen.
- The "Anything you avoid?" question gained an optional free-text supplement (`taste_profiles.avoid_other`,
  migration `20260909000002_add_taste_profile_avoid_other.sql`) on both the guest RSVP flow and the host's
  own `/profile/preferences` editor. It is not fed into any scoring/matching logic — guest-facing context
  for the host, same as other free-text questionnaire answers.
- The protein preference question ("What sounds best tonight?") now allows 3 selections instead of 2.
- **Known limitation:** neither new migration has been applied to the live database in this environment (no
  Supabase CLI/DB credentials available this session) — `events.kitchen_type` and
  `taste_profiles.avoid_other` need to be applied before the corresponding features work end-to-end in
  production.
```

- [ ] **Step 2: Commit**

```bash
git add docs/IMPLEMENTATION_STATUS.md
git commit -m "Document Kitchen inventory sleekness and preferences changes"
```

---

## Acceptance criteria (from the spec)

- [ ] Typing a valid custom dish/ingredient and stepping away stages it as a name-only chip — no per-item
      submit button exists.
- [ ] The suggestion API never declines for low confidence; it always returns a usable guess.
- [ ] A staged draft's edit pencil reopens it (repopulating the form, removing it from the staged list) in
      the existing tag-picker UI.
- [ ] Multiple staged drafts (dish + ingredient) submit together with the one existing page-wide submit
      button; partial failure only leaves the genuinely-failed ones staged for retry.
- [ ] Custom pantry items only appear under their inferred category tab (and "All"), never every tab.
- [ ] Signature dishes have a working Role filter row; custom/staged dishes respect it.
- [ ] The recurring Kitchen/Table/Menu/Recipes header shows a quiet "already done" label once
      `kitchen_status` is complete, instead of always showing Fill/Send buttons.
- [ ] The independent-vs-restaurant choice is never re-asked once already made for an event.
- [ ] The avoid question has a working optional free-text field, on both the RSVP and profile-preferences
      surfaces.
- [ ] The protein preference question allows exactly 3 selections, not 2 or unlimited.
- [ ] No pre-existing test regresses; the known 4-suite baseline is unchanged.
