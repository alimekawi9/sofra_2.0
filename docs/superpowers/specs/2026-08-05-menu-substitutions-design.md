# Menu Substitutions ("Plated on the side") — Design Spec
_2026-08-05_

## Goal

Extend the menu-draft/menu-PDF system (`docs/superpowers/specs/2026-07-28-menu-draft-design.md`,
`docs/superpowers/specs/2026-07-28-menu-pdf-design.md`) so that when a chosen
main course excludes a subset of guests, the system attempts to find a safe
substitute dish for them and surfaces it as a **per-guest plated-on-the-side
note**, instead of just flagging the exclusion. When no safe substitute
exists, the UI must say so honestly rather than silently dropping the guest.

This spec covers `lib/menu.ts`, the menu page
(`app/(chef)/events/[id]/menu/page.tsx`), the table page
(`app/(chef)/events/[id]/table/page.tsx`), and the required test/seed-data
fixes identified by runtime verification (see **Verification** below —
these are in scope, not optional cleanup).

---

## Core model changes (`lib/menu.ts`)

### `ExclusionKind`: allergy vs. preference

```ts
export type ExclusionKind = 'allergy' | 'preference'
export type Exclusion = { guest: string; reason: string; kind: ExclusionKind }
```

`TRUE_ALLERGENS = new Set(['nuts', 'shellfish', 'dairy', 'eggs', 'gluten', 'soy'])`
— physical-danger stakes. A dish containing one of these is hard-blocked from
selection for the table if avoidable; a guest is never served a plated
substitute *of the same dish* to route around a true allergy.

Everything else — Pork/alcohol as religious preference, Cilantro/Mushrooms as
taste, and all `STRICT_DIET_LIST` diets (Vegetarian, Vegan, No pork/alcohol,
Kosher, Gluten-free, No dairy, Pescatarian) — is a **preference** exclusion:
the majority-preferred dish still wins the slot, and the minority gets a
labeled substitute.

### `Substitution`

```ts
export type Substitution = {
  guests: string[]        // guests sharing this substitute
  dishName: string
  origin: 'signature' | 'pantry-composed'
  sourceId: string | null
}
```

Attached to `Course.substitutions?: Substitution[]`. Guests are grouped by
shared substitute dish. A guest who is in `excludes` but not covered by any
`Substitution` has no safe alternative in the current signature/pantry pool —
that's the honest-failure case.

### `CourseOrigin` gains `'fallback'`

A last-resort signature that still has exclusions but was picked anyway so
the slot wouldn't render empty (only possible when `inferSlot` can't find a
better candidate). Displays with a warning band, not a green safety check.

### `inferSlot` / `withInferredSlots`

Every signature's `slot` column is currently NULL (no UI writes it). Infers a
slot from tags first (`dessert`→finish, `seafood`→sea, `meat`→land,
`veg`/`vegan`→green candidate), then name-keyword scoring, else `null`
(slot-agnostic last-resort pool only). Callers persist the inferred slot back
to the DB on first read.

### Portion guidance wording

