# Figma Frontend Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the two existing Figma frames (`01 — Welcome / Auth`, `06 — Preferences (Receipt)`) into two real, isolated Next.js pages at `/design-preview/welcome` and `/design-preview/preferences`, reachable in dev, with zero changes to any existing route, component, or stylesheet.

**Architecture:** New, self-contained `components/sofra-v2/` folder (components + one scoped stylesheet) and two new `app/design-preview/*/page.tsx` routes. The Preferences screen reuses the Figma receipt's visual shell but is wired to the app's real preference data (`lib/theme.ts`, `lib/protein-preferences.ts`) instead of the mockup's alcohol section / "Halal" chip. Light/dark is a self-contained preview-only mechanism (own `sofra-v2-preview-theme` localStorage key) — corrected during execution to not couple to the app's existing `useAppearance()` hook (`lib/sofra/appearance.ts`), so toggling the preview theme can never read or write the app's real appearance state. See Task 4 for the full rationale.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, plain scoped CSS (no Tailwind, matching the existing `app/sofra.css` convention), `next/font/google`, Jest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-06-figma-frontend-preview-design.md`

---

## File Structure

```
public/design-preview/
  perforation-top.svg     (already downloaded — see Task 1)
  divider-line.svg        (already downloaded — see Task 1)
  divider-line-alt.svg    (already downloaded — see Task 1)
  slider-dot.svg          (already downloaded — see Task 1)

components/sofra-v2/
  fonts.ts                 — next/font/google loaders (Playfair Display, DM Sans)
  sofra-v2.css              — all scoped styles (dark values + [data-sv2-theme="light"] overrides)
  ThemeToggle.tsx           — Dark/Light toggle, self-contained (own localStorage key, isolated from lib/sofra/appearance.ts)
  WelcomeCard.tsx           — Figma frame 01, presentational
  PreferencesReceipt.tsx    — Figma frame 06 shell, real data from lib/theme.ts + lib/protein-preferences.ts

app/design-preview/
  welcome/page.tsx
  preferences/page.tsx

__tests__/
  design-preview.test.tsx
```

---

### Task 1: Commit the downloaded Figma assets

The four decorative SVGs referenced by the Preferences receipt (perforated top edge, two divider line styles, slider dot) were already fetched from Figma's asset API and saved to `public/design-preview/` during design research, since Figma's asset URLs expire in ~7 days. Confirm they're present and commit them now so later tasks can reference stable local paths.

**Files:**
- Already present: `public/design-preview/perforation-top.svg`
- Already present: `public/design-preview/divider-line.svg`
- Already present: `public/design-preview/divider-line-alt.svg`
- Already present: `public/design-preview/slider-dot.svg`

- [ ] **Step 1: Verify the four files exist and contain SVG markup**

Run: `ls public/design-preview/`
Expected: four `.svg` files listed (`perforation-top.svg`, `divider-line.svg`, `divider-line-alt.svg`, `slider-dot.svg`)

- [ ] **Step 2: Commit**

```bash
git add public/design-preview/
git commit -m "Add Figma receipt decorative SVG assets for design preview"
```

---

### Task 2: Shared web fonts module

**Files:**
- Create: `components/sofra-v2/fonts.ts`

The Figma frames use Playfair Display (italic, display headlines) and DM Sans (body/labels/uppercase eyebrows). Load both via `next/font/google`, exporting CSS variable names that the stylesheet in Task 3 will reference. This is a pure config file — no test needed, it has no branching logic.

Corrected during execution: a per-node audit of both Figma frames' design-context output found Playfair Display is only ever used at weight 400 (both `italic` and `normal` styles appear; no 500 or 600 weight appears anywhere in either frame). The weight array below reflects that finding rather than the original draft's `['400', '500', '600']`.

- [ ] **Step 1: Write the module**

```ts
import { Playfair_Display, DM_Sans } from 'next/font/google'

export const sv2Display = Playfair_Display({
  subsets: ['latin'],
  style: ['italic', 'normal'],
  weight: ['400'],
  variable: '--sv2-font-display',
  display: 'swap',
})

export const sv2Sans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--sv2-font-sans',
  display: 'swap',
})
```

- [ ] **Step 2: Commit**

```bash
git add components/sofra-v2/fonts.ts
git commit -m "Add scoped Playfair Display / DM Sans loaders for design preview"
```

---

### Task 3: Scoped stylesheet

**Files:**
- Create: `components/sofra-v2/sofra-v2.css`

All classes are prefixed `sv2-` so they can never collide with the existing (unused) `app/sofra.css` classes. Every selector is either a `.sv2-*` class or explicitly nested under `.sv2-root` (e.g. `.sv2-root *`, `.sv2-root .sv2-checkbox-row input`) — no bare element selectors anywhere. Dark values are the default (matching Figma); `[data-sv2-theme="light"] .sv2-root` overrides them, using the same hex values the existing `[data-theme="light"]` rules in `app/sofra.css` already use for equivalent surfaces (page bg `#FBF8F1`, card surface `#FFFDF8`, darkened gold `#9A7620`).

Hardened after Task 4 review: this selector originally read `[data-theme="light"] .sv2-root`, sharing the generic `data-theme` attribute name with the production appearance system (`lib/sofra/appearance.ts`). The project owner required a dedicated attribute to guarantee the two systems can never share state or collide across a client-side navigation — `data-sv2-theme` — applied only by `ThemeToggle.tsx` (see Task 4). The block below reflects the final, hardened selector.

