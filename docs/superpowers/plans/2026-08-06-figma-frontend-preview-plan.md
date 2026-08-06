# Figma Frontend Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the two existing Figma frames (`01 — Welcome / Auth`, `06 — Preferences (Receipt)`) into two real, isolated Next.js pages at `/design-preview/welcome` and `/design-preview/preferences`, reachable in dev, with zero changes to any existing route, component, or stylesheet.

**Architecture:** New, self-contained `components/sofra-v2/` folder (components + one scoped stylesheet) and two new `app/design-preview/*/page.tsx` routes. The Preferences screen reuses the Figma receipt's visual shell but is wired to the app's real preference data (`lib/theme.ts`, `lib/protein-preferences.ts`) instead of the mockup's alcohol section / "Halal" chip. Light/dark is wired through the app's existing, currently-unused `useAppearance()` hook (`lib/sofra/appearance.ts`).

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
  sofra-v2.css              — all scoped styles (dark values + [data-theme="light"] overrides)
  ThemeToggle.tsx           — Dark/Light toggle, wired to lib/sofra/appearance.ts
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

- [ ] **Step 1: Write the module**

```ts
import { Playfair_Display, DM_Sans } from 'next/font/google'

export const sv2Display = Playfair_Display({
  subsets: ['latin'],
  style: ['italic', 'normal'],
  weight: ['400', '500', '600'],
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

All classes are prefixed `sv2-` so they can never collide with the existing (unused) `app/sofra.css` classes. Every component that needs these tokens must carry the `sv2-root` class — it's what defines the CSS custom properties. Dark values are the default (matching Figma, and matching how `app/sofra.css` already treats dark as the base case); `[data-theme="light"] .sv2-root` overrides them, using the same hex values the existing `[data-theme="light"]` rules in `app/sofra.css` already use for equivalent surfaces (page bg `#FBF8F1`, card surface `#FFFDF8`, darkened gold `#9A7620`).

- [ ] **Step 1: Write the stylesheet**

