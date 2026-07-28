# Menu Page + Generate Menu PDF — Design Spec
_2026-07-28_

## Goal

Build `app/(chef)/events/[id]/menu/page.tsx` (per the existing menu-draft spec at
`docs/superpowers/specs/2026-07-28-menu-draft-design.md`) and add a **Generate menu
PDF** button that opens a print-ready HTML page in a new browser tab, triggers
`window.print()` automatically, and falls back gracefully when popups are blocked.

The menu-draft spec is the authoritative reference for the menu page logic
(drafting, swap, lock, regenerate, persistence). This spec covers only the
additions and clarifications required to layer the PDF feature on top of it.

---

## Files

| Path | Purpose |
|------|---------|
| `supabase/migrations/20260728000001_taste_profiles_host_chef_read.sql` | RLS: host/chef can read taste profiles of going/maybe guests |
| `supabase/migrations/20260728000002_menus_host_write_and_signature_slot.sql` | Widen menu write policies to host; add `slot` column to `signatures` |
| `lib/intel.ts` | `buildIntel` + exported types (per table-intel spec) |
| `lib/menu.ts` | `draftMenu`, `draftCourse`, `scoreDish`, slot constants |
| `app/(chef)/events/[id]/menu/page.tsx` | Full menu page + PDF generation |

No new files. `buildMenuHtml` is a private function inside the page file.

---

## Migrations

Both migrations are verbatim from the menu-draft spec. Summarised here for
completeness; the spec is the source of truth if wording diverges.

### `…001_taste_profiles_host_chef_read.sql`

Adds `taste_profiles_select_host_or_chef` policy permitting reads when the
profile's owner has a `going`/`maybe` RSVP on an event where the caller is host
or chef.

### `…002_menus_host_write_and_signature_slot.sql`

1. Drops and re-creates the six `menus`/`menu_courses` write policies so the
   `WITH CHECK` condition becomes `e.host_id = auth.uid() OR e.chef_id = auth.uid()`.
2. Adds `slot text check (slot in ('start','sea','land','green','finish'))` (nullable)
   to `signatures`.

---

## `lib/intel.ts` and `lib/menu.ts`

Implemented exactly per their respective specs. One export addition beyond the
table-intel spec: `STRICT_DIETS` must be exported from `lib/intel.ts` so
`draftMenu` can reference it (the menu-draft spec calls this out explicitly).

---

## `app/(chef)/events/[id]/menu/page.tsx`

### Data load — single RSVP query

The page runs exactly one query against `rsvps`:

```ts
const { data: rsvps } = await supabase
  .from('rsvps')
  .select('user_id, users(name)')
  .eq('event_id', id)
  .in('status', ['going', 'maybe'])
```

`mergeGuests(rsvps, profiles)` → `buildIntel(guests)` → `intel.guestCount`.

The PDF reads `intel.guestCount` for the covers line. There is no second RSVP
query anywhere on the page — `covers` and `intel.guestCount` are the same number
by construction.

### State additions (on top of menu-draft spec)

```ts
popupBlocked: boolean   // true when window.open() returns null
event: { title: string; event_date: string }  // fetched alongside menu data
```

`event` is fetched in `loadAll()`:

```ts
const { data: ev } = await supabase
  .from('events')
  .select('title, event_date')
  .eq('id', id)
  .single()
```

### Button placement

The **Generate menu PDF** button sits at the top of the page alongside the
existing **Regenerate** button. No "send menu" action exists, so nothing is
replaced. Enabled at all times (does not require lock/unlock state).

Style: same secondary treatment as the kitchen page's "Add" button but with a
ghost/outline variant so it reads as a secondary action next to Regenerate:
`border: 1px solid rgba(243,233,221,0.24)`, `color: cream`, `background: none`.

### PDF generation handler

```ts
function handleGeneratePdf() {
  setPopupBlocked(false)
  const win = window.open('', '_blank')
  if (!win) {
    setPopupBlocked(true)
    return
  }
  win.document.write(buildMenuHtml(courses, intel, event))
  win.document.close()
  win.addEventListener('load', () => setTimeout(() => win.print(), 150))
}
```

`courses` is the live state array — reflects every swap and lock the chef has
applied since the page loaded. If a course was swapped, the PDF shows the
swapped dish because it reads from state, not from the original `draftMenu()` output.

### Popup blocker fallback

When `window.open()` returns `null`, set `popupBlocked: true`. Render below the
button:

> "Your browser blocked the print window. Allow popups for this site and try again."

