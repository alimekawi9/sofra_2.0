# Host Entry Plate Transition — Design

## Goal

Today, clicking `HOST` in the nav bar (`/host/new`) drops a logged-in host straight into step 1 of the
four-step "Create a Sofra" wizard. Add a single new intro screen in front of it: a centered silver plate on
a fixed burgundy backdrop, captioned "Ready to host your own Sofra?" with a fork and knife flanking the
card. Clicking the plate triggers a true shared-element transition — the plate visually grows and reshapes
into the wizard's own card container — landing on the existing, unmodified step 1.

This does not replace or restructure anything about the four-step wizard itself. It is purely a new first
beat before it, shown on every visit (no "seen it once" persistence).

## Background: what already exists

- `app/(host)/host/new/page.tsx` is a client component. Its only gate today is an identity check
  (`useEffect` reading `localStorage.getItem('sofra_user_id')`, redirecting to `/login` if absent) before
  rendering `<HostCreateForm ... />` unconditionally.
- `components/sofra-v2/HostCreateForm.tsx` renders its own root markup independent of the page: an outer
  `<div className="sv2-root sv2-device-page sv2-app-page ...">` wrapping `<main className="sv2-device-shell
  sv2-app-shell sv2-host-shell">`, which is the actual visible card — cream background
  (`--sv2-receipt-bg`), gold border, dashed gold inset border, `max-width: 640px`, centered, filling the
  viewport on mobile and gaining rounded corners (`border-radius: var(--sv2-shell-radius)`, 28px) above
  600px width. This same component is reused by `/host/[id]/edit` (`mode="edit"`), so any change to it must
  stay inert for that consumer.
- `.sv2-device-page` (the outer wrapper) is the actual page background, `var(--sv2-page-bg)` — `#5C1515`
  (burgundy) by default, overridden to a cream tone (`#FBF8F1`) by both the light-mode design-preview
  attribute and the production `[data-theme="light"]` rule. In other words, the *real* Create-a-Sofra card
  sits on a burgundy page background only in dark mode; in light mode (the default for new visitors) it's
  cream-on-cream, matching the screenshot the host actually sees today.
- No existing screen in production has a fixed, theme-independent burgundy background — the closest
  precedent is the invite-landing artwork (`public/sofra/invite-landings/*`), which is fixed-color
  regardless of the site's light/dark toggle. This new intro screen follows that same precedent: it is
  always burgundy, not tied to `data-theme`.
- No animation library exists in this codebase today (`package.json` has no `framer-motion`, no `motion`).
  Existing transitions (`components/SofraTransition.tsx`) are hand-written CSS opacity/transform, used for
  loading states, not shared-element morphs.
- No fork/knife image asset exists. `public/design-preview/silver-plate.png` is a plain ornate silver plate
  on a transparent background with no card/text/cutlery composited in — this design composes the scene
  itself from that plate image plus new inline SVG cutlery icons and a CSS-built text card, rather than
  requiring new artwork.

## Design

### 1. New dependency: Framer Motion

`npm install framer-motion`. Compatible with the installed React 18 / Next 14.2 (App Router, client
components). This is the only new dependency this feature needs — it directly provides `layoutId`-based
shared-element transitions (automatic FLIP position/size/border-radius interpolation across two differently
shaped/positioned elements, including across a component unmount/mount boundary), which is exactly this
feature's hardest requirement and not worth hand-rolling.

### 2. New component: `HostEntryPlate`

`components/sofra-v2/HostEntryPlate.tsx`, a small `'use client'` component:

```tsx
'use client'

import { motion, AnimatePresence } from 'framer-motion'

// Simplified sketch — the real onClick timing (a short "leaving" state before
// calling onEnter) is specified in full in §5 below, not here.
export function HostEntryPlate({ onEnter }: { onEnter: () => void }) {
  return (
    <div className="sv2-host-entry-page">
      <button type="button" className="sv2-host-entry-trigger" onClick={onEnter} aria-label="Start hosting a Sofra">
        <motion.div layoutId="host-entry-shell" className="sv2-host-entry-plate" />
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
      </button>
    </div>
  )
}
```

