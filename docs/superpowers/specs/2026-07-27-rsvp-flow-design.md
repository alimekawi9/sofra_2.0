# RSVP Flow — Design Spec
_2026-07-27_

## Goal

Build the RSVP flow as a single `'use client'` component at
`app/(guest)/events/[id]/rsvp/page.tsx`. Two steps: status selection
(going / maybe / can't) → taste profile (dietary, avoid, drinks,
adventurousness). On submit, upsert `rsvps` and (for going/maybe)
`taste_profiles`. If a `taste_profiles` row already exists, prefill Step 2
and show a "Pulled from your profile" badge. Redirect to `/events/[id]` on
success.

---

## File

Single file: `app/(guest)/events/[id]/rsvp/page.tsx`
- `'use client'` directive
- No sub-components
- Receives `params: { id: string }` (the event UUID)

---

## Architecture & State

### Step machine

```ts
type Step = 'status' | 'profile'
type RsvpStatus = 'going' | 'maybe' | 'cant'
```

### State shape

```ts
loading: boolean          // true during mount fetch — skeleton shows
step: Step
status: RsvpStatus | null // selected on Step 1
dietary: string[]
avoid:   string[]
drinks:  string[]
adventurousness: number   // 0–100, default 50 (matches DB check constraint)
prefilled: boolean        // true when a taste_profiles row existed on load
hasExistingRsvp: boolean  // true when an rsvps row existed on load; drives Step 2 button label
submitting: boolean       // true during upsert; submit button disabled
error: string
```

### Mount fetch

Called from a `loadData` function (used by both `useEffect` and the retry handler):

```ts
const { data: { user } } = await supabase.auth.getUser()
// uid stored in a ref for use at submit time

const [{ data: rsvpRow }, { data: profileRow }] = await Promise.all([
  supabase.from('rsvps')
    .select('status')
    .eq('event_id', id)
    .eq('user_id', uid)
    .maybeSingle(),
  supabase.from('taste_profiles')
    .select('*')
    .eq('user_id', uid)
    .maybeSingle(),
])
```

Both use `.maybeSingle()` — returns `null` cleanly for missing rows, no throw.

Prefill from results:
- `rsvpRow?.status` → `status`
- `profileRow` fields → `dietary`, `avoid`, `drinks`, `adventurousness`
- `prefilled = profileRow !== null`
- `hasExistingRsvp = rsvpRow !== null`

On fetch error: `setLoading(false)` + `setError('Couldn\'t load your RSVP. Try again.')`.
Retry button re-calls `loadData`.

---

## Skeleton (loading state)

While `loading === true`, render non-interactive placeholder markup that
mirrors Step 1's shape — plain `<div>` blocks, no `<button>` elements,
no pointer-events, no overlay.

Skeleton elements:
- Three pill-shaped gray blocks matching the going / maybe / can't card dimensions (~48px tall, ~220px wide)
- A ghost "Continue →" block at button dimensions, muted opacity
- Step indicator and wordmark render normally (not skeletonised)

Animated via a `<style>` tag injected at the top of the render:

```css
@keyframes skPulse {
  0%, 100% { opacity: 0.4; }
  50%       { opacity: 0.7; }
}
```

Applied as `animation: skPulse 1.4s ease-in-out infinite` on each skeleton block.

No layout shift when the skeleton lifts — block dimensions match live content exactly.

---

## Step 1 — Status Selection

### Page chrome

- Background gradient + radial glow (see Styling section)
- `← Events` back link top-left, routes to `/events/[id]`, `dim` text
- Wordmark: 52px italic Georgia, `cream`, centered
- Step indicator (see below)

### Step indicator

```ts
const stepLabel =
  status === 'going' || status === 'maybe' ? 'Step 1 of 2' : 'Step 1'
```

Reads `"Step 1"` before any selection and when `cant` is selected.
Upgrades to `"Step 1 of 2"` only once `going` or `maybe` is active.

### Status cards

Three full-width pill buttons with icon glyph + label:

| Value  | Label            |
|--------|------------------|
| going  | ✦ Going          |
| maybe  | ◈ Maybe          |
| cant   | ✕ Can't make it  |

**Unselected:** `rgba(0,0,0,0.24)` bg, `rgba(243,233,221,0.16)` border, `dim` text

