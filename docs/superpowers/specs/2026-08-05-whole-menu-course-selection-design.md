# Whole-Menu Course Selection with Deficit-Aware Weighting

**Date:** 2026-08-05
**Status:** Approved, ready for implementation planning
**Supersedes:** `2026-08-05-menu-substitutions-design.md` (substitution system is being removed)

## Overview

Replace the current per-slot-independent course selection with a single whole-menu pass that tracks a running per-guest **coverage deficit** and biases later courses toward guests who have been excluded from earlier ones.

Simultaneously, remove the per-guest substitution system in its entirety (both the rule-based `assignSubstitutions` and all UI/PDF/data model that supported it). Replace the current "safe for X/Y guests" framing with a simpler two-tier model:

- **Allergies** (from `guest.avoid`) — an absolute non-negotiable filter, and the only category that produces a visible per-course callout.
- **Dietary preferences** (from `guest.dietary`, strict subset) — invisible weighting only, expressed through the deficit system.

## Motivation

The current system has three problems:

1. Per-slot-independent selection can starve the same guest across every course when they conflict with the dominant table preference on every slot — nothing pushes later slots to compensate.
2. The substitution system was doing double duty: rescuing preference exclusions (which is a scheduling concern, not a safety concern) and rescuing allergy exclusions (which should never happen — the whole dish should be avoided). Conflating those hid the real allergy risk behind a "we have a substitute" reassurance.
3. The "safe for X/9 guests" framing turned a safety concern into an accounting concern. Chefs read "8/9" as a passing grade rather than "one guest is at risk."

The new model separates those concerns cleanly:

- Allergies are visible, always, and never compensated for by a substitute. The chef sees the risk and handles it manually.
- Preferences are invisible on the plate but drive whole-menu balance so no guest walks away hungry.

## Data model changes

### `lib/intel.ts`

- **Drop** the merged `hardLimits: HardLimit[]` field from `TableIntel`.
- **Add** two separate fields:
  - `allergies: HardLimit[]` — one entry per distinct `guest.avoid` value.
  - `dietPreferences: HardLimit[]` — one entry per distinct strict-diet value from `guest.dietary` (uses the existing `STRICT_DIETS` set).
- `buildIntel` populates both from the same underlying loop over guests; the `type` discriminator on `HardLimit` becomes redundant and is dropped (kind is implied by which array it lives in). Keep the `label` and `guests` fields.
- `buildBrief` updates to read from both new fields.

### `lib/menu.ts`

**Delete:**
- `TRUE_ALLERGENS` constant and `isTrueAllergy` helper — no longer used; allergy vs preference is now determined by which intel array the exclusion came from.
- `Substitution` type and the `substitutions?: Substitution[]` field on `Course`.
- `assignSubstitutions` function.
- The `usedInMenu` / `usedNames` parameters on `deriveCourse` and `deriveMenu` that only existed to dedup substitute dishes across slots. Cross-course dedup of *main* dishes is still needed and stays.

**Change:**
- `Exclusion.kind` is now derived by the caller from which intel array the limit belonged to. `scoreDish` takes the two-array `TableIntel`, iterates `intel.allergies` (emitting `kind: 'allergy'` exclusions) and `intel.dietPreferences` (emitting `kind: 'preference'` exclusions).
- `scoreComposedDish` unchanged in signature; internally follows the same two-array logic.

## Whole-menu selection algorithm (`draftMenu`)

Current `draftMenu` calls `draftCourse` five times independently. Replaced by a single stateful pass that threads a per-guest deficit map through all five slots.

### Algorithm

```
deficit: Map<guest, number> = { g: 0 for g in table }
used_ids:   Set<string> = {}
used_names: Set<string> = {}

for slot in [start, sea, land, green, finish]:
  candidates = signatures matching this slot,
               minus dishes already picked (dedup by id and name)
  if empty, apply the existing fallback tiers (any-affinity, else empty)

  for each candidate c:
    exclusions      = scoreDish(c, intel)
    allergy_hits    = count(e in exclusions where e.kind == 'allergy')
    included_guests = table_guests \ { e.guest for e in exclusions }
    starving_served = count(g in included_guests where deficit[g] >= 2)
    blended         = tableFit(c, intel) + 5 * sum(deficit[g] for g in included_guests)

    priority_tuple  = (
      -allergy_hits,       # Tier 1: safety absolute
       starving_served,    # Tier 2: dominates tableFit
       blended,            # Tier 3: soft graduated score
       slotAffinity(c, slot),
      -alphabetical(c.name),
    )

  pick candidate with lexicographically largest priority_tuple
  add its id/name to used_ids/used_names

  for e in course.exclusions where e.kind == 'preference':
    deficit[e.guest] += 1

  emit Course
```

### Priority tiers explained

