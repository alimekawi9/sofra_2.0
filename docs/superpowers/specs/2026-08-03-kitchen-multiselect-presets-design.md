# Kitchen page: multi-select presets for signatures and pantry

## Problem

On `app/(chef)/kitchen/page.tsx`, tapping a dish preset chip immediately
fills the single-row add form (one dish at a time). Chefs adding several
signature dishes from the curated list have to repeat that per dish. The
pantry section has no preset picker at all — only free-text add.

## Goals

1. Dish presets become multi-select: tap to toggle, batch-insert all
   selected on one button press.
2. Pantry gets the same picker pattern, sourced from the new
   `lib/ingredient-presets.ts` (category-organized, not cuisine-organized).
3. Both existing free-text "Add a signature dish…" / "Add an ingredient…"
   inputs are untouched.

## Non-goals

- No changes to `dish-presets.ts` or `ingredient-presets.ts` content.
- No changes to the delete/list rendering of signatures or pantry items.
- No new DB tables/columns; both `signatures` and `pantry_items` already
  have the columns needed (`name`, `tags`, `contains_allergens` /
  `name`, `week_of`).

## Chip toggle visual

Reuse the filled/outline pattern already used for dietary/avoid chips in
`app/(guest)/events/[id]/rsvp/page.tsx` (`chipClass` there): selected =
`background: C.burgundy`, `borderColor: C.gold`, `color: C.cream`;
unselected = current muted `presetBtn` look. Add an equivalent style
helper local to the kitchen page (`presetChipStyle(on)`), applied to both
the dish preset chips and the new ingredient preset chips. `aria-pressed`
reflects selection state, consistent with the RSVP page chips.

## Dishes: "Your signatures" quick-add

**State (additions to existing):**
- `selectedPresetKeys: string[]` — keys of the form `${cuisine}-${name}`,
  matching the existing `key` used when rendering `filteredPresets`.
- `presetAdding: boolean`
- `presetAddError: string`

**Behavior:**
- Clicking a preset chip toggles its key in `selectedPresetKeys` (no
  longer calls `applyPreset`, which is removed).
- Below the preset grid (same position it's in today, before the
  "Don't see it?" block), an "Add selected (N)" button:
  - `disabled` when `selectedPresetKeys.length === 0` or `presetAdding`.
  - Label reads `Add selected` when N is 0 is moot (disabled), otherwise
    `Add selected (N)`.
  - On click: resolves `selectedPresetKeys` back to `DishPreset` objects,
    fires one `supabase.from('signatures').insert({chef_id, name, tags,
    contains_allergens}).select().single()` per selected preset,
    concurrently via `Promise.allSettled` (not sequential, not a single
    array-insert — see "Batch insert strategy" below).
  - Successful rows are prepended to `signatures` state (same as
    `addSignature` does today) and removed from `selectedPresetKeys`.
  - Failed presets stay in `selectedPresetKeys` (so the button remains
    actionable and correctly counts them) and their names appear in
    `presetAddError`, e.g. `Failed to add: Baklava, Kibbeh. Tap "Add
    selected" to retry.`
  - Fully successful batch: `presetAddError` cleared, selection cleared.
- The free-text "Add a signature dish…" input, its `Tags` / `Allergens`
  inputs, and `addSignature()` are unchanged.
- The "Don't see it? Add your own" input and `addCustomToMyList()` are
  unchanged.

## Pantry: "This week's pantry" quick-add (new)

**New state:**
- `pantryPresetCategory: 'All' | (typeof INGREDIENT_CATEGORIES)[number]`
  (default `'All'`)
- `selectedIngredients: string[]` — ingredient names (unique across the
  curated list; no per-category namespacing needed since inserts only
  need the name).