**Selected:** `rgba(92,26,27,0.24)` bg, `1px solid` burgundy (`#5C1A1B`), `cream` text,
soft burgundy box-shadow glow

### Primary button

Label and handler are derived from `status` at render time — never captured at
selection time. A user can change their selection before clicking and the button
updates immediately:

```ts
const primaryLabel = status === 'cant' ? 'Submit' : 'Continue →'

const onPrimaryClick =
  status === 'cant' ? handleCantSubmit
  : status !== null  ? () => setStep('profile')
  : undefined
```

Button is disabled when `status === null` or `submitting === true`.

Styles match the login page primary button: bg `burgundy` (`#5C1A1B`),
hover `burgundyLit` (`#7A2324`), warm box-shadow glow.

---

## Step 2 — Taste Profile

Shown only when `status === 'going'` or `status === 'maybe'`.

### Page chrome

- Same background, wordmark
- Back arrow returns to Step 1 (restores status selection)
- Step indicator: `"Step 2 of 2"`

### "Pulled from your profile" badge

Shown when `prefilled === true`. Set once on mount from `profileRow !== null`
and never mutated again — persists visibly throughout the user's edits, even
if they change every chip and slider value. It marks that the *initial* values
came from an existing profile row, not that the form is unmodified.

Style: small pill above the first chip group.
- Text: `✦ Pulled from your profile`, gold (`#D9A15B`)
- Background: `rgba(217,161,91,0.12)`
- Border: `1px solid rgba(217,161,91,0.3)`

### Chip constants

```ts
const DIETARY = ['Vegetarian','Vegan','Halal','Kosher','Gluten-free','No dairy','Pescatarian']
const NOGOS   = ['Nuts','Shellfish','Pork','Eggs','Cilantro','Mushrooms']
const DRINKS  = ['Cocktails','Wine','Beer','Alcohol-free']
```

### Chip groups

Three labeled groups; chips wrap naturally (`display: flex; flex-wrap: wrap; gap: 8px`).
All are multi-select toggle (tap to add, tap again to remove). Groups are independent.

| Label    | State key | Array   | Selected style                                                        |
|----------|-----------|---------|-----------------------------------------------------------------------|
| Dietary  | dietary   | DIETARY | `rgba(217,161,91,0.12)` bg, `1px solid #D9A15B`, `cream` text (gold)  |
| Avoid    | avoid     | NOGOS   | `rgba(224,119,107,0.12)` bg, `1px solid #C97B6E`, `cream` text (rose) |
| Drinks   | drinks    | DRINKS  | `rgba(217,161,91,0.12)` bg, `1px solid #D9A15B`, `cream` text (gold)  |

Avoid uses the rose/danger palette so it reads visually as exclusions rather than
preferences — this distinction matters for the chef-side merge view.

**Unselected (all groups):** `rgba(0,0,0,0.24)` bg, `rgba(243,233,221,0.16)` border,
`dim` text.

Chip shape: `border-radius: 999px`, `padding: 6px 14px`, `font-size: 14px`,
`cursor: pointer`.

### Adventurousness slider

`<input type="range" min={0} max={100} step={1} />`

Default value: `50` when no `taste_profiles` row exists.

**Dynamic phrase label** — derived from `adventurousness` at each render,
shown above the track in `cream`, `16px`:

```ts
const adventLabel =
  adventurousness < 25 ? 'Keep it familiar'
  : adventurousness < 55 ? 'Open to a nudge'
  : adventurousness < 82 ? 'Feed me something new'
  : 'Chef, surprise me'
```

**Numeric end labels** below the track in `dim`, `12px`:
`"Familiar"` (left) — `"Adventurous"` (right)

**Track fill:** `background: linear-gradient(to right, #D9A15B ${pct}%, #7C6B5F ${pct}%)`
where `pct = adventurousness` — updates live as the slider moves.

Slider pseudo-element styles (thumb, track) handled via a `<style>` tag since
inline styles cannot target `::-webkit-slider-thumb` / `::-moz-range-thumb`
(see Styling section).

### Submit button

- Label: `"RSVP →"` when `hasExistingRsvp === false`; `"Update RSVP →"` when `hasExistingRsvp === true`
- Disabled when `submitting === true`
- Inline error in rose (`#C97B6E`) below button on failure

---

## Submit Handler