Color: `dim` (`#B7A493`), `font-size: 13px`. Cleared on the next button click.

### `buildMenuHtml(derivedCourses, guestCount, event): string`

Private function in the page file. Returns a complete HTML document string.

Receives the already-computed `Course[]` from state (not the raw persisted rows),
so exclusions are pre-scored and no secondary `scoreDish` call is needed.

**Single RSVP source invariant:** receives `guestCount` from `intel.guestCount`
directly — does not re-query or re-count RSVPs.

**Updated handler:**
```ts
win.document.write(buildMenuHtml(derivedCourses, intel.guestCount, event))
```

**Structure:**

```
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Menu — [event.title]</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #F3E9DD;
      font-family: Georgia, serif;
      color: #2C1F16;
      min-height: 100vh;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding: 48px 24px;
    }
    .page {
      width: 100%;
      max-width: 560px;
      border: 1px solid #C9A96E;
      padding: 48px 56px;
    }
    @media print {
      body { padding: 0; }
      .page { border: 1px solid #C9A96E; }
    }
  </style>
</head>
<body>
  <div class="page">
    <!-- Header -->
    <div style="text-align:center; margin-bottom:40px; border-bottom:1px solid #C9A96E; padding-bottom:32px;">
      <p style="font-style:italic; font-size:48px; letter-spacing:0.02em; margin-bottom:16px;">Sofra</p>
      <p style="font-size:18px; font-weight:normal; margin-bottom:8px;">[event.title]</p>
      <p style="font-size:13px; color:#8C7560;">[formatted date] · [guestCount] covers</p>
    </div>
    <!-- Courses -->
    [each course block]
  </div>
</body>
</html>
```

**Date formatting:** `new Date(event.event_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })` — e.g. "12 August 2026".

**Course block** (repeated for each course in `sort_order`):

```html
<div style="text-align:center; margin: 32px 0;">
  <p style="font-size:11px; text-transform:uppercase; letter-spacing:0.12em; color:#8C7560; margin-bottom:8px;">
    [slotLabel]
  </p>
  <p style="font-size:20px; margin-bottom:6px;">[dish_name or "— TBD —"]</p>
  <p style="font-size:12px; color:#8C7560; margin-bottom:[4px if no excludes, else 10px];">
    [originLabel]
  </p>
  <!-- Only rendered when excludes.length > 0 -->
  <p style="font-size:12px; font-style:italic; color:#8C7560;">
    Alternative required for: [Ali (contains nuts), Sara (not vegetarian)]
  </p>
</div>
```

**`slotLabel`**: `course.slotLabel` (already on the `Course` object — derived from
`SLOT_LABELS` when the page builds its `derivedCourses` array).

**`originLabel`**: `course.origin === 'signature' ? 'Signature' : course.origin === 'pantry-composed' ? 'Pantry-composed' : ''`

**Exclusions**: `course.excludes` — already computed by the page's `scoreDish` pass.
No secondary scoring inside `buildMenuHtml`. The exclusions list shown on the PDF
is identical to the coverage line shown on the page.

Full signature:
```ts
function buildMenuHtml(
  derivedCourses: Course[],
  guestCount: number,
  event: { title: string; event_date: string },
): string
```

---

## Self-Review Invariants

1. **Live state check:** `buildMenuHtml` receives `courses` (the live state array,
   not the original draft output). If the chef swapped a course, the new `dish_name`
   is in `courses` — the PDF reflects it. This is guaranteed by construction; no
   re-fetch happens inside the handler.

2. **Single RSVP source:** `intel.guestCount` (used for covers) comes from the same
   RSVP query as `buildIntel`'s guest list. There is no secondary count anywhere.

3. **Popup blocker handled:** `window.open()` result is checked before calling
   `win.document.write()`. A null return sets `popupBlocked: true` and shows the
   fallback message. The handler does not throw.

4. **No layout shift on fallback message:** The fallback message renders inline
   below the button, not as an overlay or toast.

5. **Print stylesheet present:** The `@media print` block in the HTML template
   removes body padding so the page fills the paper correctly when printed.

---

## Out of Scope

- Saving the PDF to storage or emailing it to guests.
- Per-wine or per-course notes beyond what `dish_name`, `dish_origin`, and
  exclusions provide.
- Any allergen note stronger than the v1 substring heuristic already documented
  in the menu-draft spec (the pantry-composed subtitle still appears on the
  rendered page; the PDF shows "Pantry-composed" without repeating the caveat).
- Real-time collaboration or conflict resolution between simultaneous editors.
