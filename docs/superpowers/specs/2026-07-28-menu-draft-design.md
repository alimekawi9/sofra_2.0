# Menu Draft — Design Spec
_2026-07-28_

## Goal

Build two things:

1. `lib/menu.ts` — a pure function `draftMenu(intel, signatures, pantryItems)`
   that composes a 5-course menu (To Start / Main — Sea / Main — Land /
   Main — Green / To Finish) by scoring candidate dishes against the table's
   hard limits and picking the option with the fewest exclusions per slot.
2. `app/(chef)/events/[id]/menu/page.tsx` — a client page that fetches the
   event's intel, the chef's signatures and pantry items, calls `draftMenu`,
   persists the draft to `menus` + `menu_courses` on first load, and renders
   each course with **Swap**, **Lock**, and coverage-line UI. A top-level
   **Regenerate** button redrafts all unlocked courses. Every user action
   persists immediately.

`buildIntel` from `lib/intel.ts` is a required dependency and is included in
this task (its own spec exists at `docs/superpowers/specs/2026-07-28-table-intel-design.md`
but the file was never built).

---

## Files

| Path | Purpose |
|------|---------|
| `supabase/migrations/20260728000001_taste_profiles_host_chef_read.sql` | RLS: host/chef can read taste profiles of guests attending their event (prereq — from table-intel spec, was never applied) |
| `supabase/migrations/20260728000002_menus_host_write_and_signature_slot.sql` | RLS widen: host can also write `menus`/`menu_courses`; schema: add nullable `slot` column to `signatures` |
| `lib/intel.ts` | `buildIntel` + `TableIntel`, `TasteProfile`, `HardLimit` types (per its own spec) |
| `lib/menu.ts` | `draftMenu` + related types |
| `app/(chef)/events/[id]/menu/page.tsx` | Client page: draft, render, swap, lock, regenerate |

---

## Migrations

### `20260728000001_taste_profiles_host_chef_read.sql`

Verbatim from the table-intel spec. Adds a second `SELECT` policy on
`taste_profiles` that permits reading a row when the profile owner has a
`going`/`maybe` RSVP on an event where the caller is host or chef.

### `20260728000002_menus_host_write_and_signature_slot.sql`

Two changes bundled because both are required for the menu page to be
usable by an unassisted host in v1:

**1. Widen `menus`/`menu_courses` write policies to include the host.**

The initial schema requires `e.chef_id = auth.uid()` for every write on
`menus` and `menu_courses`. No code currently sets `events.chef_id`, so
without this change nobody can persist a draft menu. Update the
insert/update/delete policies on both tables so the USING/WITH CHECK
condition becomes:

```sql
exists (
  select 1 from public.events e
  where e.id = <table>.event_id
    and (e.host_id = auth.uid() or e.chef_id = auth.uid())
)
```

Applied to: `menus_insert_chef`, `menus_update_chef`, `menus_delete_chef`,
`menu_courses_insert_chef`, `menu_courses_update_chef`,
`menu_courses_delete_chef` (via `drop policy` + `create policy`). Policy
names are left unchanged for grep-ability; the semantics widen from
"chef-only" to "chef-or-host".

**2. Add `slot` column to `signatures`.**

```sql
alter table public.signatures
  add column slot text check (slot in ('start','sea','land','green','finish'));
```

