# Taste Profile: Protein Preference + Flavor Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two new taste-profile fields — `protein_preference` (single-select) and `flavor_profile` (multi-select, capped at 2) — end to end: DB column, RSVP form, table-intel aggregation, chef table view, and the Gemini menu-generation prompt.

**Architecture:** New nullable/defaulted columns on `taste_profiles`. `TasteProfile` (lib/intel.ts) gains `proteinPreference?: string | null` and `flavorProfile?: string[]` as **optional** fields (not required) so the 9 existing raw `TasteProfile` literals in `__tests__/menu.test.ts` — which test unrelated allergy/diet logic in `lib/menu.ts` — keep compiling unchanged. `buildIntel` defaults missing values (`?? null` / `?? []`) exactly like it already does for other optional-ish guest data. `TableIntel` gains `proteinCounts` and `flavorCounts` (grouped counts, same shape as `dietMix`/`drinksCounts`), and the generated `brief` gets an extra clause when either has a clear majority (>50% of guests). Both RSVP page and table page thread the two new fields through their existing prefill/upsert/merge code paths without changing their shape. The Gemini prompt in `lib/menu-ai.ts` gets two new lines in the existing GUEST INTEL block.

**Tech Stack:** Next.js 14 (App Router), Supabase (Postgres), Jest + Testing Library, Gemini via `@google/genai`.

---

## Design decisions locked in during planning

- **Flavor cap-at-2 behavior:** on a 3rd tap, show a transient "Pick up to 2" hint (2s, `setTimeout`) rather than silently replacing the oldest pick — reuses the exact transient-message pattern already in this codebase (`swapNoOptions` in `app/(chef)/events/[id]/menu/page.tsx`), so it's the less-jarring, most idiomatic choice here.
- **Protein preference chip behavior:** true radio semantics — clicking a chip sets it, clicking a different chip replaces it. There's no "deselect down to null" gesture; guests use the explicit "No preference" option for that, matching how HTML radio groups behave.
- **"Clear majority" for the brief:** a protein or flavor label counts as dominant when its count is strictly greater than half of `guestCount` (`count > guestCount / 2`). "No preference" is never announced as a protein lean.
- **Migration execution:** per user's choice, I write the SQL file; the user applies it via their usual method (Supabase Studio SQL editor) and confirms; I then verify the round-trip and Gemini-prompt interpolation.

---

## Task 1: Add chip option constants to theme

**Files:**
- Modify: `lib/theme.ts:37-39`

- [ ] **Step 1: Add the two new constants**

Append after the existing `DRINKS` line in `lib/theme.ts`:

```ts
export const PROTEIN_PREFERENCE = ['Red meat', 'Poultry', 'Seafood', 'Plant-forward', 'No preference']
export const FLAVOR_PROFILE = ['Bright & acidic', 'Rich & savory', 'Spiced & bold', 'Clean & simple']
```

- [ ] **Step 2: Commit**

```bash
git add lib/theme.ts
git commit -m "feat: add protein preference and flavor profile chip options"
```

---

## Task 2: Migration — add columns to taste_profiles

**Files:**
- Create: `supabase/migrations/20260804000001_add_protein_flavor_to_taste_profiles.sql`

- [ ] **Step 1: Write the migration file**

```sql
alter table public.taste_profiles
  add column protein_preference text,
  add column flavor_profile     text[] not null default '{}';
```

No RLS policy changes — RLS is already disabled on `taste_profiles` for this MVP (see `20260728000005_disable_rls_mvp.sql`), so no `alter policy` / `create policy` statements are needed.

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260804000001_add_protein_flavor_to_taste_profiles.sql
git commit -m "feat: add protein_preference and flavor_profile columns to taste_profiles"
```

- [ ] **Step 3: Hand off to user for execution**

Tell the user the migration file is ready at `supabase/migrations/20260804000001_add_protein_flavor_to_taste_profiles.sql` and ask them to run it against the live database (their usual method — Supabase Studio SQL editor) and confirm back before continuing to the manual verification at the end of this plan. Implementation of Tasks 3-7 does not require the migration to be live yet (they're pure code/tests), so proceed with those while waiting if useful.

---

## Task 3: lib/intel.ts — types + aggregation + brief

**Files:**
- Modify: `lib/intel.ts`
- Test: `__tests__/intel.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `__tests__/intel.test.ts` (the `guest` factory already supports arbitrary overrides via `Partial<TasteProfile>`, so no factory change is needed — just pass `proteinPreference`/`flavorProfile` directly in the tests that need them):

