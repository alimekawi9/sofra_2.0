# Kitchen Scroll Transition and Unified Submit — Design

## Goal

`app/(chef)/kitchen/page.tsx` currently has two independently-submitted sections, "Your signatures" and
"This week's pantry," each with its own SUBMIT/UPDATE button. Replace that with: a sticky, scroll-driven
crossfade where scrolling past Signatures makes it fade out while Pantry fades into the same spot (a true
shared-frame transition, not two separately-scrolling cards); one single submit button after Pantry that
saves everything from both sections at once; pantry ingredient removal becomes staged (like signatures
already are) instead of deleting immediately on click; and the "Edit a saved pantry item" dropdown is
removed entirely (pantry items can still be removed by clicking their chip — that's not "editing").
Signature dish editing (`editingSignatureId` and its own edit-in-place form) is untouched — this request is
about pantry ingredients specifically.

## Background: what already exists

- Both sections are plain `<section className="sv2-kitchen-card ...">` elements stacked in a fragment
  (`app/(chef)/kitchen/page.tsx:714-1082`), each with its own preset-chip picker
  (`.sv2-preset-subjects{max-height:116px;overflow-y:auto}` — already height-bounded with internal scroll,
  `components/sofra-v2/sofra-v2.css:1823`), its own custom add-form, and its own submit button.
- **Signatures** (`saveSignatureChanges`, `app/(chef)/kitchen/page.tsx:247-300`): batches preset
  inserts (`selectedDishKeys`), staged removals (`pendingRemovedSignatureIds`), and the custom-dish
  form (insert or, if `editingSignatureId` is set, update) via `Promise.allSettled`. On success, clears
  pending state and reloads. Clicking a saved signature chip toggles `pendingRemovedSignatureIds` — already
  staged, nothing deletes until submit (`toggleSignatureRemoval`, line 429).
- **Pantry** (`savePantryAndContinue`, lines 573-628): batches preset inserts (`selectedIngredients`), the
  custom-ingredient form, and (if `nothingInPantry` is set) a bulk-delete of everything — but **removal of
  one saved chip is NOT staged**: clicking a saved pantry chip calls `deletePantryItem` directly
  (lines 532-549), which deletes it from the database immediately, independent of any submit button.
- `savePantryAndContinue` finishes by calling `handlePantryDone()` (lines 551-571), which does one of two
  things depending on context: if this Kitchen visit came from an event (`backEvent` is set), it marks that
  event's `is_published`/`kitchen_status` and navigates away — this is also what powers the button reading
  "Publish Invite" for an unpublished draft (line 1071-1072); otherwise it just flashes "Saved ✓" for 2
  seconds. This dual behavior must be preserved exactly — it's the actual kitchen-completion/invite-publish
  mechanism for the whole app, not just a pantry detail.
- The "Edit a saved pantry item" `<select>` (lines 972-990) sets `editingPantryId`, which repurposes the
  add-ingredient form into an update form (`editPantryItem`/`cancelPantryEdit`, lines 439-456) and changes
  `savePantryAndContinue`'s form operation from insert to update (line 598-600).
- `framer-motion` is already a project dependency (added for the host-entry-plate feature,
  `components/sofra-v2/HostEntryPlate.tsx`) — this design reuses it via `useScroll`/`useTransform` rather
  than a hand-rolled scroll listener or `IntersectionObserver`.
- Approved during brainstorming (with a live interactive mockup): a **sticky-pinned crossfade** — the two
  cards occupy the same spot in a `position: sticky` frame while an extra-tall wrapper scrolls underneath,
  driving a scroll-progress-linked opacity swap. Same behavior on mobile and desktop (no separate fallback
  for now).

## Design

### 1. New `pendingRemovedPantryIds` state, mirroring signatures exactly

```ts
const [pendingRemovedPantryIds, setPendingRemovedPantryIds] = useState<string[]>([])
```

New handler, directly mirroring `toggleSignatureRemoval`:

```ts
function togglePantryRemoval(item: PantryItem) {
  setPendingRemovedPantryIds(prev => prev.includes(item.id) ? prev.filter(id => id !== item.id) : [...prev, item.id])
}
```

`deletePantryItem` (the immediate-delete function) is deleted entirely, along with `pantryDeleteError`
state (nothing left to fail-and-report immediately — a staged removal only fails as part of the unified
submit, same as signature removal today).

Every chip click site that currently calls `deletePantryItem` switches to `togglePantryRemoval`, and every
"is this chip currently on" check gains the same `&& !pendingRemovedPantryIds.includes(...)` guard
`toggleDishSelection`'s presets already use. Concretely (lines 942-964):

```tsx
{customPantry.map((item) => nothingInPantry ? (
  <button key={item.id} type="button" aria-pressed="false" style={presetChip(false)} onClick={() => setNothingInPantry(false)}>{item.name}</button>
) : (
  <button key={item.id} type="button" aria-pressed={!pendingRemovedPantryIds.includes(item.id)} style={presetChip(!pendingRemovedPantryIds.includes(item.id))} onClick={() => togglePantryRemoval(item)}>{item.name}</button>
))}
{filteredIngredients.map((name) => {
  const saved = pantry.find((item) => item.name.toLowerCase() === name.toLowerCase())
  const on = (!nothingInPantry && Boolean(saved) && !pendingRemovedPantryIds.includes(saved?.id ?? '')) || selectedIngredients.includes(name)
  return saved && !nothingInPantry ? (
    <button key={name} type="button" aria-pressed={on} style={presetChip(on)} onClick={() => togglePantryRemoval(saved)}>{name}</button>
  ) : saved ? (
    <button key={name} type="button" onClick={() => setNothingInPantry(false)} style={presetChip(false)} aria-pressed="false">{name}</button>
  ) : (
    <button key={name} onClick={() => toggleIngredientSelection(name)} style={presetChip(on)} aria-pressed={on}>{name}</button>
  )
})}
```

`pantryHasAnythingSelected` (line 425-427) gains the same staged-removal awareness the button's dirty-state
already needs — see §3.

### 2. Remove the pantry edit dropdown entirely

Delete:
- The whole `{pantry.length > 0 && (<label className="sv2-inventory-edit-select">...</label>)}` block
  (lines 972-990).
- `editingPantryId` state, `editPantryItem()` (lines 439-447), and the edit-specific lines inside
  `cancelPantryEdit()` (it still resets the form fields, just no longer clears an "editing" id — see exact
  diff below).
- The `editingPantryId` branch inside `savePantryAndContinue`'s `formOperation` (line 598-600) — the pantry
  form operation is now always an insert, never an update.
- The "Cancel" button tied to pantry editing (lines 1008-1010) and its guard in the name-input's `onChange`
  (`if (!editingPantryId) {...}` at line 1000 — this condition is now always true, so the reset always
  happens, matching signatures' custom-dish input which has no analogous "don't reset while editing" guard
  problem since signature editing is untouched).

`cancelPantryEdit` becomes:

```ts
function cancelPantryEdit() {
  setPantryName('')
  setPantryTagsList([])
  setPantryAllergensList([])
  setPantryTagsRevealed(false)
  setPantrySuggestionReady(false)
}
```

(Kept as a named function — still used by `selectEmptyPantry` and after a successful submit — just no
longer clears an `editingPantryId` that no longer exists.)

### 3. Merge the two submit functions into one `submitKitchen`

```ts
async function submitKitchen() {
  const uid = uidRef.current
  if (!uid || sigAdding || pantryAdding || ingredientBatchAdding || sigSuggesting || pantrySuggesting || publishingDraft) return

  const sigFormHasContent = Boolean(sigName.trim() || editingSignatureId || sigTagsList.length || sigAllergensList.length)
  if (sigFormHasContent && (!sigName.trim() || !sigTagsRevealed || !sigTagsList.some(isDishRole) || withoutDishRoles(sigTagsList).length === 0)) {
    setSigAddError('Enter a name, then choose a role and at least one descriptive tag.')
    return
  }
  const name = pantryName.trim()
  const pantryTags = pantryTagsForPersistence(pantryTagsList)
  const pantryFormHasContent = Boolean(name || pantryTagsList.length || pantryAllergensList.length)
  if (pantryFormHasContent && (!name || pantryTags.length === 0)) {
    setPantryAddError('Enter an ingredient name and choose at least one descriptive tag.')
    return
  }

  setSigAdding(true)
  setPantryAdding(true)
  setIngredientBatchAdding(true)
  setDishBatchError('')
  setPantryAddError('')
  setIngredientBatchError('')

  const keyToPreset = new Map(DISH_PRESETS.map((p) => [dishPresetKey(p), p] as const))
  const dishTargets = selectedDishKeys.map((k) => keyToPreset.get(k)).filter((p): p is DishPreset => Boolean(p))
  const existingSignature = editingSignatureId ? signatures.find(s => s.id === editingSignatureId) : null
  const sigFormOperation = sigFormHasContent
    ? (editingSignatureId
        ? supabase.from('signatures').update({ name: sigName.trim(), tags: Array.from(new Set(sigTagsList)), contains_allergens: sigAllergensList, novelty_score: existingSignature?.novelty_score ?? null, is_substantial: existingSignature?.is_substantial ?? null }).eq('id', editingSignatureId).eq('chef_id', uid)
        : supabase.from('signatures').insert({ chef_id: uid, name: sigName.trim(), tags: Array.from(new Set(sigTagsList)), contains_allergens: sigAllergensList, novelty_score: null, is_substantial: null }))
    : null

  const pantryAllergens = pantryAllergensList
  const pantryFormPayload = { name, week_of: weekOf, tags: pantryTags, contains_allergens: pantryAllergens }
  const pantryFormOperation = pantryFormHasContent
    ? supabase.from('pantry_items').insert({ chef_id: uid, ...pantryFormPayload })
    : null

  const results = await Promise.allSettled([
    ...dishTargets.map((p) =>
      supabase.from('signatures').insert({
        chef_id: uid, name: p.name, tags: withDishRole(p.tags, p.role), contains_allergens: p.allergens,
        novelty_score: p.novelty_score ?? null, is_substantial: p.is_substantial ?? (p.role === 'main'),
        preset_key: dishPresetKey(p),
      }).select('id, name, tags, contains_allergens, novelty_score, is_substantial, preset_key').single()
    ),
    ...pendingRemovedSignatureIds.map(id => supabase.from('signatures').delete().eq('id', id).eq('chef_id', uid)),
    ...(sigFormOperation ? [sigFormOperation] : []),
    ...(nothingInPantry ? pantry.map((item) => supabase.from('pantry_items').delete().eq('id', item.id).eq('chef_id', uid)) : []),
    ...(!nothingInPantry ? pendingRemovedPantryIds.map(id => supabase.from('pantry_items').delete().eq('id', id).eq('chef_id', uid)) : []),
    ...selectedIngredients.map((selectedName) =>
      supabase.from('pantry_items').insert({ chef_id: uid, name: selectedName, week_of: weekOf, tags: pantryTags, contains_allergens: pantryAllergens })
    ),
    ...(pantryFormOperation ? [pantryFormOperation] : []),
  ])

  const failed = results.some(result => result.status === 'rejected' || Boolean(result.value.error))
  setSigAdding(false)
  setPantryAdding(false)
  setIngredientBatchAdding(false)
  if (failed) {
    setDishBatchError("Couldn't update your kitchen. Your pending changes are still here with the option to try again.")
    return
  }

  setSelectedDishKeys([])
  setPendingRemovedSignatureIds([])
  cancelSignatureEdit()
  setSelectedIngredients([])
  setPendingRemovedPantryIds([])
  setNothingInPantry(false)
  cancelPantryEdit()
  await loadData()
  await handlePantryDone()
}
```

`saveSignatureChanges` and `savePantryAndContinue` are deleted; every call site (the removed per-section
buttons) is replaced by the one new button described in §4. `handlePantryDone`, `deletePantryItem`'s
replacement (`togglePantryRemoval`), `loadData`, and every state field not explicitly listed above are
unchanged. Note the single combined error message (`dishBatchError`, reusing the existing state field) —
a failure anywhere in the batch is reported once, and (per `Promise.allSettled` semantics, exactly like both
existing functions already do) every *other* operation in the same batch that *did* succeed is not rolled
back — only the pending UI state for anything that failed remains for the user to retry. This matches each
function's existing individual failure behavior; nothing new here except one shared message.

`pantryHasAnythingSelected` (used only for the button label, see §4) becomes:

```ts
const pantryHasAnythingSelected = selectedIngredients.length > 0
  || Boolean(pantryName.trim())
  || (!nothingInPantry && pantry.some(item => !pendingRemovedPantryIds.includes(item.id)))
```

(Previously `!nothingInPantry && pantry.length > 0` — now also false if every saved item is staged for
removal, matching the "nothing left" intent.)

### 4. One button, after the Pantry section

Both existing buttons (signatures lines 877-879, pantry lines 1058-1078) are deleted. In their place, one
button after the Pantry section (i.e., where the pantry button used to be):

```tsx
<button
  className="add"
  onClick={() => void submitKitchen()}
  disabled={pantryDoneSaved || publishingDraft || sigAdding || pantryAdding || ingredientBatchAdding || sigSuggesting || pantrySuggesting}
  style={{ width: '100%', marginTop: 12 }}
>
  {publishingDraft
    ? 'Publishing…'
    : sigAdding || pantryAdding || ingredientBatchAdding
      ? 'SAVING...'
    : backEvent && !backEvent.isPublished
      ? 'Publish Invite'
    : pantryDoneSaved
      ? 'Saved ✓'
      : !pantryHasAnythingSelected && signatures.length === 0 && selectedDishKeys.length === 0
        ? 'I LITERALLY HAVE NOTHING'
        : signatures.length === 0 && pantry.length === 0 ? 'SUBMIT' : 'UPDATE'}
</button>
{dishBatchError && <p style={{ color: C.rose, fontSize: 13, marginTop: 8 }}>{dishBatchError}</p>}
{publishError && <p style={{ color: C.rose, fontSize: 13, marginTop: 8 }}>{publishError}</p>}
```

Judgment calls made here, called out explicitly since the original request didn't specify them:
- **"I LITERALLY HAVE NOTHING"** now requires *both* sections to be empty (previously pantry-only), since
  it's describing the whole kitchen, not just the pantry.
- **"SUBMIT" vs "UPDATE"** now reads "SUBMIT" only the very first time (nothing saved in either section
  yet), "UPDATE" otherwise — previously each section decided this independently for itself.
- The button is **not** gated on anything being dirty (mirrors the current pantry button, not the current
  signatures button, which required `signaturesDirty`) — so "Publish Invite" stays reachable even with zero
  pending changes in either section, matching today's actual behavior for a draft event with an
  already-complete kitchen.
- `dishBatchError` (renamed in spirit to "the one shared error," kept as the same state field to minimize
  churn) is now the only save-error message; `pantryAddError`/`ingredientBatchError` remain as validation
  messages only (shown inline near whichever form has a validation problem, per §3's early-return checks),
  not as save-failure messages anymore.

### 5. The sticky-pinned scroll crossfade

New wrapper around both sections, replacing the plain fragment they currently sit in side by side
(`app/(chef)/kitchen/page.tsx:712-883`, the `{!loading && !fetchError && (<>...</>)}` block):

```tsx
'use client'
import { useRef } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'
```

```tsx
const scrollTrackRef = useRef<HTMLDivElement>(null)
const { scrollYProgress } = useScroll({ target: scrollTrackRef, offset: ['start start', 'end end'] })
const signaturesOpacity = useTransform(scrollYProgress, [0, 0.45, 0.55], [1, 1, 0])
const pantryOpacity = useTransform(scrollYProgress, [0.45, 0.55, 1], [0, 1, 1])
```

```tsx
<div ref={scrollTrackRef} className="sv2-kitchen-scroll-track">
  <div className="sv2-kitchen-scroll-frame">
    <motion.section className="sv2-kitchen-card sv2-kitchen-signatures" style={{ ...cardStyle, opacity: signaturesOpacity }}>
      {/* — exact existing Signatures JSX (lines 716-880), unchanged except deleting its own submit button per §4 — */}
    </motion.section>
    <motion.section className="sv2-kitchen-card sv2-kitchen-pantry" style={{ ...cardStyle, opacity: pantryOpacity }}>
      {/* — exact existing Pantry JSX (lines 885-1082), unchanged except §1/§2/§4's edits — */}
    </motion.section>
  </div>
</div>
```

CSS (new, appended to `components/sofra-v2/sofra-v2.css`):

```css
.sv2-kitchen-scroll-track{position:relative;height:180vh}
.sv2-kitchen-scroll-frame{position:sticky;top:0;height:100vh;display:flex;align-items:center;overflow:hidden}
.sv2-kitchen-scroll-frame .sv2-kitchen-card{position:absolute;inset:0;margin:auto 0;max-height:100%;overflow-y:auto}
```

`signaturesOpacity`/`pantryOpacity` cross over at the midpoint (45%–55% of scroll progress) rather than a
hard cut at 50%, so there's a brief moment where both are partially visible — a soft dissolve, not a snap.
Both cards are absolutely positioned to the same spot inside the sticky frame (`inset:0`), which is what
makes this "the same frame, different content" rather than two things stacked normally.

`180vh` for the track and `100vh` for the frame are starting values, not tuned against a real render —
per the design principle already established for the host-entry-plate feature, exact scroll distance/feel
needs a real browser to get right (jsdom has no layout engine to verify this against). The implementation
plan should flag this as needing a manual pass, the same way that feature's plan did.

## Error handling

- Same recovery model as today: a failed batch leaves pending state (selections, staged removals, the
  custom-dish/ingredient form) exactly as it was, so the user can just press the button again — nothing is
  silently discarded on failure.
- `Promise.allSettled` (not `Promise.all`) is kept, matching both existing functions — one bad row doesn't
  abort the whole batch; the "some failed" check surfaces one combined message either way.
- No new failure surface from the scroll transition itself — it's a pure CSS/opacity effect with no data
  dependency; if `useScroll` somehow computed something unexpected, worst case is a visually wrong crossfade
  timing, never lost data or a broken submit.

## Testing

`framer-motion` needs mocking in `__tests__/kitchen-page.test.tsx` (same pattern as
`__tests__/host-entry-plate.test.tsx`/`__tests__/host-new-page.test.tsx`) — `useScroll`/`useTransform` need
a real layout engine jsdom doesn't have:

```ts
jest.mock('framer-motion', () => ({
  motion: new Proxy({}, { get: (_target, tag) => tag }),
  useScroll: () => ({ scrollYProgress: { on: () => () => {}, get: () => 0 } }),
  useTransform: () => 0,
}))
```

Focused new/changed test coverage:
- Clicking a saved pantry chip no longer calls a delete immediately — it toggles staged-removal styling
  (`aria-pressed` flips, matching how the existing signature-removal test already asserts this), and the
  item still exists (and is included in the next real save) until submit.
- The "Edit a saved pantry item" dropdown is gone (`queryByLabelText`/`queryByText` assertions).
- One submit click persists a combination of: a newly selected preset dish, a newly selected preset
  ingredient, and a staged pantry removal, all in one save — asserting the resulting Supabase call batch
  contains all three operation types.
- The button label logic (SUBMIT/UPDATE/I LITERALLY HAVE NOTHING/Publish Invite/Saved ✓) for the new
  combined conditions in §4.
- Existing tests exercising `saveSignatureChanges`/`savePantryAndContinue` by name/behavior are updated to
  call the one button/`submitKitchen` instead — no coverage is dropped, just consolidated.

## Acceptance criteria

- Only one submit button exists on the Kitchen page, positioned after the Pantry section.
- Clicking a saved pantry ingredient chip stages its removal (visually toggles off) without deleting
  anything until the next real submit.
- There is no way to reopen a saved pantry item's tags/allergens for editing; signature dish editing is
  unaffected.
- Scrolling from Signatures into Pantry plays a pinned crossfade (Signatures fades out, Pantry fades in, in
  the same on-screen position) rather than the two sections just being stacked and scrolling independently.
- The one submit button still correctly handles every existing outcome: first-time SUBMIT, later UPDATE,
  the transient "Saved ✓," and — critically — "Publish Invite" for an unpublished draft event, exactly as
  today.
- Nothing about signature dish behavior (editing, staged removal, custom-dish add) changes.
