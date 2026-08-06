# Figma Frontend Preview — Design Spec
_2026-08-06_

## Goal

Port two screens from the Figma file `Sofra — App Design` (`dQezsrcY1kBwQpsoN1VMbb`) — `01 — Welcome / Auth` and `06 — Preferences (Receipt)` — into real, viewable Next.js pages, isolated from the live app so they can be compared side by side before any decision is made to roll them out further.

This is a **preview branch**, not a replacement of the current login/RSVP flow.

---

## Source material

- Figma file has exactly two designed frames: `01 — Welcome / Auth` (node `1:2`) and `06 — Preferences (Receipt)` (node `2:2`). The `01`/`06` numbering implies a larger flow, but frames 02–05 don't exist yet — out of scope until they're designed.
- Both frames are dark-only in Figma; there is no light-mode variant to pull. Light mode is derived by this spec (see below), following the app's existing `[data-theme="light"]` conventions.
- The Figma hex values (`#5C1515` burgundy, `#D9C69C` receipt tan, `#C4A35A` gold) match tokens already defined in `app/sofra.css` (`--burgundy`, `--receipt`, `--gold`) — a "v7" prototype system ported from an earlier Lovable build that was never wired to a real page. This spec does **not** reuse those classes directly (their decorative treatment — scalloped clip-path borders — differs from Figma's cleaner rounded-dashed-border cards), but does reuse the confirmed color values.
- `--font-display` / `--font-sans` are referenced in ~40 places in `app/sofra.css` but never defined anywhere in the codebase (no `next/font` call sets them) — a pre-existing latent bug. This spec defines real fonts (Playfair Display, DM Sans) but scopes them to the new components only, rather than fixing the global undefined vars, to keep this change isolated.

---

## Content decision (resolved)

The Preferences frame in Figma includes a "Pour Me" alcohol section (Wine/Spirits/Cocktails/Beer/Non-alcoholic) and a standalone "Halal" checkbox. Both conflict with decisions already made and documented in this repo:

- Alcohol/drinks was deliberately removed from guest preferences and replaced with protein + flavor preference (commit `c95f792`; comment at `lib/theme.ts:39`).
- `docs/RECOMMENDATION_PIPELINE.md` §8 specifies "No pork/alcohol" as the canonical dietary term and explicitly says not to introduce a parallel "Halal" tag.

**Resolution**: visual shell only. The ported Preferences screen uses the Figma receipt card's layout, typography, and interaction style, populated with real data:

- Dietary → `DIETARY` from `lib/theme.ts`
- Avoid/allergies → `NOGOS` from `lib/theme.ts`
- Protein preference (max 2, existing cap logic) → `PROTEIN_PREFERENCE_OPTIONS` / `updateProteinPreferenceSelection` from `lib/protein-preferences.ts`
- Flavors → `FLAVORS` from `lib/theme.ts`
- Adventurousness → single slider, matching the existing RSVP copy ("Keep it familiar" → "Chef, surprise me")

No alcohol section. No standalone "Halal" chip — dietary options render exactly as `DIETARY` already defines them.

The Welcome/Auth frame has no content conflicts and ports close to 1:1.

---

## Routes

Two new, unlinked routes — no navigation entry point, no changes to any existing route:

```
app/design-preview/welcome/page.tsx
app/design-preview/preferences/page.tsx
```

Each is a self-contained page (own minimal layout, no `NavBar`/`ChefTabs` chrome). Reachable directly at `/design-preview/welcome` and `/design-preview/preferences` in dev.

`app/design-preview/` is intentionally outside the `(auth)`/(guest)`/(chef)`/(host)` route groups so it doesn't inherit their layouts or middleware assumptions.

---

## Components

New folder, isolated from existing component trees:

```
components/sofra-v2/WelcomeCard.tsx
components/sofra-v2/PreferencesReceipt.tsx
components/sofra-v2/sofra-v2.css        (scoped styles, new file — does not touch app/sofra.css)
```

- `WelcomeCard`: renders the rounded-corner card with dashed inner hairline, "EST. 2026" eyebrow, Arabic subtitle, "WELCOME TO THE Sofra." headline, "YALLA" button. Presentational only — the button is a no-op / logs a placeholder action, since there's no target screen yet (frames 02–05 don't exist).
- `PreferencesReceipt`: renders the tan receipt card (perforated top edge, straight divider lines, section labels, checkbox rows, adventurousness slider, "SAVE MY SEAT" button). Takes the same option lists as the live RSVP step 2, driven by local `useState` (no Supabase reads/writes — this is a preview, not a data-connected page). Reuses `updateProteinPreferenceSelection` so the max-2 protein cap behaves identically to production.

---

## Typography

`next/font/google` loads Playfair Display (italic, for display headlines) and DM Sans (for body/labels), applied via a wrapper class scoped to `components/sofra-v2/*` only — not touched at the `app/layout.tsx` level, so no other page's rendering changes.

---

## Light/dark mode

Wired through the existing `useAppearance()` hook and `data-theme` attribute mechanism from `lib/sofra/appearance.ts` (already used app-wide) — not a new theme system. A visible toggle control (reusing the existing `.theme-toggle` interaction pattern) sits on both preview pages.

Dark values come directly from Figma. Light values are derived to match the existing `[data-theme="light"]` conventions already in `app/sofra.css`:

- Page background: `#FBF8F1` (matches existing light-mode page bg)
- Card/receipt surface: `#FFFDF8` (matches existing light-mode surface color)
- Primary text: `#5C1515` (burgundy, unchanged — already legible on light)
- Gold accent: `#9A7620` (darkened from `#C4A35A` for contrast on a light ground, matching the existing light-mode gold override)

---

## Testing

Add `__tests__/design-preview.test.tsx` covering:

- Both preview pages render without crashing
- `PreferencesReceipt` shows the real `DIETARY`/`NOGOS`/`FLAVORS`/protein options and does **not** render any alcohol-related text or a standalone "Halal" option
- Protein selection enforces the existing max-2 cap (same behavior as the live RSVP step)
- Light/dark toggle flips `data-theme` and swaps visible colors

No changes to any existing test file — this is additive only.

---

## Explicitly out of scope

- Wiring these screens into the real login or RSVP flow
- Frames 02–05 (don't exist in Figma yet)
- Any change to `app/sofra.css`, existing components, or existing routes
- Fixing the global undefined `--font-display`/`--font-sans` vars outside the new scoped components