- **Tier 1 (`-allergy_hits`):** Safety dominates everything else. A candidate with 0 allergy hits always beats one with any. If every candidate has ≥1 allergy hit (no fully safe option exists — the Q3 edge case), the least-bad still gets picked and the resulting Course carries the callout that the UI renders.
- **Tier 2 (`starving_served`):** Once a guest reaches deficit ≥ 2, any candidate that includes them beats any candidate that excludes them, regardless of the Tier 3 gap. This is the formal guarantee: a starving guest will be served by every subsequent slot whose pool contains at least one dish that includes them. Structural exclusions (a vegetarian in the seafood slot) are still possible when no candidate can include them — that's a catalog gap, not an algorithm failure.
- **Tier 3 (blended):** Standard tableFit + a linear deficit bonus (`5 * sum(deficit)`) for guests included. For guests with deficit 0-1, this is a soft nudge — enough to flip a close decision, not enough to override a clearly-superior tableFit. Threshold of 2 for Tier 2 is intentional: single-slot exclusions are absorbed here; repeated exclusions escalate.
- **Tier 4-5:** slotAffinity and alphabetical name — same tiebreakers as today.

### Coefficient rationale

- Tier 1 uses raw allergy count (with sign flip so fewer is better). It's a separate tier, so no coefficient is needed — any nonzero allergy count is strictly worse than any zero-allergy candidate.
- Tier 3's `5 * deficit` coefficient: `tableFit` values are typically in the range 0-N where N ≈ guest count for the biggest dietary group. Setting the deficit bonus at 5 per deficit point means a guest with deficit 1 contributes 5 — enough to flip a decision where tableFit gaps are small (0-4 points) but preserved for wider gaps. Once deficit reaches 2, Tier 2 takes over entirely, so this coefficient only matters for the deficit=1 case.

### `draftCourse` extension