Nullable. A signature with `slot = null` is not eligible for the menu drafter
(it exists only for the chef's private catalog / other use). The kitchen
page does not currently expose a slot picker; chefs will set `slot` via
SQL in v1. A slot-picker UI is documented as follow-up work below.

---

## `lib/intel.ts`

Build exactly as described in
`docs/superpowers/specs/2026-07-28-table-intel-design.md`. That spec has not
changed and is the source of truth for this file. `draftMenu` imports
`TableIntel`, `HardLimit`, and the `STRICT_DIETS` constant from here.

One export beyond that spec: `STRICT_DIETS` must be exported (the spec keeps
it private; `draftMenu` needs it to detect strict-diet exclusions on pantry
composed dishes).

---

## `lib/menu.ts`

### Types

```ts
import type { TableIntel, HardLimit } from './intel'

export type Signature = {
  id: string
  name: string
  tags: string[]
  contains_allergens: string[]
  slot: Slot | null
}

export type PantryItem = {
  id: string
  name: string
}

export type Slot = 'start' | 'sea' | 'land' | 'green' | 'finish'

export type CourseOrigin = 'signature' | 'pantry-composed' | 'empty'

export type Exclusion = {
  guest: string           // guest name from TableIntel.hardLimits
  reason: string          // human-readable, e.g. "contains nuts" or "not vegetarian"
}

export type Course = {
  slot: Slot
  slotLabel: string       // "To Start", "Main — Sea", etc.
  dishName: string        // "" if origin === 'empty'
  origin: CourseOrigin
  sourceId: string | null // signature.id, or first pantry item id if composed, else null
  excludes: Exclusion[]   // guests this dish doesn't serve, with reason
}
```

`excludes` is a list, not a function — simpler to serialize and to render,
and cheaper for the page to re-derive after a swap.

### Constants

```ts
export const SLOTS: Slot[] = ['start', 'sea', 'land', 'green', 'finish']

export const SLOT_LABELS: Record<Slot, string> = {
  start:  'To Start',
  sea:    'Main — Sea',
  land:   'Main — Land',
  green:  'Main — Green',
  finish: 'To Finish',
}
```

### `scoreDish(dish, intel): Exclusion[]`

Internal helper. Given a candidate dish (signature or pantry-composed) and
the `TableIntel`, return the list of guests this dish excludes and why.

For signatures:
- **Allergy exclusion:** for each `allergen` in `dish.contains_allergens`,
  find the `hardLimits` entry with `type: 'allergy'` and matching label
  (case-insensitive). Every guest name on that entry is excluded with
  reason `"contains ${allergen.toLowerCase()}"`.
- **Diet exclusion:** for each `hardLimits` entry with `type: 'diet'` (one
  of Vegetarian / Vegan / Halal / Kosher), the dish must carry the matching
  lowercase tag in `dish.tags` (e.g. `vegetarian`) to be safe. If the tag
  is missing, every guest on that entry is excluded with reason
  `"not ${label.toLowerCase()}"`.

For pantry-composed dishes:
- **Allergy exclusion:** for each guest `avoid` value (via `hardLimits`
  type `allergy`), do a case-insensitive substring check against the
  pantry item name. If the avoid label is contained in the item name,
  every guest on that entry is excluded with reason
  `"may contain ${avoid.toLowerCase()}"`.

  > **v1 caveat (surface plainly in code comments and rendered UI):** this
  > substring match is an approximate heuristic, not a guaranteed-safe
  > allergen system. A pantry item literally named `"walnut oil"` will be
  > flagged for a `Nuts` avoider; an item named `"cashew brittle"` will
  > not (no substring hit on "nuts"). Do not present this to users as
  > medical-grade allergen filtering.
- **Diet exclusion:** pantry-composed dishes have no diet tags. Every
  guest on every `hardLimits` diet entry is excluded with reason
  `"pantry dish — diet-safe status unknown"`.

Deduplicate exclusions by guest name — a single guest hit by multiple
reasons appears once with the first reason found (allergy before diet).

### `draftCourse(slot, intel, signatures, pantryItems, exclude?): Course`

Internal helper. Produces one course for one slot.

**Candidate pool for the slot:**
1. All signatures where `sig.slot === slot`.
2. All pantry items (eligible for any slot as fallback).

Optionally receives an `exclude` set of `sourceId`s to remove from the pool
— used by the Swap action to force a different pick.

**Selection:**
1. Build every candidate as `{ dish, exclusions }` where `exclusions =
   scoreDish(dish, intel)`.
2. Filter out any candidate whose `sourceId` is in `exclude`.
3. **Invariant:** if any candidate has `exclusions.length === 0`, only
   zero-exclusion candidates are eligible. This is the "hard limits are
   hard" guarantee — a dish that violates a hard limit is never picked
   when a clean option exists.
4. Among the eligible set, pick the candidate with the fewest exclusions;
   ties broken by (a) signatures before pantry, then (b) alphabetical by
   name for a deterministic result. This determinism matters for the
   Swap action — swap needs to know the pool ordering so it can pick the
   next-best option, and for reproducibility of the initial draft.

**Composed pantry dish naming:** `"Chef's ${pantryItem.name}"` — v1
placeholder, intentionally simple. Not a bug; this is scaffolding for a
future recipe-composition step.

**Empty result:** if the candidate pool is empty (no slotted signatures
and no pantry items), return a course with
`origin: 'empty'`, `dishName: ''`, `sourceId: null`, `excludes: []`. The
page renders this as a `— TBD —` placeholder.

### `draftMenu(intel, signatures, pantryItems): Course[]`

Public entry. Iterates `SLOTS` and calls `draftCourse` for each. Returns
five `Course` entries in slot order.

---

## `app/(chef)/events/[id]/menu/page.tsx`

`'use client'` — needed for interactive Swap/Lock/Regenerate handlers.

### Params & auth

```ts
export default function MenuPage({ params }: { params: { id: string } })
```

- On mount, `supabase.auth.getUser()` — redirect to `/login` if unauthed.
- Fetch the event's `host_id, chef_id, title`. If `user.id !== host_id &&
  user.id !== chef_id`, `router.replace('/events/${id}')`.

### Initial data load

Runs from a `loadAll()` function used by mount and retry:

```ts
// A. RSVPs + names (going/maybe only)
const { data: rsvps } = await supabase
  .from('rsvps')
  .select('user_id, users(name)')
  .eq('event_id', id)
  .in('status', ['going', 'maybe'])

// B. Taste profiles of those RSVPed guests (RLS covers this via migration 001)
const userIds = rsvps.map(r => r.user_id)
const { data: profiles } = userIds.length
  ? await supabase.from('taste_profiles').select('*').in('user_id', userIds)
  : { data: [] }

// C. Chef's signatures
const { data: signatures } = await supabase
  .from('signatures')
  .select('id, name, tags, contains_allergens, slot')
  .eq('chef_id', user.id)

// D. Chef's pantry (this week)
const { data: pantry } = await supabase
  .from('pantry_items')
  .select('id, name')
  .eq('chef_id', user.id)
  .eq('week_of', currentMonday())

// E. Existing menu (if any) — one row per event
const { data: menu } = await supabase
  .from('menus')
  .select('id')
  .eq('event_id', id)
  .maybeSingle()

let courses: PersistedCourse[]
if (menu) {
  const { data: rows } = await supabase
    .from('menu_courses')
    .select('*')
    .eq('menu_id', menu.id)
    .order('sort_order', { ascending: true })
  courses = rows ?? []
} else {
  // First load — draft, persist, then treat as the source of truth.
  const guests = mergeGuests(rsvps, profiles)
  const intel = buildIntel(guests)
  const drafted = draftMenu(intel, signatures, pantry)
  const { data: newMenu } = await supabase
    .from('menus')
    .insert({ event_id: id })
    .select('id')
    .single()
  const inserts = drafted.map((c, i) => ({
    menu_id: newMenu.id,
    slot: c.slot,
    dish_name: c.dishName,
    dish_origin: c.origin,
    source: c.sourceId,
    locked: false,
    sort_order: i,
  }))
  const { data: rows } = await supabase
    .from('menu_courses')
    .insert(inserts)
    .select('*')
  courses = rows ?? []
}
```

Store in state: `intel`, `signatures`, `pantry`, `menuId`, `courses` (as
persisted rows), plus the derived `Course[]` (re-scored via `scoreDish` on
each render so the coverage line always reflects current intel).

### Rendering a course

For each course, in `sort_order`:

```
┌──────────────────────────────────────────────┐
│ To Start                          [🔒] [↻]  │
│ Charred Sourdough                            │
│ signature                                    │
│ Serves the whole table                       │
└──────────────────────────────────────────────┘
```

Or when there are exclusions:

```
Serves 6/8 — excludes Ali (contains nuts), Sara (not vegetarian)
```

Coverage line rules:
- If `excludes.length === 0`: `"Serves the whole table"` in cream.
- If `excludes.length > 0`:
  `"Serves ${guestCount - excludes.length}/${guestCount} — excludes ${names}"`
  in rose. Names formatted as `Ali (contains nuts), Sara (not vegetarian)`.
- Empty course (`origin: 'empty'`): show `"No dish drafted — pantry and
  signatures are empty for this slot"` in dim.

Additionally, for pantry-composed dishes, render a small subtitle:
`"pantry-composed — allergen check is a v1 substring heuristic"` in
faint. Signatures show `"signature"` in dim.

### Lock button (🔒)

- Toggle icon shows locked vs unlocked state.
- On click: PATCH `menu_courses.locked` for that row and update local
  state. Persists immediately.
- Locked rows are visually marked (e.g., cream border, small lock glyph
  in header) and are ignored by the Regenerate handler.

### Swap button (↻)

- Only enabled on unlocked rows. Disabled with tooltip `"Locked"` on
  locked rows.
- On click: re-run `draftCourse(slot, intel, signatures, pantry, exclude
  = {currentSourceId})`. If the resulting course is `origin: 'empty'`
  because the exclude filter left the pool empty, Swap is a no-op — the
  current dish stays, no DB write is issued, and a subtle
  `"No other options available"` line renders under the coverage line
  for two seconds. Otherwise the new pick is persisted via UPDATE on
  that single `menu_courses` row and reflected in state.
- Because `draftCourse` selection is deterministic, Swap will produce
  the next-best distinct option; repeated Swaps on the same slot with
  no new candidates will oscillate between the two next-best options.
  Acceptable for v1.

### Regenerate button (top of page)

- Calls `draftCourse` for every course where `locked === false`.
  Locked courses are left completely untouched — not re-scored, not
  updated in the DB.
- Persists via one UPDATE per unlocked course (small N, no bulk needed).
- If all courses are locked, the button is disabled with tooltip
  `"Everything is locked"`.

### Persistence discipline

Every user action writes to `menu_courses` before local state updates
resolve — no batching, no debouncing, no "save button". Specifically:
- Initial draft: bulk insert on first load (see loadAll).
- Swap: single UPDATE, awaited.
- Lock/unlock: single UPDATE, awaited.
- Regenerate: N-many UPDATEs, awaited in parallel via `Promise.all`.

On any write error: set an `actionError` state, revert the local state
to what it was before the action, and render a small error line below
the affected control. No optimistic-then-silently-swallowed pattern.

### Page chrome

Match the rest of the app: same gradient background, radial glow,
italic Georgia wordmark, cream/burgundy/gold palette (see kitchen page
and RSVP spec for exact values). Course cards use the same rounded
`rgba(0,0,0,0.24)` bg + faint border treatment used by kitchen cards.

---

## Self-Review Invariants

Before shipping, verify each of the following against the built code:

1. **Hard-limit safety:** `draftCourse` never returns a dish with
   `exclusions.length > 0` when the pool contains at least one candidate
   with `exclusions.length === 0`. Test: construct a pool with one
   allergen-conflicting signature and one clean pantry item; assert the
   pantry item wins.
2. **Locked courses are untouchable by Regenerate:** After locking course
   2 and clicking Regenerate, the DB row for course 2 has the same
   `dish_name`, `source`, and `dish_origin` as before — and no UPDATE
   was issued against it (verify via network tab or by asserting on a
   spy).
3. **Every action persists:** Swap → DB has the new dish. Lock → DB has
   `locked = true`. Regenerate → every unlocked row is updated. There is
   no code path where the local state changes but the DB does not.
4. **RLS actually permits the write for a host** who is not the assigned
   chef of the event, thanks to migration 002. Test manually as a host
   who has never been assigned as a chef of anything.
5. **The substring allergen caveat is visible** both in code comments
   inside `scoreDish` and in the pantry-composed subtitle on rendered
   courses. Not a silent implementation detail.

---

## Out of Scope

- Kitchen-page slot picker for signatures — chefs set `signatures.slot`
  via SQL in v1. Follow-up work.
- Chef-assignment UI (writing `events.chef_id`). Same v1 gap noted in
  the table-intel spec. Menu page is unblocked because the host now has
  write access.
- Ingredient-level pantry composition (e.g., combining two pantry items
  into "Cod with charred leeks"). v1 uses `"Chef's ${item.name}"` as an
  intentional placeholder.
- Real-time updates (another host/chef editing simultaneously). Last
  write wins in v1.
- Race protection on the initial-draft insert. `menus` has no unique
  constraint on `event_id` in the initial schema; two simultaneous
  first-load attempts could create duplicate menu rows. v1 accepts this
  — in practice only one user is on this page at a time. A future
  migration can add `unique (event_id)` and an upsert on load.
- Any allergen system stronger than the substring heuristic. Explicitly
  flagged as approximate; not medical-grade.
- Per-course notes, wine pairings, plating instructions, print view.