- `ingredientAdding: boolean`
- `ingredientAddError: string`
- `pantryCustomName: string`, `pantryCustomAdding: boolean`,
  `pantryCustomError: string` — for the new "Don't see it? Add your own"
  box, kept separate from the existing `pantryName` free-text state so
  the two inputs don't fight over the same value (mirrors how dishes
  keep `customName` separate from `sigName`).

**Layout (inserted into the existing pantry card, between the current
item list and the existing free-text "Add an ingredient…" row — same
slot the dish section uses for its quick-add block):**
1. "Quick add from presets" label (matches dish section).
2. Category filter chips: `['All', ...INGREDIENT_CATEGORIES]`, same
   filter-chip style already used for `CUISINE_FILTERS`.
3. Ingredient preset grid: flattened list of ingredient names for the
   selected category (`INGREDIENT_PRESETS[cat]`), or all categories
   flattened when `'All'`. Each is a toggle chip using the same
   `presetChipStyle` as dishes.
4. "Add selected (N)" button, disabled at 0 selected / while adding.
5. "Don't see it? Add your own" — text input + button, inserts one
   `pantry_items` row `{chef_id, name, week_of: weekOf}` via the existing
   single-insert pattern (same shape as `addPantryItem`, just separate
   state/handler so it doesn't collide with the free-text add at the
   bottom of the card).

**Batch add behavior:** identical strategy to dishes — `Promise.allSettled`
over one insert per selected ingredient name, `{chef_id, name, week_of:
weekOf}`, no `tags`/`contains_allergens` (pantry items don't carry
metadata). Successes prepended to `pantry` state and cleared from
selection; failures stay selected with names surfaced in
`ingredientAddError`.

The existing free-text "Add an ingredient…" input and `addPantryItem()`
are unchanged.

## Batch insert strategy (applies to both sections)

Postgres treats a multi-row `INSERT` as a single atomic statement — one
failing row rolls back the whole statement, so a real "5 of 8 succeeded"
outcome is not achievable with `supabase.from(...).insert([...])` (array
form). To satisfy both "no visible lag from N sequential round-trips" and
"surface which specific items failed on partial failure," each selected
item's insert is fired as its own request, all at once, via
`Promise.allSettled`:

```ts
const results = await Promise.allSettled(
  toAdd.map((item) =>
    supabase.from(TABLE).insert({...}).select(COLS).single()
  )
)
```

This is not N sequential round-trips (all requests are in flight
concurrently) and it allows genuine per-item success/failure. Fully
successful and fully failed batches both fall out of the same code path
correctly (fully failed = all names listed, selection unchanged for
retry).

## Error handling

- `presetAddError` / `ingredientAddError` render the same way existing
  error strings do in this file (`<p style={{ color: C.rose, ... }}>`).
- No error is thrown/logged to console beyond what `supabase` itself
  does; failures are surfaced entirely through the existing error-string
  UI convention already used throughout this page.
- Partial failure never silently drops items and never claims full
  success — the error string only appears when `failedNames.length > 0`,
  and it lists exactly those names.

## Testing

`__tests__/` has no existing test for `kitchen/page.tsx`. Given the
project's TDD convention (see e.g. `__tests__/host-new-page.test.tsx`,
`__tests__/table-page.test.tsx` for the mocking pattern used for
Supabase-backed client pages), add `__tests__/kitchen-page.test.tsx`
covering:
- Toggling a dish preset chip selects/deselects it (visual + state),
  doesn't touch the free-text form fields.
- "Add selected" is disabled at 0 selected, enabled with a count once ≥1
  selected.
- Clicking "Add selected" issues one insert per selected preset
  concurrently and, on full success, adds all rows to the list and
  clears selection.
- Partial failure: some inserts reject → succeeded ones are added and
  cleared from selection, failed ones remain selected and are named in
  the error message.
- Pantry: category filter narrows the preset grid; toggle/select/batch
  add/partial-failure behave the same as dishes; custom "Add your own"
  inserts a single row independent of the free-text "Add an
  ingredient…" input.