Corrected during execution, against a precise per-node re-audit of the actual Figma design-context output (the version below reflects two rounds of correction — an initial fidelity pass, then a spec-compliance review that caught two remaining scoping/tokenization gaps):

- Welcome title (`.sv2-welcome-title`) is `font-size:18px`, not the original draft's `32px`.
- Receipt card (`.sv2-receipt-card`) and save button (`.sv2-save-btn`) have `border-radius:0` — the Figma source has no rounding on either node, unlike the Welcome card (28px) and Yalla button (20px), which genuinely are rounded.
- The "سفرة" wordmark uses its own token, `--sv2-wordmark` (`#C6AB88` dark / `#8A6B3D` light derived), distinct from `--sv2-gold` (`#C4A35A` / `#9A7620`) — two different exact hex values from two different Figma nodes, not one value reused.
- Receipt headline is `font-size:14px; line-height:22px` (not `13px`/`1.6`).
- Yalla button padding is `12px 32px` (not `13px 34px`).
- Perforation image straddles the card's top edge with `margin:-7px -26px 22px` (matching Figma's `top:-7px` offset — half above the card, half below), not sitting fully inside it.
- Slider labels are `font-size:10px` with `color:var(--sv2-muted)` (`rgba(92,21,21,0.6)`, matching Figma's 60%-opacity ink), not `9px` with a generic opacity.
- `font-variation-settings:"opsz" 14` is set once at `.sv2-root` (inherited by all descendants) because every DM Sans node in the Figma source carries this setting explicitly.
- No `text-transform: uppercase` is applied anywhere content-related — Figma achieves all-caps via literal uppercase characters in the text content, not a CSS transform, so the stylesheet doesn't fabricate a rule Figma doesn't have. (The one exception, `.sv2-theme-toggle-btn`, is a new control with no Figma source at all, so a CSS transform there is a legitimate original choice, not a fidelity claim.)
- `env(safe-area-inset-*)` handling on the page shell and the fixed theme toggle is a deliberate addition with no Figma source — Figma has no concept of device safe areas.
- No gradients and no box-shadows anywhere — confirmed against the Figma source, neither frame uses either.
- The four `.sv2-checkbox-row input` selectors are prefixed `.sv2-root ` (spec-compliance review caught these as unscoped bare-element selectors).
- `--sv2-toggle-bg` (`rgba(0,0,0,0.18)`) and `--sv2-on-fg` (`#2C1000`) are tokens, not literals — same review caught two hardcoded colors in the theme-toggle block. Both are declared once in the base `.sv2-root` block only (no light-mode override) since they're new UI mechanics identical in both themes, not Figma-sourced values that differ by theme.

- [ ] **Step 1: Write the stylesheet**

```css
/* ============================================================
   Sofra v2 — Figma design-preview screens only.
   Every rule in this file is scoped under `.sv2-root`; nothing
   here targets a bare element selector, so it cannot affect any
   existing Sofra page even if this stylesheet were ever loaded
   alongside them (in practice it is only ever imported by the
   two app/design-preview/*/page.tsx routes, so it is never
   fetched on any other route at all).
   ============================================================ */

.sv2-root,
.sv2-root *{
  box-sizing:border-box;
}

.sv2-root{
  /* font stacks — fallbacks live here once, referenced everywhere below */
  --sv2-display-family: var(--sv2-font-display), Georgia, serif;
  --sv2-sans-family: var(--sv2-font-sans), system-ui, sans-serif;

  /* color tokens — dark values, matching the Figma source exactly */
  --sv2-page-bg:#5C1515;
  --sv2-card-bg:#F4EFE4;
  --sv2-receipt-bg:#D9C69C;
  --sv2-gold:#C4A35A;
  --sv2-ink:#5C1515;
  --sv2-wordmark:#C6AB88;
  --sv2-toggle-fg:#F4EFE4;
  --sv2-line:rgba(92,21,21,0.4);
  --sv2-muted:rgba(92,21,21,0.6);
  --sv2-toggle-bg:rgba(0,0,0,0.18);
  --sv2-on-fg:#2C1000;

  font-variation-settings:"opsz" 14;
}

[data-sv2-theme="light"] .sv2-root{
  /* derived — Figma has no light variant. Matches the values the
     rest of the app already uses for equivalent light-mode surfaces
     (see the [data-theme="light"] rules in app/sofra.css — that's a
     different, production attribute; this file intentionally uses its
     own data-sv2-theme attribute instead, applied by ThemeToggle.tsx,
     so the two systems can never share state). */
  --sv2-page-bg:#FBF8F1;
  --sv2-card-bg:#FFFDF8;
  --sv2-receipt-bg:#FFFDF8;
  --sv2-gold:#9A7620;
  --sv2-ink:#5C1515;
  --sv2-wordmark:#8A6B3D;
  --sv2-toggle-fg:#5C1515;
  --sv2-line:rgba(92,21,21,0.4);
  --sv2-muted:rgba(92,21,21,0.6);
}

/* ---- shared page shell ---- */

.sv2-welcome-page,
.sv2-receipt-page{
  min-height:100dvh;
  background:var(--sv2-page-bg);
  display:flex;
  align-items:center;
  justify-content:center;
  padding:
    max(48px, env(safe-area-inset-top))
    max(20px, env(safe-area-inset-right))
    max(48px, env(safe-area-inset-bottom))
    max(20px, env(safe-area-inset-left));
  font-family:var(--sv2-sans-family);
  transition:background-color .3s ease;
}

/* ---- 01 — Welcome / Auth (Figma node 1:2) ---- */

.sv2-welcome-card{
  position:relative;
  width:100%;
  max-width:320px;
  min-height:560px;
  background:var(--sv2-card-bg);
  border:1px solid var(--sv2-gold);
  border-radius:28px;
  padding:44px 28px 36px;
  display:flex;
  flex-direction:column;
  overflow:hidden;
  transition:background-color .3s ease;
}

.sv2-welcome-hairline{
  position:absolute;
  inset:11px;
  border:1px dashed var(--sv2-gold);
  border-radius:20px;
  pointer-events:none;
}

.sv2-eyebrow{
  font-family:var(--sv2-sans-family);
  font-weight:500;
  font-size:10px;
  letter-spacing:1.5px;
  color:var(--sv2-ink);
  margin:0 0 10px;
}

.sv2-arabic{
  font-family:var(--sv2-display-family);
  font-size:15px;
  color:var(--sv2-ink);
  margin:0 0 18px;
}

.sv2-welcome-kicker{
  font-family:var(--sv2-sans-family);
  font-weight:500;
  font-size:11px;
  letter-spacing:1px;
  line-height:15px;
  color:var(--sv2-ink);
  margin:0;
}

.sv2-welcome-title{
  font-family:var(--sv2-display-family);
  font-style:italic;
  font-size:18px;
  color:var(--sv2-ink);
  margin:2px 0 0;
}

.sv2-yalla-btn{
  align-self:center;
  margin-top:auto;
  border:1px solid var(--sv2-ink);
  border-radius:20px;
  background:transparent;
  color:var(--sv2-ink);
  font-family:var(--sv2-sans-family);
  font-weight:500;
  font-size:13px;
  letter-spacing:2px;
  padding:12px 32px;
  cursor:pointer;
  transition:opacity .2s ease;
}
.sv2-yalla-btn:hover{opacity:.75;}
.sv2-yalla-btn:focus-visible{outline:2px solid var(--sv2-gold);outline-offset:3px;}

/* ---- 06 — Preferences / Receipt (Figma node 2:2) ---- */

.sv2-receipt-card{
  position:relative;
  width:100%;
  max-width:380px;
  background:var(--sv2-receipt-bg);
  border-radius:0;
  padding:26px 26px 32px;
  overflow:hidden;
  transition:background-color .3s ease;
}

.sv2-perforation{
  display:block;
  width:calc(100% + 52px);
  height:14px;
  margin:-7px -26px 22px;
}

.sv2-receipt-wordmark{
  font-family:var(--sv2-display-family);
  font-style:italic;
  font-size:40px;
  text-align:center;
  color:var(--sv2-wordmark);
  margin:0 0 12px;
}

.sv2-receipt-headline{
  font-family:var(--sv2-sans-family);
  font-weight:500;
  font-size:14px;
  letter-spacing:0.5px;
  line-height:22px;
  color:var(--sv2-ink);
  margin:0 0 18px;
}

.sv2-divider{
  display:block;
  width:100%;
  height:1px;
  margin:20px 0;
}

.sv2-section-label{
  font-family:var(--sv2-sans-family);
  font-weight:500;
  font-size:13px;
  letter-spacing:1.5px;
  color:var(--sv2-ink);
  margin:0 0 12px;
}

.sv2-section-sub{
  font-family:var(--sv2-sans-family);
  font-size:11px;
  color:var(--sv2-ink);
  opacity:0.65;
  margin:-6px 0 12px;
}

.sv2-checkbox-grid{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:12px 16px;
}

.sv2-checkbox-row{
  position:relative;
  display:flex;
  align-items:center;
  gap:10px;
  font-family:var(--sv2-sans-family);
  font-size:13px;
  color:var(--sv2-ink);
  cursor:pointer;
  user-select:none;
}

.sv2-root .sv2-checkbox-row input{
  position:absolute;
  inset:0;
  width:16px;
  height:16px;
  margin:0;
  opacity:0;
  cursor:pointer;
}

.sv2-checkbox-box{
  position:relative;
  width:16px;
  height:16px;
  flex-shrink:0;
  border:1px solid var(--sv2-ink);
}

.sv2-root .sv2-checkbox-row input:checked ~ .sv2-checkbox-box{
  background:var(--sv2-ink);
}
.sv2-root .sv2-checkbox-row input:checked ~ .sv2-checkbox-box::after{
  content:"";
  position:absolute;
  left:3px;
  top:0;
  width:4px;
  height:8px;
  border:solid var(--sv2-receipt-bg);
  border-width:0 2px 2px 0;
  transform:rotate(40deg);
}
.sv2-root .sv2-checkbox-row input:focus-visible ~ .sv2-checkbox-box{
  outline:2px solid var(--sv2-gold);
  outline-offset:2px;
}

.sv2-hint{
  font-family:var(--sv2-sans-family);
  font-size:11px;
  color:var(--sv2-gold);
  margin:8px 0 0;
}

.sv2-slider{
  -webkit-appearance:none;
  appearance:none;
  width:100%;
  height:14px;
  background:transparent;
  margin:6px 0 8px;
  cursor:pointer;
}
.sv2-slider::-webkit-slider-runnable-track{
  height:1px;
  background:var(--sv2-line);
}
.sv2-slider::-webkit-slider-thumb{
  -webkit-appearance:none;
  appearance:none;
  width:14px;
  height:14px;
  border-radius:50%;
  background:var(--sv2-ink);
  margin-top:-6.5px;
  cursor:pointer;
}
.sv2-slider::-moz-range-track{
  height:1px;
  background:var(--sv2-line);
}
.sv2-slider::-moz-range-thumb{
  width:14px;
  height:14px;
  border:none;
  border-radius:50%;
  background:var(--sv2-ink);
  cursor:pointer;
}
.sv2-slider:focus-visible{
  outline:2px solid var(--sv2-gold);
  outline-offset:4px;
}

.sv2-slider-labels{
  display:flex;
  justify-content:space-between;
  font-family:var(--sv2-sans-family);
  font-weight:500;
  font-size:10px;
  letter-spacing:1px;
  color:var(--sv2-muted);
}

.sv2-slider-value{
  font-family:var(--sv2-display-family);
  font-style:italic;
  font-size:13px;
  text-align:center;
  color:var(--sv2-ink);
  margin:8px 0 0;
}

.sv2-save-btn{
  display:block;
  width:100%;
  border:1px solid var(--sv2-ink);
  border-radius:0;
  background:transparent;
  color:var(--sv2-ink);
  font-family:var(--sv2-sans-family);
  font-weight:500;
  font-size:13px;
  letter-spacing:2px;
  padding:16px;
  cursor:pointer;
  transition:opacity .2s ease;
}
.sv2-save-btn:hover{opacity:.75;}
.sv2-save-btn:focus-visible{outline:2px solid var(--sv2-gold);outline-offset:3px;}

/* ---- shared theme toggle (not in Figma — new, functional control) ---- */

.sv2-theme-toggle{
  position:fixed;
  top:max(16px, env(safe-area-inset-top));
  right:max(16px, env(safe-area-inset-right));
  z-index:20;
  display:inline-flex;
  gap:2px;
  border:1px solid var(--sv2-gold);
  background:var(--sv2-toggle-bg);
  border-radius:999px;
  padding:3px;
}

.sv2-theme-toggle-btn{
  border:none;
  background:transparent;
  color:var(--sv2-toggle-fg);
  font-family:var(--sv2-sans-family);
  font-size:10px;
  letter-spacing:0.06em;
  text-transform:uppercase;
  border-radius:999px;
  padding:7px 12px;
  cursor:pointer;
}

.sv2-theme-toggle-btn.sv2-on{
  background:var(--sv2-gold);
  color:var(--sv2-on-fg);
  font-weight:700;
}
```

- [ ] **Step 2: Commit**

```bash
git add components/sofra-v2/sofra-v2.css
git commit -m "Add scoped stylesheet for design preview screens"
```

---

### Task 4: ThemeToggle component

**Files:**
- Create: `components/sofra-v2/ThemeToggle.tsx`
- Test: `__tests__/design-preview.test.tsx` (created in this task, extended in later tasks)

Corrected during execution: the project owner required this control to be fully isolated from the app's real (currently dormant) theme system — a dedicated `sofra-v2-preview-theme` localStorage key, no import of `lib/sofra/appearance.ts`, and no React Context/Provider. The original draft (reusing `useAppearance()`) was superseded before implementation; the version actually built is self-contained.

Hardened in a follow-up commit after this task's review: the component initially still applied the generic `data-theme` attribute to `document.documentElement` — the same attribute name the production appearance system (`lib/sofra/appearance.ts`) uses — because Task 3's CSS contract requires an ancestor element to carry the attribute. Sharing that name was flagged as a latent risk (a leftover preview value could theoretically bleed into a future page using the real appearance system across a client-side navigation). The project owner required a dedicated attribute instead, `data-sv2-theme`, plus cleanup on unmount so it never outlives the component. The code below reflects that final, hardened contract:

- Applies `data-sv2-theme` (via a `PREVIEW_ATTR` constant), never `data-theme` — the production attribute is never read, written, or removed by this component.
- Removes `data-sv2-theme` from `document.documentElement` when the component unmounts, so it can't linger after leaving a `/design-preview/*` route.
- Still a lightweight `useEffect` DOM side-effect, not a Context/Provider — and still currently inert everywhere except the not-yet-built `/design-preview/*` pages, since no live route reads `data-sv2-theme` or renders any class gated by it.

There is no theme-toggle control anywhere in the Figma source file — this is a new, functional, non-Figma-sourced control, styled by the `.sv2-theme-toggle` / `.sv2-theme-toggle-btn` classes already committed in Task 3.

The toggle's own root `<div>` must carry the `sv2-root` class itself (not just be nested under one) so its CSS variables resolve, since it's meant to be rendered standalone on a page.

- [ ] **Step 1: Write the failing tests**

Create `__tests__/design-preview.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeToggle } from '@/components/sofra-v2/ThemeToggle'

const PREVIEW_KEY = 'sofra-v2-preview-theme'
const APP_KEY = 'sofra_theme'
const APP_ATTR = 'data-theme'
const PREVIEW_ATTR = 'data-sv2-theme'

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute(PREVIEW_ATTR)
    document.documentElement.removeAttribute(APP_ATTR)
  })

  it('defaults to the dark preview theme when no preference is stored', () => {
    render(<ThemeToggle />)
    expect(document.documentElement.getAttribute(PREVIEW_ATTR)).toBe('dark')
    expect(screen.getByRole('button', { name: 'Dark preview theme (current)' })).toBeInTheDocument()
  })

  it('switches from dark to light when Light is clicked', async () => {
    const user = userEvent.setup()
    render(<ThemeToggle />)
    await user.click(screen.getByRole('button', { name: 'Switch to light preview theme' }))
    expect(document.documentElement.getAttribute(PREVIEW_ATTR)).toBe('light')
  })

  it('switches from light back to dark when Dark is clicked', async () => {
    const user = userEvent.setup()
    render(<ThemeToggle />)
    await user.click(screen.getByRole('button', { name: 'Switch to light preview theme' }))
    await user.click(screen.getByRole('button', { name: 'Switch to dark preview theme' }))
    expect(document.documentElement.getAttribute(PREVIEW_ATTR)).toBe('dark')
  })

  it('updates aria-label and aria-pressed on both buttons as the state changes', async () => {
    const user = userEvent.setup()
    render(<ThemeToggle />)
    expect(screen.getByRole('button', { name: 'Dark preview theme (current)' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Switch to light preview theme' })).toHaveAttribute('aria-pressed', 'false')

    await user.click(screen.getByRole('button', { name: 'Switch to light preview theme' }))

    expect(screen.getByRole('button', { name: 'Light preview theme (current)' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Switch to dark preview theme' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('persists the choice under a dedicated preview-only key and restores it on next mount', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<ThemeToggle />)
    await user.click(screen.getByRole('button', { name: 'Switch to light preview theme' }))
    expect(localStorage.getItem(PREVIEW_KEY)).toBe('light')
    unmount()

    render(<ThemeToggle />)
    expect(document.documentElement.getAttribute(PREVIEW_ATTR)).toBe('light')
  })

  it('never reads or writes the existing app-wide theme key', async () => {
    const user = userEvent.setup()
    const sentinel = 'not-a-real-theme-value'
    localStorage.setItem(APP_KEY, sentinel)
    render(<ThemeToggle />)
    expect(document.documentElement.getAttribute(PREVIEW_ATTR)).toBe('dark')

    await user.click(screen.getByRole('button', { name: 'Switch to light preview theme' }))
    expect(localStorage.getItem(APP_KEY)).toBe(sentinel)
    expect(localStorage.getItem(PREVIEW_KEY)).toBe('light')
  })

  it('never writes or removes the production data-theme attribute', async () => {
    const user = userEvent.setup()
    document.documentElement.setAttribute(APP_ATTR, 'light')
    const { unmount } = render(<ThemeToggle />)
    expect(document.documentElement.getAttribute(APP_ATTR)).toBe('light')

    await user.click(screen.getByRole('button', { name: 'Switch to light preview theme' }))
    expect(document.documentElement.getAttribute(APP_ATTR)).toBe('light')

    await user.click(screen.getByRole('button', { name: 'Switch to dark preview theme' }))
    expect(document.documentElement.getAttribute(APP_ATTR)).toBe('light')

    unmount()
    expect(document.documentElement.getAttribute(APP_ATTR)).toBe('light')
  })

  it('removes the preview-only attribute from the document when unmounted', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<ThemeToggle />)
    await user.click(screen.getByRole('button', { name: 'Switch to light preview theme' }))
    expect(document.documentElement.getAttribute(PREVIEW_ATTR)).toBe('light')

    unmount()
    expect(document.documentElement.getAttribute(PREVIEW_ATTR)).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/design-preview.test.tsx --verbose`
Expected: FAIL — `Cannot find module '@/components/sofra-v2/ThemeToggle'`

- [ ] **Step 3: Write the component**

```tsx
'use client'

import { useEffect, useState } from 'react'

type PreviewTheme = 'light' | 'dark'

const STORAGE_KEY = 'sofra-v2-preview-theme'
const PREVIEW_ATTR = 'data-sv2-theme'

function applyPreviewTheme(theme: PreviewTheme) {
  document.documentElement.setAttribute(PREVIEW_ATTR, theme)
}

export function ThemeToggle() {
  // Deterministic for SSR and first client paint: always 'dark', matching
  // the Figma-sourced screens' default. Browser storage is read only after
  // mount (below), never during render, so server and first-paint markup
  // always match — no hydration mismatch.
  const [theme, setTheme] = useState<PreviewTheme>('dark')

  useEffect(() => {
    let stored: string | null = null
    try {
      stored = window.localStorage.getItem(STORAGE_KEY)
    } catch {
      // Storage unavailable (e.g. private browsing) — fall back to the default.
    }
    const initial: PreviewTheme = stored === 'light' ? 'light' : 'dark'
    setTheme(initial)
    applyPreviewTheme(initial)

    // Preview-only attribute — distinct from the app's real `data-theme`
    // attribute — so it must not outlive this component. Without this,
    // leaving a /design-preview route would leave data-sv2-theme sitting
    // on <html> indefinitely.
    return () => {
      document.documentElement.removeAttribute(PREVIEW_ATTR)
    }
  }, [])

  function selectTheme(next: PreviewTheme) {
    setTheme(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Storage unavailable — the in-memory theme still applies for this session.
    }
    applyPreviewTheme(next)
  }

  return (
    <div className="sv2-root sv2-theme-toggle" role="group" aria-label="Preview appearance">
      <button
        type="button"
        className={theme === 'dark' ? 'sv2-theme-toggle-btn sv2-on' : 'sv2-theme-toggle-btn'}
        aria-pressed={theme === 'dark'}
        aria-label={theme === 'dark' ? 'Dark preview theme (current)' : 'Switch to dark preview theme'}
        onClick={() => selectTheme('dark')}
      >
        Dark
      </button>
      <button
        type="button"
        className={theme === 'light' ? 'sv2-theme-toggle-btn sv2-on' : 'sv2-theme-toggle-btn'}
        aria-pressed={theme === 'light'}
        aria-label={theme === 'light' ? 'Light preview theme (current)' : 'Switch to light preview theme'}
        onClick={() => selectTheme('light')}
      >
        Light
      </button>
    </div>
  )
}
```

Note: a single `ThemeToggle` instance is assumed per rendered page (each `/design-preview/*` route mounts exactly one, directly in its page component — see Task 7). The unmount cleanup unconditionally removes `PREVIEW_ATTR`; if a future change ever rendered two instances simultaneously on one page, one unmounting would clear the attribute out from under the other. Not a risk under the current one-per-page usage, but worth keeping in mind if this component is ever reused inside a shared layout.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest __tests__/design-preview.test.tsx --verbose`
Expected: PASS — all 8 tests

- [ ] **Step 5: Commit**

```bash
git add components/sofra-v2/ThemeToggle.tsx __tests__/design-preview.test.tsx
git commit -m "Add ThemeToggle for design preview, isolated from the app's real theme system"
```

(As executed, this was committed as two commits: the version applying `data-theme` first, reviewed, then hardened to `data-sv2-theme` with unmount cleanup in a dedicated follow-up commit once the shared-attribute risk was identified. The code above is the final state either way.)

---

### Task 5: WelcomeCard component

**Files:**
- Create: `components/sofra-v2/WelcomeCard.tsx`
- Test: `__tests__/design-preview.test.tsx` (extended)

Ports Figma frame `01 — Welcome / Auth` (node `1:2`) directly — no content conflicts to reconcile. The "YALLA" button has no destination yet (frames 02–05 don't exist in Figma), so it's a no-op that logs to the console rather than navigating anywhere.

- [ ] **Step 1: Write the failing test**

Add `import { WelcomeCard } from '@/components/sofra-v2/WelcomeCard'` to the top import block of `__tests__/design-preview.test.tsx` (alongside the existing imports from Task 4), then append this new `describe` block below the existing `ThemeToggle` one:

```tsx
describe('WelcomeCard', () => {
  it('renders the welcome copy and the Yalla button', () => {
    render(<WelcomeCard />)
    expect(screen.getByText('EST. 2026')).toBeInTheDocument()
    expect(screen.getByText('Sofra.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'YALLA' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/design-preview.test.tsx --verbose`
Expected: FAIL — `Cannot find module '@/components/sofra-v2/WelcomeCard'`

- [ ] **Step 3: Write the component**

```tsx
'use client'

import { sv2Display, sv2Sans } from './fonts'

export function WelcomeCard() {
  return (
    <div className={`sv2-root sv2-welcome-page ${sv2Display.variable} ${sv2Sans.variable}`}>
      <div className="sv2-welcome-card">
        <div className="sv2-welcome-hairline" aria-hidden="true" />
        <p className="sv2-eyebrow">EST. 2026</p>
        <p className="sv2-arabic" dir="auto">اتفضلوا على السفرة</p>
        <p className="sv2-welcome-kicker">
          WELCOME TO
          <br />
          THE
        </p>
        <p className="sv2-welcome-title">Sofra.</p>
        <button
          type="button"
          className="sv2-yalla-btn"
          onClick={() => console.log('YALLA clicked — next screen not yet designed in Figma')}
        >
          YALLA
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/design-preview.test.tsx --verbose`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components/sofra-v2/WelcomeCard.tsx __tests__/design-preview.test.tsx
git commit -m "Add WelcomeCard, ported from Figma frame 01"
```

---

### Task 6: PreferencesReceipt component

**Files:**
- Create: `components/sofra-v2/PreferencesReceipt.tsx`
- Test: `__tests__/design-preview.test.tsx` (extended)

Ports the Figma `06 — Preferences (Receipt)` card's layout and typography, but replaces its content with the real preference model: `DIETARY`, `NOGOS`, `FLAVORS` from `lib/theme.ts`, and `PROTEIN_PREFERENCE_OPTIONS` / `updateProteinPreferenceSelection` from `lib/protein-preferences.ts` (same max-two-selection behavior as the live RSVP page). No alcohol section, no standalone "Halal" chip. Local `useState` only — this is a preview, it does not read or write Supabase.

- [ ] **Step 1: Write the failing tests**

Add these three imports to the top import block of `__tests__/design-preview.test.tsx`:

```tsx
import { PreferencesReceipt } from '@/components/sofra-v2/PreferencesReceipt'
import { DIETARY, NOGOS, FLAVORS } from '@/lib/theme'
import { PROTEIN_PREFERENCE_OPTIONS } from '@/lib/protein-preferences'
```

Then append this `describe` block below the existing `WelcomeCard` one:

```tsx
describe('PreferencesReceipt', () => {
  it('renders every real preference option', () => {
    render(<PreferencesReceipt />)
    for (const item of [...DIETARY, ...NOGOS, ...FLAVORS]) {
      expect(screen.getAllByText(item).length).toBeGreaterThan(0)
    }
    for (const option of PROTEIN_PREFERENCE_OPTIONS) {
      expect(screen.getAllByText(option.label).length).toBeGreaterThan(0)
    }
  })

  it('does not render the Figma mockup alcohol section or a standalone Halal option', () => {
    render(<PreferencesReceipt />)
    expect(screen.queryByText('POUR ME')).not.toBeInTheDocument()
    expect(screen.queryByText('Wine')).not.toBeInTheDocument()
    expect(screen.queryByText('Spirits')).not.toBeInTheDocument()
    expect(screen.queryByText('Cocktails')).not.toBeInTheDocument()
    expect(screen.queryByText('Non-alcoholic')).not.toBeInTheDocument()
    expect(screen.queryByText('Beer')).not.toBeInTheDocument()
    expect(screen.queryByText('Halal')).not.toBeInTheDocument()
  })

  it('caps protein preference selection at two, matching production behavior', async () => {
    const user = userEvent.setup()
    render(<PreferencesReceipt />)
    const [first, second, third] = PROTEIN_PREFERENCE_OPTIONS.filter((o) => o.value !== 'no_preference')
    await user.click(screen.getByRole('checkbox', { name: first.label }))
    await user.click(screen.getByRole('checkbox', { name: second.label }))
    await user.click(screen.getByRole('checkbox', { name: third.label }))
    expect(screen.getByText('Only two at a time — tap one to swap it out.')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: first.label })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: second.label })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: third.label })).not.toBeChecked()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/design-preview.test.tsx --verbose`
Expected: FAIL — `Cannot find module '@/components/sofra-v2/PreferencesReceipt'`

- [ ] **Step 3: Write the component**

```tsx
'use client'

import { useState } from 'react'
import { sv2Display, sv2Sans } from './fonts'
import { DIETARY, NOGOS, FLAVORS } from '@/lib/theme'
import {
  PROTEIN_PREFERENCE_OPTIONS,
  updateProteinPreferenceSelection,
  type ProteinPreference,
} from '@/lib/protein-preferences'

function CheckboxRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: () => void
}) {
  return (
    <label className="sv2-checkbox-row">
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span className="sv2-checkbox-box" aria-hidden="true" />
      {label}
    </label>
  )
}

export function PreferencesReceipt() {
  const [dietary, setDietary] = useState<string[]>([])
  const [avoid, setAvoid] = useState<string[]>([])
  const [proteinPreferences, setProteinPreferences] = useState<ProteinPreference[]>([])
  const [proteinHint, setProteinHint] = useState(false)
  const [flavors, setFlavors] = useState<string[]>([])
  const [adventurousness, setAdventurousness] = useState(50)

  function toggleChip(list: string[], setList: (v: string[]) => void, value: string) {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value])
  }

  function toggleProtein(value: ProteinPreference) {
    const update = updateProteinPreferenceSelection(proteinPreferences, value)
    if (update.blocked) {
      setProteinHint(true)
      setTimeout(() => setProteinHint(false), 2000)
      return
    }
    setProteinPreferences(update.preferences)
  }

  const adventurousnessLabel =
    adventurousness < 25
      ? 'Keep it familiar'
      : adventurousness < 55
      ? 'Open to a nudge'
      : adventurousness < 82
      ? 'Feed me something new'
      : 'Chef, surprise me'

  return (
    <div className={`sv2-root sv2-receipt-page ${sv2Display.variable} ${sv2Sans.variable}`}>
      <div className="sv2-receipt-card">
        <img src="/design-preview/perforation-top.svg" alt="" className="sv2-perforation" />
        <p className="sv2-receipt-wordmark" dir="auto">سفرة</p>
        <p className="sv2-receipt-headline">
          WHAT&apos;S ON YOUR MIND,
          <br />
          BEFORE IT&apos;S ON YOUR PLATE
        </p>

        <img src="/design-preview/divider-line.svg" alt="" className="sv2-divider" />
        <h3 className="sv2-section-label">DEAL BREAKERS</h3>
        <div className="sv2-checkbox-grid">
          {DIETARY.map((item) => (
            <CheckboxRow
              key={item}
              label={item}
              checked={dietary.includes(item)}
              onChange={() => toggleChip(dietary, setDietary, item)}
            />
          ))}
        </div>

        <img src="/design-preview/divider-line.svg" alt="" className="sv2-divider" />
        <h3 className="sv2-section-label">ANYTHING YOU AVOID?</h3>
        <div className="sv2-checkbox-grid">
          {NOGOS.map((item) => (
            <CheckboxRow
              key={item}
              label={item}
              checked={avoid.includes(item)}
              onChange={() => toggleChip(avoid, setAvoid, item)}
            />
          ))}
        </div>

        <img src="/design-preview/divider-line.svg" alt="" className="sv2-divider" />
        <h3 className="sv2-section-label">WHAT YOU CAME FOR</h3>
        <p className="sv2-section-sub">Pick up to two.</p>
        <div className="sv2-checkbox-grid">
          {PROTEIN_PREFERENCE_OPTIONS.map((option) => (
            <CheckboxRow
              key={option.value}
              label={option.label}
              checked={proteinPreferences.includes(option.value)}
              onChange={() => toggleProtein(option.value)}
            />
          ))}
        </div>
        {proteinHint && (
          <p className="sv2-hint">Only two at a time — tap one to swap it out.</p>
        )}

        <img src="/design-preview/divider-line.svg" alt="" className="sv2-divider" />
        <h3 className="sv2-section-label">FLAVOURS YOU LEAN TOWARDS</h3>
        <div className="sv2-checkbox-grid">
          {FLAVORS.map((item) => (
            <CheckboxRow
              key={item}
              label={item}
              checked={flavors.includes(item)}
              onChange={() => toggleChip(flavors, setFlavors, item)}
            />
          ))}
        </div>

        <img src="/design-preview/divider-line.svg" alt="" className="sv2-divider" />
        <h3 className="sv2-section-label">HOW BRAVE IS YOUR PALATE?</h3>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={adventurousness}
          onChange={(e) => setAdventurousness(Number(e.target.value))}
          aria-label="Adventurousness"
          className="sv2-slider"
        />
        <div className="sv2-slider-labels">
          <span>THE USUAL</span>
          <span>ANYTHING ONCE</span>
        </div>
        <p className="sv2-slider-value">{adventurousnessLabel}</p>

        <img src="/design-preview/divider-line.svg" alt="" className="sv2-divider" />
        <button type="button" className="sv2-save-btn">
          SAVE MY SEAT
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/design-preview.test.tsx --verbose`
Expected: PASS (all `PreferencesReceipt` tests, plus the earlier `ThemeToggle` and `WelcomeCard` tests, still pass)

- [ ] **Step 5: Commit**

```bash
git add components/sofra-v2/PreferencesReceipt.tsx __tests__/design-preview.test.tsx
git commit -m "Add PreferencesReceipt: Figma receipt shell wired to real preference data"
```

---

### Task 7: Preview routes

**Files:**
- Create: `app/design-preview/welcome/page.tsx`
- Create: `app/design-preview/preferences/page.tsx`
- Test: `__tests__/design-preview.test.tsx` (extended)

These are the actual pages reachable at `/design-preview/welcome` and `/design-preview/preferences` in dev. Each imports `sofra-v2.css` — per Next.js App Router rules, global CSS may be imported from any file inside the `app/` directory, so the import belongs here rather than inside `components/sofra-v2/*`, which lives outside `app/`.

`app/design-preview/` has no route group wrapper, so it does not inherit the `(auth)`/`(guest)`/`(chef)`/`(host)` layouts — each page renders standalone against the root `app/layout.tsx` only.

- [ ] **Step 1: Write the failing tests**

Add these two imports to the top import block of `__tests__/design-preview.test.tsx`:

```tsx
import DesignPreviewWelcomePage from '@/app/design-preview/welcome/page'
import DesignPreviewPreferencesPage from '@/app/design-preview/preferences/page'
```

Then append this `describe` block below the existing `PreferencesReceipt` one. Note it needs its own `beforeEach` (Task 4 scoped `ThemeToggle`'s reset to its own `describe` block, and these route tests render `ThemeToggle` too via the page components, so leftover `localStorage`/`data-sv2-theme` state from earlier suites in this file must be cleared here as well — the preview attribute is `data-sv2-theme`, not `data-theme`, per Task 4's hardening pass). Also note the toggle's buttons no longer have a static "Light"/"Dark" accessible name — their `aria-label` changes with state (see Task 4) — so these tests check for the toggle's stable `role="group"` wrapper instead of guessing which button is currently labeled which way:

```tsx
describe('design preview routes', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-sv2-theme')
  })

  it('welcome route renders the WelcomeCard and a theme toggle', () => {
    render(<DesignPreviewWelcomePage />)
    expect(screen.getByText('Sofra.')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Preview appearance' })).toBeInTheDocument()
  })

  it('preferences route renders the PreferencesReceipt and a theme toggle', () => {
    render(<DesignPreviewPreferencesPage />)
    expect(screen.getByText('DEAL BREAKERS')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Preview appearance' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/design-preview.test.tsx --verbose`
Expected: FAIL — `Cannot find module '@/app/design-preview/welcome/page'`

- [ ] **Step 3: Write the pages**

`app/design-preview/welcome/page.tsx`:

```tsx
import '@/components/sofra-v2/sofra-v2.css'
import { WelcomeCard } from '@/components/sofra-v2/WelcomeCard'
import { ThemeToggle } from '@/components/sofra-v2/ThemeToggle'

export default function DesignPreviewWelcomePage() {
  return (
    <>
      <ThemeToggle />
      <WelcomeCard />
    </>
  )
}
```

`app/design-preview/preferences/page.tsx`:

```tsx
import '@/components/sofra-v2/sofra-v2.css'
import { PreferencesReceipt } from '@/components/sofra-v2/PreferencesReceipt'
import { ThemeToggle } from '@/components/sofra-v2/ThemeToggle'

export default function DesignPreviewPreferencesPage() {
  return (
    <>
      <ThemeToggle />
      <PreferencesReceipt />
    </>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/design-preview.test.tsx --verbose`
Expected: PASS — all tests in the file pass

- [ ] **Step 5: Manually verify in the browser**

Run: `npm run dev`
Visit `http://localhost:3000/design-preview/welcome` — confirm the card renders, the Light/Dark toggle in the top-right switches the background and card colors.
Visit `http://localhost:3000/design-preview/preferences` — confirm the receipt renders with all five real sections (Deal Breakers, Anything You Avoid?, What You Came For, Flavours You Lean Towards, How Brave Is Your Palate?), no Pour Me / alcohol section, no Halal chip, and that selecting a third protein option shows the "Only two at a time" hint instead of selecting it.

- [ ] **Step 6: Commit**

```bash
git add app/design-preview/ __tests__/design-preview.test.tsx
git commit -m "Add /design-preview routes for the Figma welcome and preferences screens"
```

---

### Task 8: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test -- --runInBand`
Expected: all tests pass, including the new `__tests__/design-preview.test.tsx`. (The project's `docs/IMPLEMENTATION_STATUS.md` notes four pre-existing event-detail invite-test failures on this branch lineage that are unrelated to this work — confirm no *new* failures were introduced beyond that known baseline.)

- [ ] **Step 2: Run the linter**

Run: `npm run lint`
Expected: no new errors in any file under `components/sofra-v2/`, `app/design-preview/`, or `__tests__/design-preview.test.tsx`

- [ ] **Step 3: Run a production build**

Run: `npm run build`
Expected: build succeeds; `/design-preview/welcome` and `/design-preview/preferences` appear in the route output

- [ ] **Step 4: Final commit if any fixes were needed**

If lint or build required fixes, stage and commit them:

```bash
git add -A
git commit -m "Fix lint/build issues in design preview screens"
```