`portionGuidance(slot)` now returns `"Portion: feeds ~N"` instead of `"Serves
approximately N"` — deliberately not "serves", to avoid the raw prep quantity
being read as a guest-safety count (that's the separate "Table fit: safe for
X/Y guests" line).

---

## UI: menu page (`app/(chef)/events/[id]/menu/page.tsx`)

Per course, below the origin/portion block:

- If `course.substitutions?.length`: render a **"Plated on the side"** block —
  one line per substitution group: `<guests joined by ", ">: <dishName>`.
- Else if `course.excludes.length > 0` (and no substitutions found at all):
  render **"No substitute available — add a signature that avoids these
  constraints."** in the rose/warning color.

Both the rule-based **Regenerate** and **Regenerate with AI** paths populate
`course.substitutions` — `deriveCourse` (called from both `draftMenu` and the
AI-assembled course list) is the single place that computes exclusions and
attaches substitutions, so there is one code path for this, not two.

## UI: table page (`app/(chef)/events/[id]/table/page.tsx`)

Adds a **"Substitution plan"** card grouped **by guest** (inverse of the menu
page's per-course grouping): for each guest with at least one substitution,
list `<slotLabel>: <dishName>`. Below that, an unmet-exclusions line: `No
substitute available for: <guest> on <slotLabel> (<reason>); ... . Add more
signatures to cover these.`

This requires loading `signatures`, `pantry_items`, and the persisted
`menu`/`menu_courses` rows for the event's chef and re-deriving courses with
`deriveCourse` — the table page previously only rendered table intel, no menu
data.

## PDF (`buildMenuHtml`, private function in the menu page)

Adds a `.subs` block per course, styled to match the on-screen "Plated on the
side" block (dashed top border, guest names in gold/italic). The
`unmetHtml` ("Alternative required for: ...") block is now gated on
`c.excludes.length > 0 && (!c.substitutions || c.substitutions.length === 0)`
— i.e. it only fires when a course has exclusions **and** no substitute was
found, matching the on-screen "No substitute available" condition instead of
firing on every exclusion.

`buildMenuHtml` receives the same live `derivedCourses` state used to render
the screen (see menu-pdf spec's "Live state check" invariant) — no secondary
query, so the PDF's substitution block cannot structurally diverge from the
data the chef is looking at when they click the button.

---

## Verification (2026-08-05, real run against dev server + demo account)

Ran `scripts/verify-substitutions.mjs` (Playwright, real browser, real login,
real Gemini call) against the seeded demo event (`Layla's Long Table — Demo`,
Demo Host / `+10000000001`, event id `f4a87b1e-61b9-4199-9a63-22dd3196c45b`).

**Rule-based Regenerate — PASS.** MAIN — LAND (Lamb Rogan Josh / Osso Buco,
varies by run) excludes Nadia, Mona, Priya ("not vegetarian"); "Plated on the
side" correctly shows `Nadia, Mona, Priya: Baba Ganoush`. Confirmed
deterministic and stable across 10 consecutive regenerations.

**Regenerate with AI — PASS, and the suspected `attachSubs` no-op does
NOT occur.** First verification attempt captured the page mid-flight (button
still read "Thinking…") because the script's fixed 20s wait was shorter than
the real Gemini latency — that capture was stale and made the AI path look
broken. Fixed by waiting on the button's `disabled`/label state instead of a
timer. The corrected run shows the AI-composed menu (e.g. "Roasted Butternut
Squash with Miso Glaze" for MAIN — SEA) correctly carrying the same
`Excludes ... / Plated on the side` block as the rule-based path. **Action
item:** the suspicion driving this spec was wrong; no code fix needed here,
but it's worth noting the manual verification script's naive fixed-timeout
pattern is fragile and should wait on UI state, not a clock, for any future
one-off scripts against this AI button.

**PDF export — PASS on substitution rendering, but surfaced a real drift
(required fix).** The exported PDF's "Plated on the side" block matches the
live UI's guest/dish grouping exactly. However:

### Required fix 1 — `__tests__/menu-html.test.ts` tests a stale fork of `buildMenuHtml`

The test file hand-duplicates `buildMenuHtml` "verbatim" (per its own header
comment) because the real function is a private helper inside a client
component. That duplicate was never updated when substitutions landed:

- It has no `.subs`/"Plated on the side" handling at all.
- Its "Alternative required for" block is gated only on
  `c.excludes.length > 0` — unconditionally, unlike the real implementation's
  `excludes.length > 0 && !substitutions.length` gate. Given real data (an
  excluded guest **with** a working substitute), the test's copy would
  render "Alternative required for" where production correctly renders
  "Plated on the side" instead — the opposite of what a guest-facing menu
  should say.
- It's missing the `'fallback'` → `"Chef's adaptation"` origin label case.

All 12 tests in the file currently pass, but they pass against fossilized
logic — they do not protect the real PDF output shown to users. This needs
to be fixed as part of this feature, not filed separately:
1. Update the duplicated function in `__tests__/menu-html.test.ts` to match
   the real `buildMenuHtml` (substitutions block, corrected gating, fallback
   label), **and**
2. add test cases for: a course with `substitutions` (asserts "Plated on the
   side" renders and "Alternative required for" does not), and a course with
   `excludes` but no `substitutions` (asserts the reverse).

Longer-term, consider extracting `buildMenuHtml` to `lib/menu-html.ts` (pure
function, no client-component dependencies) so the test can import the real
implementation directly and this class of drift becomes structurally
impossible. Out of scope for this pass but worth flagging.

### Required fix 2 — demo seed data can't exercise "No substitute available"

Across 10 rule-based regenerations and both AI regenerations, only one
exclusion group was ever observed: the 3 vegetarians on MAIN — LAND, always
successfully substituted with Baba Ganoush. The honest-failure path
("No substitute available — add a signature that avoids these constraints.")
was never rendered in any live capture — not because it's broken, but
because it was never reached.

Root cause: `scripts/seed-demo-event.mjs` sets Tarek's `dietary: ['Halal']`,
but `STRICT_DIET_LIST` in `lib/intel.ts` (and the real RSVP intake form's
`DIETARY` chip list in `lib/theme.ts`) only recognizes `'No pork/alcohol'` —
the label was renamed in commit `b6975b5` ("halal->no pork/alcohol relabel")
everywhere except this seed script. `'Halal'` matches nothing in
`STRICT_DIETS`, so `buildIntel` silently drops Tarek's constraint entirely:
he has zero hard limits, is never excluded from anything, and the demo's own
"Every dish is allergy-safe by construction" banner is not actually being
exercised for him.

Required fix: update `scripts/seed-demo-event.mjs` line 53 to
`dietary: ['No pork/alcohol']` so the seed data matches current app
vocabulary. Additionally, seed at least one signature/pantry gap so a
genuine "no substitute available" state is reachable in the demo — e.g. no
current signature both satisfies `'No pork/alcohol'` and fits MAIN — LAND
without also being vegetarian-safe, so a chef running the demo can actually
see the honest-failure UI at least once. Without this, the honest-failure
line has no automated or manual coverage of it actually rendering — it's
only reachable by reasoning about the code, not by observing the app.

### Adjacent finding (not required for this feature, noted for awareness)

The table page's own "No substitute available for: ..." line (see UI
section above) inherits the same unreachability with current seed data,
for the same root cause. Not independently re-verified live in this pass —
flagging so it isn't assumed covered once seed data above is fixed.

---

## Out of scope

- Extracting `buildMenuHtml` into a shared/importable module (flagged above
  as a good follow-up to make the test-drift class of bug structurally
  impossible, but not required to ship this feature).
- Any UI for the chef to manually assign a substitute when none is found —
  the honest-failure message's stated remedy ("add a signature that avoids
  these constraints") is the only path today.
- Table page: verifying "Substitution plan" card unmet-exclusions rendering
  live (see adjacent finding above) — needs its own pass once seed data is
  fixed, since it's currently unreachable for the same reason.