- `sv2-host-entry-page` is the fixed-burgundy full-viewport wrapper (own CSS, not reusing
  `.sv2-device-page`, since that class is theme-reactive and this screen deliberately isn't).
- `sv2-host-entry-plate` is the actual `silver-plate.png` rendered via `next/image` inside the
  `motion.div` that carries `layoutId="host-entry-shell"` — this is the element whose position, size, and
  `border-radius` (starting near-circular, matching the plate's round silhouette) will be interpolated by
  Framer Motion into the real form card's rectangle.
- The card text and cutlery are visually layered on top but are *not* part of the shared element — they're
  wrapped in `AnimatePresence`/`exit` so they fade out over ~220ms starting immediately on click, finishing
  well before the (longer, ~450–500ms) shared-element morph completes. This avoids the card text or cutlery
  visibly stretching/distorting during the morph.
- The whole scene is one `<button>` (per your "just the plate itself" answer — the entire scene is the
  click target, not just the literal plate pixels, so it's a comfortably large tap target on mobile too).

### 3. Wiring the shared element into the real form

`HostCreateForm` gains one new optional prop:

```ts
shellLayoutId?: string
```

Its root `<main className="sv2-device-shell sv2-app-shell sv2-host-shell">` becomes conditionally a
`motion.main` when this prop is present:

```tsx
import { motion } from 'framer-motion'
// ...
const Shell = shellLayoutId ? motion.main : 'main'
// ...
<Shell className="sv2-device-shell sv2-app-shell sv2-host-shell" layoutId={shellLayoutId}>
```

(`layoutId` is simply omitted / not passed as a DOM attribute when `Shell` is the plain string `'main'`,
so this is fully inert for `/host/[id]/edit`, which never passes `shellLayoutId`.)

### 4. Page-level state

`app/(host)/host/new/page.tsx` gains one new piece of state, checked only *after* the existing
`localStorage`/redirect-to-`/login` check already passes:

```ts
const [entryRevealed, setEntryRevealed] = useState(false)
```

```tsx
return (
  <MotionConfig reducedMotion="user">
    {!entryRevealed ? (
      <HostEntryPlate onEnter={() => setEntryRevealed(true)} />
    ) : (
      <>
        <SofraTransition active={submitting || customizing} label={...} />
        <HostCreateForm shellLayoutId="host-entry-shell" ... />
      </>
    )}
  </MotionConfig>
)
```

`MotionConfig` wraps *both* branches deliberately (see "Error handling" below for why) — it must not be
placed only inside `HostEntryPlate`, since the shared `layoutId` element persists across the swap from one
branch to the other.

Because `HostEntryPlate`'s plate and `HostCreateForm`'s shell share the same `layoutId` string
(`"host-entry-shell"`) and this swap happens within the same React tree/commit (one unmounts, the other
mounts, both under the same page component), Framer Motion detects the match automatically — no
`AnimateSharedLayout`/`LayoutGroup` wrapper needed (that pattern is only required for `layoutId` matches
across otherwise-unrelated trees, which isn't the case here).

### 5. Background crossfade

`.sv2-host-entry-page` transitions its own `background-color` via a plain CSS transition (not
Framer-Motion-driven), so the burgundy-to-cream shift happens over roughly the same duration as the
shared-element morph rather than being an abrupt cut. Concretely, `HostEntryPlate`'s own internal click
handler — not the `onEnter` prop directly — does the choreography:

```ts
function handleClick() {
  setLeaving(true) // adds .leaving, triggering the background-color transition and the overlay's exit animation
  window.setTimeout(onEnter, 500) // calls the parent's setEntryRevealed(true) once the color transition has had time to settle
}
```

The button's `onClick` is `handleClick`, not `onEnter` directly (the simplified sketch in §2 elides this
for brevity). `HostEntryPlate` stays mounted, showing its now-burgundy-fading-to-cream background with the
shared-layout plate still visible and mid-morph, for that ~500ms — only after the timeout does the parent
swap it out for `HostCreateForm`.

## Error handling

There is no new failure surface — no network calls, no data fetching. The only edge case: a user with
`prefers-reduced-motion: reduce` set should still be able to proceed, just without the morph. Framer
Motion respects `prefers-reduced-motion` automatically when `<MotionConfig reducedMotion="user">` wraps the
relevant tree — but because the shared `layoutId` element exists across a component *swap*
(`HostEntryPlate` unmounts, `HostCreateForm` mounts), the `MotionConfig` wrapper must sit in
`app/(host)/host/new/page.tsx` around *both* conditional branches (already shown in §4's code above), not
inside `HostEntryPlate` alone — wrapping only the plate would leave `HostCreateForm`'s `motion.main` outside
the provider once the swap happens, silently losing the reduced-motion behavior for the second half of the
transition.

## Testing

Framer Motion's real layout measurement doesn't run meaningfully under jsdom (no real layout engine), so
tests mock it rather than assert on animation timing — this is the standard, low-risk approach:

```ts
jest.mock('framer-motion', () => ({
  motion: new Proxy({}, { get: (_, tag) => tag }),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  MotionConfig: ({ children }: { children: React.ReactNode }) => children,
}))
```

- New `__tests__/host-entry-plate.test.tsx`: renders `HostEntryPlate`, clicks it, and asserts `onEnter`
  fires — using fake timers (`jest.useFakeTimers()` + `jest.advanceTimersByTime(500)`, or
  `waitFor(..., { timeout: 1000 })` with real timers) to account for the ~500ms delay from §5, not a bare
  synchronous assertion.
- `__tests__/host-new-page.test.tsx`: every existing test currently assumes `HostCreateForm` renders
  immediately. Add the `framer-motion` mock above, and add one `userEvent.click` on the entry plate's
  button (followed by the same timer-advance/`waitFor` from above) at the top of the shared
  `fillDetails()`/`goToQuestions()`/`goToKitchen()` helpers (or a new top-level `beforeEach` step) so
  existing tests keep working with only this one extra step inserted, not a rewrite. Add one new dedicated
  test: fresh render shows the entry plate and not the form; clicking it reveals step 1 of the wizard.
- No change needed to `/host/[id]/edit` tests — that route never renders `HostEntryPlate` and
  `shellLayoutId` is never passed there.

## Acceptance criteria

- Visiting `/host/new` while logged in shows the burgundy plate scene first, every time — not step 1 of the
  wizard directly.
- The plate scene's background is always burgundy, regardless of the site's light/dark setting.
- Clicking anywhere in the plate scene triggers the transition — the whole scene is the single click
  target; there is no second/separate CTA button beneath it.
- The transition is a true shared-element morph (position, size, and shape all animate together) from the
  plate into the wizard's actual card container — not a generic fade/cut.
- The card text and cutlery fade out during the transition; they do not visibly stretch or distort.
- Landing state is the existing, completely unmodified step 1 ("Start with the essentials").
- `/host/[id]/edit` is visually and behaviorally unchanged.
- A `prefers-reduced-motion` user gets an instant transition instead of the morph.