```css
/* ============================================================
   Sofra v2 — Figma preview screens. Scoped via the `sv2-` prefix.
   Every element using these tokens must be a descendant of, or
   itself carry, the `sv2-root` class.
   ============================================================ */

.sv2-root,
.sv2-root *{
  box-sizing:border-box;
}

.sv2-root{
  --sv2-page-bg:#5C1515;
  --sv2-card-bg:#F4EFE4;
  --sv2-receipt-bg:#D9C69C;
  --sv2-gold:#C4A35A;
  --sv2-ink:#5C1515;
  --sv2-toggle-fg:#F4EFE4;
}

[data-theme="light"] .sv2-root{
  --sv2-page-bg:#FBF8F1;
  --sv2-card-bg:#FFFDF8;
  --sv2-receipt-bg:#FFFDF8;
  --sv2-gold:#9A7620;
  --sv2-ink:#5C1515;
  --sv2-toggle-fg:#5C1515;
}

/* ---- shared page shell ---- */

.sv2-welcome-page,
.sv2-receipt-page{
  min-height:100dvh;
  background:var(--sv2-page-bg);
  display:flex;
  align-items:center;
  justify-content:center;
  padding:48px 20px;
  font-family:var(--sv2-font-sans), system-ui, sans-serif;
  transition:background-color .3s ease;
}

/* ---- 01 — Welcome / Auth ---- */

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
  inset:12px;
  border:1px dashed var(--sv2-gold);
  border-radius:20px;
  pointer-events:none;
}

.sv2-eyebrow{
  font-family:var(--sv2-font-sans), system-ui, sans-serif;
  font-weight:500;
  font-size:10px;
  letter-spacing:1.5px;
  color:var(--sv2-ink);
  margin:0 0 10px;
}

.sv2-arabic{
  font-family:var(--sv2-font-display), Georgia, serif;
  font-size:15px;
  color:var(--sv2-ink);
  margin:0 0 18px;
}

.sv2-welcome-kicker{
  font-family:var(--sv2-font-sans), system-ui, sans-serif;
  font-weight:500;
  font-size:11px;
  letter-spacing:1px;
  line-height:15px;
  color:var(--sv2-ink);
  margin:0;
  text-transform:uppercase;
}

.sv2-welcome-title{
  font-family:var(--sv2-font-display), Georgia, serif;
  font-style:italic;
  font-size:32px;
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
  font-family:var(--sv2-font-sans), system-ui, sans-serif;
  font-weight:500;
  font-size:13px;
  letter-spacing:2px;
  padding:13px 34px;
  cursor:pointer;
  transition:opacity .2s ease;
}
.sv2-yalla-btn:hover{opacity:.75;}
.sv2-yalla-btn:focus-visible{outline:2px solid var(--sv2-gold);outline-offset:3px;}

/* ---- 06 — Preferences (Receipt) ---- */

.sv2-receipt-card{
  position:relative;
  width:100%;
  max-width:380px;
  background:var(--sv2-receipt-bg);
  border-radius:6px;
  padding:26px 26px 32px;
  overflow:hidden;
  transition:background-color .3s ease;
}

.sv2-perforation{
  display:block;
  width:calc(100% + 52px);
  height:14px;
  margin:0 -26px 22px;
}

.sv2-receipt-wordmark{
  font-family:var(--sv2-font-display), Georgia, serif;
  font-style:italic;
  font-size:40px;
  text-align:center;
  color:var(--sv2-gold);
  margin:0 0 12px;
}

.sv2-receipt-headline{
  font-family:var(--sv2-font-sans), system-ui, sans-serif;
  font-weight:500;
  font-size:13px;
  letter-spacing:0.5px;
  line-height:1.6;
  color:var(--sv2-ink);
  margin:0 0 18px;
}

.sv2-divider{
  display:block;
  width:100%;
  height:1px;
  margin:18px 0;
}

.sv2-section-label{
  font-family:var(--sv2-font-sans), system-ui, sans-serif;
  font-weight:500;
  font-size:12px;
  letter-spacing:1.5px;
  color:var(--sv2-ink);
  text-transform:uppercase;
  margin:0 0 12px;
}

.sv2-section-sub{
  font-family:var(--sv2-font-sans), system-ui, sans-serif;
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
  font-family:var(--sv2-font-sans), system-ui, sans-serif;
  font-size:13px;
  color:var(--sv2-ink);
  cursor:pointer;
  user-select:none;
}

.sv2-checkbox-row input{
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

.sv2-checkbox-row input:checked ~ .sv2-checkbox-box{
  background:var(--sv2-ink);
}
.sv2-checkbox-row input:checked ~ .sv2-checkbox-box::after{
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
.sv2-checkbox-row input:focus-visible ~ .sv2-checkbox-box{
  outline:2px solid var(--sv2-gold);
  outline-offset:2px;
}

.sv2-hint{
  font-family:var(--sv2-font-sans), system-ui, sans-serif;
  font-size:11px;
  color:var(--sv2-gold);
  margin:8px 0 0;
}

.sv2-slider{
  width:100%;
  margin:6px 0 8px;
  accent-color:var(--sv2-ink);
}

.sv2-slider-labels{
  display:flex;
  justify-content:space-between;
  font-family:var(--sv2-font-sans), system-ui, sans-serif;
  font-size:9px;
  letter-spacing:1px;
  text-transform:uppercase;
  color:var(--sv2-ink);
  opacity:0.6;
}

.sv2-slider-value{
  font-family:var(--sv2-font-display), Georgia, serif;
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
  border-radius:4px;
  background:transparent;
  color:var(--sv2-ink);
  font-family:var(--sv2-font-sans), system-ui, sans-serif;
  font-weight:500;
  font-size:13px;
  letter-spacing:2px;
  padding:16px;
  cursor:pointer;
  transition:opacity .2s ease;
}
.sv2-save-btn:hover{opacity:.75;}
.sv2-save-btn:focus-visible{outline:2px solid var(--sv2-gold);outline-offset:3px;}

/* ---- shared theme toggle ---- */

.sv2-theme-toggle{
  position:fixed;
  top:16px;
  right:16px;
  z-index:20;
  display:inline-flex;
  gap:2px;
  border:1px solid var(--sv2-gold);
  background:rgba(0,0,0,0.18);
  border-radius:999px;
  padding:3px;
}

.sv2-theme-toggle-btn{
  border:none;
  background:transparent;
  color:var(--sv2-toggle-fg);
  font-family:var(--sv2-font-sans), system-ui, sans-serif;
  font-size:10px;
  letter-spacing:0.06em;
  text-transform:uppercase;
  border-radius:999px;
  padding:7px 12px;
  cursor:pointer;
}

.sv2-theme-toggle-btn.sv2-on{
  background:var(--sv2-gold);
  color:#2c1000;
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

Wires to the app's existing `useAppearance()` hook (`lib/sofra/appearance.ts`) — this hook and its `data-theme` mechanism already exist and are already used by the (currently dormant) light-mode rules in `app/sofra.css`; this is the first place in the codebase that actually renders a control for it. Note the toggle's own root `<div>` must carry the `sv2-root` class itself (not just be nested under one) so its CSS variables resolve, since it's meant to be rendered standalone on a page.

- [ ] **Step 1: Write the failing test**

Create `__tests__/design-preview.test.tsx` with this first test:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeToggle } from '@/components/sofra-v2/ThemeToggle'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

describe('ThemeToggle', () => {
  it('sets data-theme to light when Light is clicked, and back to dark when Dark is clicked', async () => {
    const user = userEvent.setup()
    render(<ThemeToggle />)
    await user.click(screen.getByRole('button', { name: 'Light' }))
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    await user.click(screen.getByRole('button', { name: 'Dark' }))
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/design-preview.test.tsx --verbose`
Expected: FAIL — `Cannot find module '@/components/sofra-v2/ThemeToggle'`

- [ ] **Step 3: Write the component**

```tsx
'use client'

import { useAppearance } from '@/lib/sofra/appearance'

export function ThemeToggle() {
  const [appearance, setAppearance] = useAppearance()

  return (
    <div className="sv2-root sv2-theme-toggle" role="group" aria-label="Appearance">
      <button
        type="button"
        className={appearance === 'dark' ? 'sv2-theme-toggle-btn sv2-on' : 'sv2-theme-toggle-btn'}
        aria-pressed={appearance === 'dark'}
        onClick={() => setAppearance('dark')}
      >
        Dark
      </button>
      <button
        type="button"
        className={appearance === 'light' ? 'sv2-theme-toggle-btn sv2-on' : 'sv2-theme-toggle-btn'}
        aria-pressed={appearance === 'light'}
        onClick={() => setAppearance('light')}
      >
        Light
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/design-preview.test.tsx --verbose`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components/sofra-v2/ThemeToggle.tsx __tests__/design-preview.test.tsx
git commit -m "Add ThemeToggle for design preview, wired to existing appearance system"
```

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

Then append this `describe` block below the existing `PreferencesReceipt` one:

```tsx
describe('design preview routes', () => {
  it('welcome route renders the WelcomeCard and a theme toggle', () => {
    render(<DesignPreviewWelcomePage />)
    expect(screen.getByText('Sofra.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Light' })).toBeInTheDocument()
  })

  it('preferences route renders the PreferencesReceipt and a theme toggle', () => {
    render(<DesignPreviewPreferencesPage />)
    expect(screen.getByText('DEAL BREAKERS')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Light' })).toBeInTheDocument()
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