```ts
  test('proteinCounts groups guest protein preferences, sorted descending', () => {
    const intel = buildIntel([
      guest({ name: 'A', proteinPreference: 'Seafood' }),
      guest({ name: 'B', proteinPreference: 'Seafood' }),
      guest({ name: 'C', proteinPreference: 'Poultry' }),
    ])
    expect(intel.proteinCounts[0]).toEqual({ label: 'Seafood', count: 2 })
    expect(intel.proteinCounts[1]).toEqual({ label: 'Poultry', count: 1 })
  })

  test('proteinCounts omits guests with no protein preference set', () => {
    const intel = buildIntel([guest({ name: 'A' })])
    expect(intel.proteinCounts).toEqual([])
  })

  test('flavorCounts counts each guest once per selected flavor, sorted descending', () => {
    const intel = buildIntel([
      guest({ name: 'A', flavorProfile: ['Bright & acidic', 'Rich & savory'] }),
      guest({ name: 'B', flavorProfile: ['Bright & acidic'] }),
    ])
    expect(intel.flavorCounts[0]).toEqual({ label: 'Bright & acidic', count: 2 })
    expect(intel.flavorCounts.find(f => f.label === 'Rich & savory')).toEqual({ label: 'Rich & savory', count: 1 })
  })

  test('brief mentions dominant protein lean when >50% of guests share it', () => {
    const intel = buildIntel([
      guest({ name: 'A', proteinPreference: 'Seafood' }),
      guest({ name: 'B', proteinPreference: 'Seafood' }),
      guest({ name: 'C', proteinPreference: 'Poultry' }),
    ])
    expect(intel.brief).toContain('seafood-forward')
  })

  test('brief does not mention a protein lean when no majority exists', () => {
    const intel = buildIntel([
      guest({ name: 'A', proteinPreference: 'Seafood' }),
      guest({ name: 'B', proteinPreference: 'Poultry' }),
    ])
    expect(intel.brief).not.toContain('-forward')
  })

  test('brief never announces "No preference" as a protein lean', () => {
    const intel = buildIntel([
      guest({ name: 'A', proteinPreference: 'No preference' }),
      guest({ name: 'B', proteinPreference: 'No preference' }),
      guest({ name: 'C', proteinPreference: 'No preference' }),
    ])
    expect(intel.brief).not.toContain('-forward')
  })

  test('brief mentions dominant flavor lean when >50% of guests share it', () => {
    const intel = buildIntel([
      guest({ name: 'A', flavorProfile: ['Bright & acidic'] }),
      guest({ name: 'B', flavorProfile: ['Bright & acidic'] }),
      guest({ name: 'C', flavorProfile: ['Rich & savory'] }),
    ])
    expect(intel.brief).toContain('bright, acidic flavors')
  })

  test('brief combines protein and flavor lean when both are dominant', () => {
    const intel = buildIntel([
      guest({ name: 'A', proteinPreference: 'Seafood', flavorProfile: ['Bright & acidic'] }),
      guest({ name: 'B', proteinPreference: 'Seafood', flavorProfile: ['Bright & acidic'] }),
    ])
    expect(intel.brief).toContain('leans seafood-forward with bright, acidic flavors')
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/intel.test.ts`
Expected: FAIL — `intel.proteinCounts` / `intel.flavorCounts` are `undefined`, and the brief-content assertions fail since neither field nor lean logic exists yet.

- [ ] **Step 3: Implement the type + aggregation + brief changes**

In `lib/intel.ts`, update `TasteProfile`:

```ts
export type TasteProfile = {
  name: string
  dietary: string[]
  avoid: string[]
  drinks: string[]
  proteinPreference?: string | null
  flavorProfile?: string[]
  adventurousness: number
}
```

Update `TableIntel`:

```ts
export type TableIntel = {
  hardLimits: HardLimit[]
  dietMix: { label: string; count: number }[]
  drinksCounts: { label: string; count: number }[]
  proteinCounts: { label: string; count: number }[]
  flavorCounts: { label: string; count: number }[]
  avgAdventurousness: number
  adventurousnessLabel: 'cautious' | 'balanced' | 'adventurous' | 'daring'
  brief: string
  guestCount: number
}
```

Add the lean-phrase maps near `STRICT_DIET_LIST`:

```ts
const PROTEIN_LEAN_PHRASE: Record<string, string> = {
  'Red meat': 'red meat-forward',
  'Poultry': 'poultry-forward',
  'Seafood': 'seafood-forward',
  'Plant-forward': 'plant-forward',
}

const FLAVOR_LEAN_PHRASE: Record<string, string> = {
  'Bright & acidic': 'bright, acidic flavors',
  'Rich & savory': 'rich, savory flavors',
  'Spiced & bold': 'spiced, bold flavors',
  'Clean & simple': 'clean, simple flavors',
}
```