### `cant` path (Step 1 only)

```ts
await supabase.from('rsvps').upsert(
  { event_id: id, user_id: uid, status: 'cant' },
  { onConflict: 'event_id,user_id' }
)
```

No `taste_profiles` write. On success: `router.push('/events/' + id)`.

### `going` / `maybe` path (Step 2 submit)

```ts
// Both upserts are idempotent against the same conflict targets, so one
// generic error + retry is safe — a retry re-upserts cleanly even if only
// one of the two failed on the previous attempt.
const [{ error: e1 }, { error: e2 }] = await Promise.all([
  supabase.from('rsvps').upsert(
    { event_id: id, user_id: uid, status },
    { onConflict: 'event_id,user_id' }
  ),
  supabase.from('taste_profiles').upsert(
    { user_id: uid, dietary, avoid, drinks, adventurousness,
      updated_at: new Date().toISOString() },
    { onConflict: 'user_id' }
  ),
])
```

If either errors: `setError('Something went wrong. Please try again.')`,
`setSubmitting(false)`, stay on Step 2.

If both succeed: `router.push('/events/' + id)`.

### `submitting` guard

Set `true` before any upsert call. Set `false` only on error (success path
redirects so cleanup is moot). Prevents double-submit.

### Auth uid

Retrieved once on mount via `supabase.auth.getUser()` alongside the data
fetch, stored in a `uid` ref — not re-fetched on submit.

---

## Styling

### Color palette

```ts
const C = {
  ink:        '#140E10',
  ink2:       '#1E1518',
  burgundy:   '#5C1A1B',
  burgundyLit:'#7A2324',
  cream:      '#F3E9DD',
  dim:        '#B7A493',
  faint:      '#7C6B5F',
  gold:       '#D9A15B',
  rose:       '#C97B6E',
}
```

### Background

- Page: `linear-gradient(180deg, #1B1214 0%, #241619 100%)`
- Radial glow overlay at top: `radial-gradient(ellipse 80% 40% at 50% 0%, rgba(217,161,91,0.18) 0%, transparent 70%)`

### `<style>` tag

One `<style>` tag at the top of the render handles pseudo-element targets and
the skeleton keyframe:

```css
@keyframes skPulse {
  0%, 100% { opacity: 0.4; }
  50%       { opacity: 0.7; }
}

input[type=range] {
  appearance: none; width: 100%; height: 4px;
  border-radius: 2px; outline: none;
}
input[type=range]::-webkit-slider-thumb {
  appearance: none; width: 20px; height: 20px;
  border-radius: 50%; background: #D9A15B; cursor: pointer;
}
input[type=range]::-moz-range-thumb {
  width: 20px; height: 20px; border-radius: 50%;
  background: #D9A15B; border: none; cursor: pointer;
}
```

All other styles are inline. No Tailwind config changes. No new CSS files.

---

## Section 7: Adjacent Requirement — "Edit RSVP" on the Event Page

`app/(guest)/events/[id]/page.tsx` does not exist yet. This spec records the
interface contract so both pages can be built consistently.

**When it renders:** the event detail page queries `rsvps` where
`event_id = params.id AND user_id = auth.uid()`. If a row exists, the
`"Edit RSVP →"` link is rendered in the unlocked section.

**Where it routes:** `/events/[id]/rsvp` (same `id` as the current event page).

**Visual weight:** ghost/secondary — `#B7A493` (`dim`) text,
`rgba(243,233,221,0.08)` background, `1px solid rgba(243,233,221,0.16)` border.
Must not compete visually with the shared-album card or other primary unlocked
content.

**Placement:** near the RSVP status indicator in the unlocked section — exact
position deferred to the event page build.

This spec does not implement the event page. It documents the contract only.

---

## Post-submit redirect

After both upserts succeed (or the `cant` upsert succeeds), call
`router.push('/events/' + id)`. This causes the event page to re-fetch server-side
and render the unlocked state — the payoff moment where the guest list, full
address, and shared-album card become visible. Works for all three statuses
including `cant`.

---

## Out of Scope

- Implementing `app/(guest)/events/[id]/page.tsx` (documented in Section 7 contract only)
- International phone / auth (handled by login flow)
- Guest list or address display (event page concern)
- Photo upload or avatar (deferred — `photo_url` nullable in schema)