`draftCourse` is still needed as a standalone entry point (e.g., the "Swap" button in the UI, and as the fallback for AI-rejected slots). It gains an optional `deficit?: Map<string, number>` parameter with default of an empty map. When absent, the function behaves as it does today (no Tier 2 escalation because everyone's deficit is 0). When passed, it applies the full tiered scoring.

### `deriveCourse` / `deriveMenu`

These re-derive persisted courses against live signatures/pantry and are not part of *selection*. They lose:
- The substitution-dedup parameters (`usedInMenu`, `usedNames`).
- The call to `assignSubstitutions`.

They keep everything else — the pantry-composed re-scoring via `componentIds`, source-deleted detection, etc.

## AI path (`lib/menu-ai.ts`)

Single Gemini call (unchanged in shape and cost). The prompt is extended with three new elements.

### Prompt additions

1. **Allergies vs preferences split** — the existing `TRUE ALLERGIES` and `DIET / TASTE PREFERENCES` sections stay, but the guidance updates:
   - Preferences are no longer "handled by per-guest substitutes." They are handled by *whole-menu balance* — pick the 5 courses so every guest is served by at least some of them.
   - Sea/Land are still category-strict (seafood/meat required by the slot), same as today.

2. **The whole-menu scoring model** — plain-language description of the tiered priority:
   > "Track a running deficit per guest across the 5 courses. Each time you pick a dish that excludes a guest (by preference — not by allergy, allergies are non-negotiable), increment that guest's deficit by 1. When picking each subsequent course, prefer dishes that include guests whose deficit has reached 2 or more over any other consideration except safety. For guests with deficit 0 or 1, treat the deficit as a soft nudge — mildly prefer dishes that include them, but you can still absorb a single exclusion in favor of a much better table-fit choice."

3. **Worked example** — one short example inline in the prompt, e.g.:
   > "Example: table has 8 omnivores + 1 vegetarian (Nadia). Start = signature meat dish (Nadia deficit → 1). Sea = seafood-required (Nadia excluded structurally, deficit → 2). Land = meat-required (excluded structurally, deficit → 3). For Green, Nadia is 'starving' — pick a vegetarian option even if a slightly-better-fit meat option exists. For Finish, most desserts are vegetarian by default, so Nadia is naturally included."

### Verification path unchanged in structure, changed in fallback

`verifyAndScore` and the rejection paths (unverifiable, allergy hit, duplicate) stay. When a rejection triggers the rule-based fallback for that slot, the fallback call to `draftCourse` now receives the accumulated deficit map computed from the previously accepted courses — so the rule-based rescue for slot 4 also respects that slots 1-3 excluded Nadia.

The `attachSubs` helper is removed. Courses no longer carry substitutions.

## UI changes

### Menu page — chef view (`app/(chef)/events/[id]/menu/page.tsx`)

**Remove entirely from each course card:**

- The whole bordered box that currently shows the safety banner (`<div style={{ border: ..., borderRadius: 12, padding: '9px 12px', marginTop: 12 }}>` and its children).
- The "✓ Table fit: safe for X/Y guests" text (both the check-mark and no-check-mark variants).
- The "Excludes ..." sub-line inside that box.
- The "Guest alternates" section (dashed-border header + list of substitute rows).
- The red "No substitute available — add a signature that avoids these constraints." line.
- The `excludedGuestsWithSub`, `allExcludedCovered`, and `ok` local variables that fed the removed UI.

**Add — one inline line beneath the "Portion" text, rendered only when `derived.excludes.some(e => e.kind === 'allergy')`:**

Text patterns (choose based on the shape of the allergy exclusions):

- One allergen, one guest: `⚠ Contains nuts — unsafe for Sam`
- One allergen, multiple guests: `⚠ Contains nuts — unsafe for Sam, Priya`
- Multiple allergens: `⚠ Contains nuts (unsafe for Sam) · Contains shellfish (unsafe for Nadia)`

Grouping rule: group exclusions by their `reason` string; within each group, join guest names with `, `; between groups, join with ` · `.

Style: `color: C.gold`, `fontSize: 12`, `marginTop: 8`, `fontFamily: 'system-ui, sans-serif'`, `lineHeight: 1.45`. No border, no background — plain inline text.

**Preference exclusions produce no visible indicator anywhere on the card.** They influence which dish was picked via the deficit system, invisibly.

### Menu PDF (`buildMenuHtml` inside the same file)

**Remove:**

- `.subs` block HTML and all its content (the "Guest alternates" section).
- `.alt` block HTML (the "Alternative required for:" line).
- The associated CSS rules: `.subs`, `.subs-h`, `.sub`, `.sub-g`, `.alt`.

**Add:**

- `.allergy` block HTML, rendered under `.portion`, only when the course has any allergy exclusion.
- CSS: `.allergy{color:#9A7A2B;font-size:12px;margin-top:8px;font-family:system-ui,sans-serif;line-height:1.45;}`
- HTML pattern: `<div class="allergy">⚠ Contains nuts — unsafe for Sam</div>` — same grouping rules as the on-screen line so the two stay in lockstep.

### Table page — chef view (`app/(chef)/events/[id]/table/page.tsx`)

**Remove entirely:**

- The "Substitution plan" card at the bottom of the page and the `perGuest` / `unmet` computations that feed it.
- All references to `Course.substitutions`.

**Split the current "Hard Limits" card into two separate cards, stacked in this order:**

Card A — **Allergies (safety)**
- Border: `rgba(224,119,107,0.35)` (red tint — unchanged from current Hard Limits card).
- Header title: `Allergies — never serve`.
- Header eyebrow (right side): `must not violate` in `C.danger`.
- Each row: `⛔ {label}` on the left, guest names in `C.dim` on the right.
- Empty state: `No allergies on this table.`
- Data source: `intel.allergies`.

Card B — **Dietary preferences (weighting)**
- Border: `rgba(217,161,91,0.35)` (amber tint).
- Header title: `Dietary preferences — invisibly weighted`.
- Header eyebrow: `factored into course choice, not shown on menu` in `C.gold`.
- Each row: `◈ {label}` on the left, guest names on the right.
- Empty state: `No strict diets on this table.`
- Data source: `intel.dietPreferences`.

### Guest event page

Unchanged — currently doesn't render menu content.

## "Swap" button — one-slot re-draft

The "Swap" button in the menu page currently calls `draftCourse` for one slot with the previous source excluded. In the new model, single-slot swap gains deficit awareness:

- Compute the deficit map from the **other four visible courses** (sum preference exclusions across them, ignoring the slot being swapped).
- Pass that deficit into `draftCourse` for the target slot.
- Result: swapping Green while Nadia was excluded from Start/Sea/Land will bias the new Green pick toward including her, exactly as fresh generation would.

This keeps swap behavior consistent with `draftMenu`'s pass and avoids the case where a chef swaps once and drops a starving guest back into structural exclusion.

## Persistence

No schema changes. The `menu_courses` table already carries what we need. The `substitutions` column (if it existed) is not persisted today — substitutions were computed at derive time, so nothing needs migrating out of the database. `component_ids` for pantry-composed courses stays.

## Testing / self-review

After implementation, run this verification pass before declaring the task complete:

1. **Regenerate the demo menu at least 3 times** (rule-based path and AI path separately).
2. **For each run, produce a course-by-course trace** showing:
   - Slot and picked dish.
   - Guests excluded from this course by preference.
   - Running deficit state after this course.
   - How the deficit state influenced the next course's pick (concrete: "Nadia deficit=3 promoted the vegetarian Green option over the meat one despite lower tableFit").
3. **Confirm the allergy callout appears only for allergies:** run a scenario with a mixed table (one nut-allergic guest + one vegetarian) and verify the vegetarian gets no per-course callout while the nut-allergic guest does, both in the UI and the PDF.
4. **Confirm no "safe for X/Y" or substitute language remains anywhere:** grep the source for `safe for`, `Guest alternates`, `alternate`, `substitute`, `substitution`, `assignSubstitutions`. All should be removed from UI, PDF, and any user-facing string.
5. **Structural exclusion sanity check:** run a scenario where the only vegetarian is on the table and the pantry has no vegetarian seafood/meat option. Verify Sea and Land still pick real dishes (structural), and Green + Finish successfully catch her up.

## Out of scope

- No changes to guest RSVP UI (`avoid` vs `dietary` field split already exists there).
- No changes to signature/pantry data model.
- No changes to the AI prompt beyond the three additions described.
- No new database columns or migrations.