Update the empty-guest-list early return in `buildIntel`:

```ts
  if (guests.length === 0) {
    return {
      hardLimits: [], dietMix: [], drinksCounts: [], proteinCounts: [], flavorCounts: [],
      avgAdventurousness: 0,
      adventurousnessLabel: 'cautious',
      brief: 'No guest data yet.', guestCount: 0,
    }
  }
```

Add the aggregation block right after the existing `drinksCounts` block in `buildIntel`:

```ts
  // proteinCounts — descending; guests with no preference are omitted
  const proteinMap = new Map<string, number>()
  for (const g of guests) {
    if (!g.proteinPreference) continue
    proteinMap.set(g.proteinPreference, (proteinMap.get(g.proteinPreference) ?? 0) + 1)
  }
  const proteinCounts = Array.from(proteinMap.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)

  // flavorCounts — descending; each guest can contribute up to 2 flavors
  const flavorMap = new Map<string, number>()
  for (const g of guests) {
    for (const f of g.flavorProfile ?? []) {
      flavorMap.set(f, (flavorMap.get(f) ?? 0) + 1)
    }
  }
  const flavorCounts = Array.from(flavorMap.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
```

Update the `buildBrief` call site and return statement:

```ts
  const brief = buildBrief(
    guests.length, hardLimits, drinksCounts, proteinCounts, flavorCounts, avgAdventurousness, adventurousnessLabel
  )

  return {
    hardLimits, dietMix, drinksCounts, proteinCounts, flavorCounts,
    avgAdventurousness, adventurousnessLabel,
    brief, guestCount: guests.length,
  }
```

Update `buildBrief`'s signature and body to add the lean clause between the drinks-dominant part and the final adventurousness part:

```ts
function buildBrief(
  guestCount: number,
  hardLimits: HardLimit[],
  drinksCounts: { label: string; count: number }[],
  proteinCounts: { label: string; count: number }[],
  flavorCounts: { label: string; count: number }[],
  avg: number,
  label: TableIntel['adventurousnessLabel']
): string {
  const parts: string[] = []

  const diets = hardLimits.filter(h => h.type === 'diet')
  if (diets.length > 0) {
    parts.push(diets.map(h => `${h.guests.length} ${h.label.toLowerCase()}`).join(', '))
  }

  const allergies = hardLimits.filter(h => h.type === 'allergy')
  if (allergies.length > 0) {
    const uniqueGuests = Array.from(new Set(allergies.flatMap(h => h.guests)))
    const labels = allergies.map(h => h.label.toLowerCase())
    const labelStr = labels.length === 1
      ? labels[0]
      : labels.slice(0, -1).join(', ') + ' & ' + labels[labels.length - 1]
    parts.push(`${labelStr} off-limits across ${uniqueGuests.length} guest${uniqueGuests.length !== 1 ? 's' : ''}`)
  }

  if (hardLimits.length === 0) parts.push('no hard limits')

  if (drinksCounts.length > 0) {
    parts.push(`${drinksCounts[0].label.toLowerCase()} dominant`)
  }

  const lean = leanPart(proteinCounts, flavorCounts, guestCount)
  if (lean) parts.push(lean)

  parts.push(`${label} table (avg ${avg})`)

  return `${guestCount} guest${guestCount !== 1 ? 's' : ''} — ${parts.join(', ')}.`
}

function leanPart(
  proteinCounts: { label: string; count: number }[],
  flavorCounts: { label: string; count: number }[],
  guestCount: number
): string | null {
  const topProtein = proteinCounts[0]
  const proteinLean =
    topProtein && topProtein.label !== 'No preference' && topProtein.count > guestCount / 2
      ? PROTEIN_LEAN_PHRASE[topProtein.label] ?? topProtein.label.toLowerCase()
      : null

  const topFlavor = flavorCounts[0]
  const flavorLean =
    topFlavor && topFlavor.count > guestCount / 2
      ? FLAVOR_LEAN_PHRASE[topFlavor.label] ?? topFlavor.label.toLowerCase()
      : null

  if (proteinLean && flavorLean) return `leans ${proteinLean} with ${flavorLean}`
  if (proteinLean) return `leans ${proteinLean}`
  if (flavorLean) return `leans toward ${flavorLean}`
  return null
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest __tests__/intel.test.ts`
Expected: PASS (all tests, including the pre-existing ones — check the full file, not just the new tests, since `buildBrief`'s signature and part ordering changed).

- [ ] **Step 5: Commit**

```bash
git add lib/intel.ts __tests__/intel.test.ts
git commit -m "feat: aggregate protein preference and flavor profile into table intel"
```

---

## Task 4: RSVP page — protein preference + flavor profile sections

**Files:**
- Modify: `app/(guest)/events/[id]/rsvp/page.tsx`
- Test: `__tests__/rsvp-page.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add to `__tests__/rsvp-page.test.tsx`, inside (or alongside) the existing `describe('Step 2 — chip groups', ...)` block:

```ts
  it('renders all protein preference chips', async () => {
    await navigateToStep2()
    for (const chip of ['Red meat', 'Poultry', 'Seafood', 'Plant-forward', 'No preference']) {
      expect(screen.getByRole('button', { name: chip })).toBeInTheDocument()
    }
  })

  it('renders all flavor profile chips', async () => {
    await navigateToStep2()
    for (const chip of ['Bright & acidic', 'Rich & savory', 'Spiced & bold', 'Clean & simple']) {
      expect(screen.getByRole('button', { name: chip })).toBeInTheDocument()
    }
  })

  it('protein preference is single-select: choosing one deselects the other', async () => {
    await navigateToStep2()
    await userEvent.click(screen.getByRole('button', { name: 'Seafood' }))
    expect(screen.getByRole('button', { name: 'Seafood' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Poultry' }))
    expect(screen.getByRole('button', { name: 'Poultry' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Seafood' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('flavor profile is multi-select up to 2', async () => {
    await navigateToStep2()
    await userEvent.click(screen.getByRole('button', { name: 'Bright & acidic' }))
    await userEvent.click(screen.getByRole('button', { name: 'Rich & savory' }))
    expect(screen.getByRole('button', { name: 'Bright & acidic' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Rich & savory' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('tapping a 3rd flavor does not select it and shows a "pick up to 2" hint', async () => {
    await navigateToStep2()
    await userEvent.click(screen.getByRole('button', { name: 'Bright & acidic' }))
    await userEvent.click(screen.getByRole('button', { name: 'Rich & savory' }))
    await userEvent.click(screen.getByRole('button', { name: 'Spiced & bold' }))
    expect(screen.getByRole('button', { name: 'Spiced & bold' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Bright & acidic' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Rich & savory' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('flavor-hint')).toBeInTheDocument()
  })

  it('deselecting a flavor and selecting a 3rd works normally', async () => {
    await navigateToStep2()
    await userEvent.click(screen.getByRole('button', { name: 'Bright & acidic' }))
    await userEvent.click(screen.getByRole('button', { name: 'Rich & savory' }))
    await userEvent.click(screen.getByRole('button', { name: 'Bright & acidic' })) // deselect
    await userEvent.click(screen.getByRole('button', { name: 'Spiced & bold' }))
    expect(screen.getByRole('button', { name: 'Bright & acidic' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Rich & savory' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Spiced & bold' })).toHaveAttribute('aria-pressed', 'true')
  })
```

Add to `describe('prefill from existing data', ...)`:

```ts
  it('prefills protein preference and flavor profile from an existing taste_profiles row', async () => {
    makeSupabase({
      profileRow: {
        user_id: 'uid-1', dietary: [], avoid: [], drinks: [], adventurousness: 50,
        protein_preference: 'Seafood', flavor_profile: ['Bright & acidic', 'Rich & savory'],
      },
    })
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /going/i }))
    await userEvent.click(screen.getByRole('button', { name: /going/i }))
    await userEvent.click(screen.getByRole('button', { name: /continue/i }))
    expect(screen.getByRole('button', { name: 'Seafood' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Bright & acidic' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Rich & savory' })).toHaveAttribute('aria-pressed', 'true')
  })
```

Add to `describe('going/maybe submit', ...)`:

```ts
  it('includes protein_preference and flavor_profile in the taste_profiles upsert', async () => {
    const sb = makeSupabase()
    render(<RSVPPage params={{ id: 'event-1' }} />)
    await waitFor(() => screen.getByRole('button', { name: /going/i }))
    await userEvent.click(screen.getByRole('button', { name: /going/i }))
    await userEvent.click(screen.getByRole('button', { name: /continue/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Seafood' }))
    await userEvent.click(screen.getByRole('button', { name: 'Bright & acidic' }))
    await userEvent.click(screen.getByRole('button', { name: /rsvp/i }))
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/events/event-1'))
    expect(sb.profileUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        protein_preference: 'Seafood', flavor_profile: ['Bright & acidic'],
      }),
      { onConflict: 'user_id' }
    )
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/rsvp-page.test.tsx`
Expected: FAIL — the new chips, state, and upsert fields don't exist yet.

- [ ] **Step 3: Implement the RSVP page changes**

In `app/(guest)/events/[id]/rsvp/page.tsx`:

Update the import line:

```ts
import { C, THEMES, DIETARY, NOGOS, DRINKS, PROTEIN_PREFERENCE, FLAVOR_PROFILE } from '@/lib/theme'
```

Add state after the existing `drinks` state:

```ts
  const [proteinPreference, setProteinPreference] = useState<string | null>(null)
  const [flavorProfile, setFlavorProfile] = useState<string[]>([])
  const [flavorHint, setFlavorHint] = useState(false)
```

In `loadData()`, inside the `if (profileRow) { ... }` block, add after the existing `setDrinks` line:

```ts
        setProteinPreference((p.protein_preference as string | null) ?? null)
        setFlavorProfile((p.flavor_profile as string[]) ?? [])
```

In `handleProfileSubmit()`, add to the `taste_profiles` upsert object, after `drinks,`:

```ts
          protein_preference: proteinPreference,
          flavor_profile: flavorProfile,
```

Add a `toggleFlavor` function next to the existing `toggleChip`:

```ts
  function toggleFlavor(value: string) {
    if (flavorProfile.includes(value)) {
      setFlavorProfile(flavorProfile.filter((v) => v !== value))
      return
    }
    if (flavorProfile.length >= 2) {
      setFlavorHint(true)
      setTimeout(() => setFlavorHint(false), 2000)
      return
    }
    setFlavorProfile([...flavorProfile, value])
  }
```

In the JSX, between the drinks chip block and `<SubLabel>How brave is your palate?</SubLabel>`, insert:

```tsx
                  <SubLabel>Protein preference</SubLabel>
                  <div style={chipWrap}>
                    {PROTEIN_PREFERENCE.map((it) => (
                      <button
                        key={it}
                        className="chip"
                        aria-pressed={proteinPreference === it}
                        onClick={() => setProteinPreference(it)}
                        style={chipClass(proteinPreference === it)}
                      >
                        {it}
                      </button>
                    ))}
                  </div>

                  <SubLabel>Flavor profile</SubLabel>
                  <div style={chipWrap}>
                    {FLAVOR_PROFILE.map((it) => (
                      <button
                        key={it}
                        className="chip"
                        aria-pressed={flavorProfile.includes(it)}
                        onClick={() => toggleFlavor(it)}
                        style={chipClass(flavorProfile.includes(it))}
                      >
                        {it}
                      </button>
                    ))}
                  </div>
                  {flavorHint && (
                    <p
                      data-testid="flavor-hint"
                      style={{
                        color: C.gold,
                        fontSize: 12,
                        marginTop: 6,
                        fontFamily: 'system-ui, sans-serif',
                      }}
                    >
                      Pick up to 2
                    </p>
                  )}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest __tests__/rsvp-page.test.tsx`
Expected: PASS (full file — verify no pre-existing test regressed, since `chipWrap`/`chipClass`/`SubLabel` are being reused, not modified).

- [ ] **Step 5: Commit**

```bash
git add "app/(guest)/events/[id]/rsvp/page.tsx" __tests__/rsvp-page.test.tsx
git commit -m "feat: add protein preference and flavor profile to RSVP step 2"
```

---

## Task 5: Table page — Protein Preference + Flavor Profile sections

**Files:**
- Modify: `app/(chef)/events/[id]/table/page.tsx`
- Test: `__tests__/table-page.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `__tests__/table-page.test.tsx`, update the `ProfileRow` type to include the new optional-in-practice DB fields (tests that don't need them simply omit them from their literals, same as today):

```ts
type ProfileRow = {
  user_id: string
  dietary: string[]
  avoid: string[]
  drinks: string[]
  adventurousness: number
  protein_preference?: string | null
  flavor_profile?: string[]
}
```

Add a new describe block after `describe('Drinks section', ...)`:

```ts
// ─── Protein Preference ──────────────────────────────────────────────────────

describe('Protein Preference section', () => {
  it('renders "Protein Preference" heading', async () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    makeSupabase()
    render(<TablePage params={PARAMS} />)
    await waitFor(() =>
      expect(screen.getByText(/protein preference/i)).toBeInTheDocument()
    )
  })

  it('shows a protein label when a guest has one', async () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    makeSupabase({
      rsvps:    [{ user_id: GUEST_UID, users: { name: 'Leo' } }],
      profiles: [{ user_id: GUEST_UID, dietary: [], avoid: [], drinks: [], adventurousness: 50, protein_preference: 'Seafood', flavor_profile: [] }],
    })
    render(<TablePage params={PARAMS} />)
    await waitFor(() => expect(screen.getByText('Seafood')).toBeInTheDocument())
  })

  it('shows empty-state text when no protein preferences present', async () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    makeSupabase()
    render(<TablePage params={PARAMS} />)
    await waitFor(() =>
      expect(screen.getByText(/no protein preferences/i)).toBeInTheDocument()
    )
  })
})

// ─── Flavor Profile ───────────────────────────────────────────────────────────

describe('Flavor Profile section', () => {
  it('renders "Flavor Profile" heading', async () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    makeSupabase()
    render(<TablePage params={PARAMS} />)
    await waitFor(() =>
      expect(screen.getByText(/flavor profile/i)).toBeInTheDocument()
    )
  })

  it('shows a flavor label when a guest has one', async () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    makeSupabase({
      rsvps:    [{ user_id: GUEST_UID, users: { name: 'Mia' } }],
      profiles: [{ user_id: GUEST_UID, dietary: [], avoid: [], drinks: [], adventurousness: 50, protein_preference: null, flavor_profile: ['Bright & acidic'] }],
    })
    render(<TablePage params={PARAMS} />)
    await waitFor(() => expect(screen.getByText('Bright & acidic')).toBeInTheDocument())
  })

  it('shows empty-state text when no flavor preferences present', async () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    makeSupabase()
    render(<TablePage params={PARAMS} />)
    await waitFor(() =>
      expect(screen.getByText(/no flavor preferences/i)).toBeInTheDocument()
    )
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/table-page.test.tsx`
Expected: FAIL — no "Protein Preference" / "Flavor Profile" headings exist yet, and `mergeGuests` doesn't read the new columns.

- [ ] **Step 3: Implement the table page changes**

In `app/(chef)/events/[id]/table/page.tsx`, update `ProfileRow`:

```ts
type ProfileRow = {
  user_id: string
  dietary: string[]
  avoid: string[]
  drinks: string[]
  protein_preference: string | null
  flavor_profile: string[]
  adventurousness: number
}
```

Update `mergeGuests`:

```ts
function mergeGuests(rsvps: RsvpRow[], profiles: ProfileRow[]): TasteProfile[] {
  return rsvps.map((r) => {
    const p = profiles.find((x) => x.user_id === r.user_id)
    return {
      name: r.users?.name ?? 'Unknown',
      dietary: p?.dietary ?? [],
      avoid: p?.avoid ?? [],
      drinks: p?.drinks ?? [],
      proteinPreference: p?.protein_preference ?? null,
      flavorProfile: p?.flavor_profile ?? [],
      adventurousness: p?.adventurousness ?? 50,
    }
  })
}
```

Insert a new grid section right after the existing Diet Mix + Drinks grid `</div>` and before the `{/* Adventurousness */}` comment:

```tsx
            {/* Protein preference + flavor profile grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div style={card}>
                <div style={cardTitle}>Protein Preference</div>
                <div style={{ marginTop: 12 }}>
                  {intel.proteinCounts.length === 0 ? (
                    <div
                      style={{
                        color: C.faint,
                        fontSize: 13,
                        fontFamily: 'system-ui, sans-serif',
                      }}
                    >
                      No protein preferences on record
                    </div>
                  ) : (
                    intel.proteinCounts.map((d) => (
                      <Bar
                        key={d.label}
                        label={d.label}
                        n={d.count}
                        total={intel.guestCount}
                        tint={C.sage}
                      />
                    ))
                  )}
                </div>
              </div>
              <div style={card}>
                <div style={cardTitle}>Flavor Profile</div>
                <div style={{ marginTop: 12 }}>
                  {intel.flavorCounts.length === 0 ? (
                    <div
                      style={{
                        color: C.faint,
                        fontSize: 13,
                        fontFamily: 'system-ui, sans-serif',
                      }}
                    >
                      No flavor preferences on record
                    </div>
                  ) : (
                    intel.flavorCounts.map((d) => (
                      <Bar
                        key={d.label}
                        label={d.label}
                        n={d.count}
                        total={intel.guestCount}
                        tint={C.gold}
                      />
                    ))
                  )}
                </div>
              </div>
            </div>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest __tests__/table-page.test.tsx`
Expected: PASS (full file).

- [ ] **Step 5: Commit**

```bash
git add "app/(chef)/events/[id]/table/page.tsx" __tests__/table-page.test.tsx
git commit -m "feat: render Protein Preference and Flavor Profile on the chef table view"
```

---

## Task 6: Menu page — thread new fields through mergeGuests

**Files:**
- Modify: `app/(chef)/events/[id]/menu/page.tsx:105-125,209-219`

This page independently builds `TasteProfile` guests (for `buildIntel` and the AI/rule-based menu draft) via its own local `mergeGuests`, and separately types the `profiles` query result inline. It has no dedicated test file today (only `lib/menu.ts` and `lib/menu-html` are tested at the unit level for this area), so this task is a direct code change, not TDD.

- [ ] **Step 1: Update `mergeGuests`' parameter type and body**

```ts
function mergeGuests(
  rsvps: Array<{ user_id: string; users: { name: string } | null }>,
  profiles: Array<{
    user_id: string
    dietary: string[]
    avoid: string[]
    drinks: string[]
    protein_preference: string | null
    flavor_profile: string[]
    adventurousness: number
  }>
): TasteProfile[] {
  return rsvps.map((r) => {
    const p = profiles.find((x) => x.user_id === r.user_id)
    return {
      name: r.users?.name ?? 'Unknown',
      dietary: p?.dietary ?? [],
      avoid: p?.avoid ?? [],
      drinks: p?.drinks ?? [],
      proteinPreference: p?.protein_preference ?? null,
      flavorProfile: p?.flavor_profile ?? [],
      adventurousness: p?.adventurousness ?? 50,
    }
  })
}
```

- [ ] **Step 2: Update the inline fallback-data type in `loadAll()`**

The `profiles` fallback (used when `userIds.length === 0`) has an inline type literal that must match the new `mergeGuests` parameter type:

```ts
      const { data: profiles } = userIds.length
        ? await supabase.from('taste_profiles').select('*').in('user_id', userIds)
        : {
            data: [] as Array<{
              user_id: string
              dietary: string[]
              avoid: string[]
              drinks: string[]
              protein_preference: string | null
              flavor_profile: string[]
              adventurousness: number
            }>,
          }
```

Note: the `supabase.from('taste_profiles').select('*')` branch already returns all columns (including the two new ones) with no code change needed — only the fallback empty-array branch and the `mergeGuests` type need updating.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors introduced by this file (pre-existing unrelated errors, if any, are out of scope).

- [ ] **Step 4: Commit**

```bash
git add "app/(chef)/events/[id]/menu/page.tsx"
git commit -m "feat: thread protein preference and flavor profile through menu page guest merge"
```

---

## Task 7: Gemini prompt — include protein/flavor breakdowns

**Files:**
- Modify: `lib/menu-ai.ts:37-127`
- Test: `__tests__/menu-ai.test.ts` (new file)

- [ ] **Step 1: Write the failing test**

Create `__tests__/menu-ai.test.ts`. This mocks `server-only` (so importing a server-only module works under Jest's jsdom environment) and mocks `@/lib/gemini` so no real network call happens, then asserts on the literal prompt string passed to `callGeminiJson` — this directly proves the new intel fields are interpolated into the prompt, not just present on the `TableIntel` object and unused.

```ts
jest.mock('server-only', () => ({}))
jest.mock('@/lib/gemini', () => ({
  callGeminiJson: jest.fn(),
}))

import { generateMenuWithAI } from '@/lib/menu-ai'
import { callGeminiJson } from '@/lib/gemini'
import { buildIntel } from '@/lib/intel'

describe('buildAIPrompt (via generateMenuWithAI)', () => {
  it('interpolates protein preference and flavor profile breakdowns into the prompt', async () => {
    ;(callGeminiJson as jest.Mock).mockResolvedValue({ courses: [] })

    const intel = buildIntel([
      { name: 'A', dietary: [], avoid: [], drinks: [], proteinPreference: 'Seafood', flavorProfile: ['Bright & acidic'], adventurousness: 50 },
      { name: 'B', dietary: [], avoid: [], drinks: [], proteinPreference: 'Seafood', flavorProfile: ['Bright & acidic', 'Rich & savory'], adventurousness: 50 },
    ])

    await generateMenuWithAI(intel, [], [])

    expect(callGeminiJson).toHaveBeenCalledTimes(1)
    const prompt = (callGeminiJson as jest.Mock).mock.calls[0][0] as string
    expect(prompt).toContain('Protein preference split: Seafood=2')
    expect(prompt).toContain('Flavor profile split: Bright & acidic=2, Rich & savory=1')
  })

  it('falls back to "none" for both splits when no guest has set them', async () => {
    ;(callGeminiJson as jest.Mock).mockResolvedValue({ courses: [] })

    const intel = buildIntel([
      { name: 'A', dietary: [], avoid: [], drinks: [], adventurousness: 50 },
    ])

    await generateMenuWithAI(intel, [], [])

    const prompt = (callGeminiJson as jest.Mock).mock.calls[0][0] as string
    expect(prompt).toContain('Protein preference split: none')
    expect(prompt).toContain('Flavor profile split: none')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/menu-ai.test.ts`
Expected: FAIL — the prompt does not yet contain "Protein preference split" or "Flavor profile split".

- [ ] **Step 3: Implement the prompt changes**

In `lib/menu-ai.ts`, inside `buildAIPrompt`, add after the existing `const drinks = ...` block:

```ts
  const proteinCounts = intel.proteinCounts.length
    ? intel.proteinCounts.map(d => `${d.label}=${d.count}`).join(', ')
    : 'none'

  const flavorCounts = intel.flavorCounts.length
    ? intel.flavorCounts.map(d => `${d.label}=${d.count}`).join(', ')
    : 'none'
```

In the template string's `GUEST INTEL:` block, add two lines right after `- Drinks split: ${drinks}`:

```
- Drinks split: ${drinks}
- Protein preference split: ${proteinCounts}
- Flavor profile split: ${flavorCounts}
- Table adventurousness: ${intel.avgAdventurousness}/100 (${intel.adventurousnessLabel})
```

(i.e. insert the two new lines between the existing `Drinks split` and `Table adventurousness` lines.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/menu-ai.test.ts`
Expected: PASS.

- [ ] **Step 5: Manually grep-verify the interpolation (per user's explicit self-review ask)**

Run: `grep -n "proteinCounts\|flavorCounts" lib/menu-ai.ts`
Expected: shows both the `const proteinCounts = intel.proteinCounts...` / `const flavorCounts = intel.flavorCounts...` declarations AND their `${proteinCounts}` / `${flavorCounts}` usages inside the template literal — confirming the fields are read from `intel` and actually interpolated into the string sent to Gemini, not merely declared and discarded.

- [ ] **Step 6: Commit**

```bash
git add lib/menu-ai.ts __tests__/menu-ai.test.ts
git commit -m "feat: include protein preference and flavor profile in the Gemini menu prompt"
```

---

## Task 8: Full test suite + typecheck

**Files:** none (verification only)

- [ ] **Step 1: Run the full Jest suite**

Run: `npx jest`
Expected: all suites pass, including every file touched above and every pre-existing suite (`menu.test.ts`, `menu-html.test.ts`, `events-page.test.tsx`, `host-new-page.test.tsx`, `event-detail-page.test.tsx`).

- [ ] **Step 2: Typecheck the whole project**

Run: `npx tsc --noEmit`
Expected: no new type errors.

- [ ] **Step 3: Commit if anything was left uncommitted**

Only if Steps 1-2 required fixes:

```bash
git add -A
git commit -m "fix: address test/type issues from protein preference and flavor profile work"
```

---

## Manual verification (post-implementation, requires the live migration)

These steps cannot be automated as Jest tests because they require a live Supabase database and a running browser session — do them after the user confirms the migration (Task 2, Step 3) has been applied:

1. **Migration ran clean:** ask the user to confirm the `alter table` succeeded with no errors, or query `information_schema.columns` for `taste_profiles` to confirm `protein_preference` and `flavor_profile` exist with the right types/defaults.
2. **Round-trip prefill:** start the dev server (`npm run dev`), open the RSVP flow for a real event/guest, select a protein preference and 2 flavors, submit, then reload the RSVP page for the same guest and confirm both fields prefill correctly (chips show `aria-pressed="true"` for the saved values) — this is the live-DB equivalent of the Task 4 prefill test, run against the actual Postgres row instead of a mock.
3. **Cap-at-2 in the real UI:** in that same session, try tapping a 3rd flavor chip and confirm the "Pick up to 2" hint appears and the 3rd selection is rejected (not just in the unit test, in the actual rendered page).
4. **Table page:** open `/events/[id]/table` as the host for an event with guests who set these fields, confirm the "Protein Preference" and "Flavor Profile" bar sections render real counts.
5. **Gemini prompt end-to-end:** trigger "Regenerate with AI" on the menu page for that event and, if feasible, log or inspect the outgoing prompt (e.g. temporarily log `buildAIPrompt`'s output, or rely on the Task 7 unit test as the durable proof) to confirm the live `intel.proteinCounts`/`flavorCounts` produced by real guest data appear in the request sent to Gemini.
