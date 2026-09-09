# Kitchen Inventory Sleekness, Setup Persistence, and Preferences Design

## Overview

Six related changes, grouped into one design because most touch the same file
(`app/(chef)/kitchen/page.tsx`) and were scoped together in conversation:

1. Sleek multi-item staging for custom dishes/ingredients (no per-item submit button).
2. Kitchen setup buttons reflect "already done" instead of re-prompting.
3. ~~Remove the pantry edit dropdown~~ — already shipped in a prior session (verified: no
   `editingPantryId`/edit-dropdown code remains in `app/(chef)/kitchen/page.tsx`). No work item here.
4. Custom dishes/ingredients stop appearing under every category tab.
5. "Anything you avoid?" gains an optional free-text supplement.
6. "What sounds best tonight?" (protein preference) allows 3 selections, not 2.

Items 1 and 4 are the largest; they share the same file and interact (a staged custom item must respect
the same category filter as a saved one), so they're built together. Items 2, 5, 6 are independent and
smaller.

---

## Item 1: Sleek multi-item staging (no per-item submit button)

### Problem

Today, `sigName`/`sigTagsList`/`sigAllergensList` (and the pantry equivalents) are single flat fields —
exactly one custom dish and one custom ingredient can be "in progress" at a time, and the only way to
actually persist them is the page-wide Submit button. A chef adding three custom dishes has no way to
queue more than one before hitting Submit.

### Design (confirmed via visual-companion mockups this session)

Replace the single flat draft with an array of **staged drafts** per kind (signature, pantry). The
existing name/tag/allergen input fields become the "currently being typed" entry; once it's valid and the
user taps away, it moves into the staged array and the input clears for the next one.

**Auto-suggestion (existing 550ms-debounced Gemini call) is extended, not replaced:**
- The model must always return a best-guess tag for every relevant group (Role — signature only —,
  Protein, Texture, Cooking Method, Temperature, Flavor), even for a vague/unfamiliar name. The existing
  "no reliable descriptive tags found" 422 failure mode is removed for the *confidence* case — the model
  should commit to its best guess, explicitly framed in the prompt as a guess the user will review, not a
  claim of certainty. A **genuine transport/API failure** (network error, non-2xx from an actual server
  problem, malformed JSON) is a different failure class and still needs a manual-entry fallback — only the
  "not confident enough" 422 goes away.
- The suggested tags remain **visible while typing** (as today) — not hidden until an explicit edit
  action.

**Staging trigger — blur, not Enter (mobile-first, no reliance on a physical/virtual Enter key):**
- When the name field (or the tag-picker area) loses focus:
  - If a valid suggestion already exists for the current name (role + ≥1 descriptive tag), stage it
    immediately.
  - If a suggestion is still in flight (debounce hasn't fired, or the request is pending), mark a
    "stage as soon as ready" intent and stage automatically the moment the suggestion resolves — do not
    silently drop the input. If the user refocuses the field before that resolves, cancel the pending
    intent (they're still editing).
  - If the field is empty, do nothing.
- This is the "auto-stage on blur" behavior confirmed via mockup `submit-mechanic-v5.html`.

**Staged chip display:**
- Shows **only the name** — no tags/role shown on the confirmed chip (tags are still stored underneath).
- Includes a small edit affordance (pencil icon) that reopens the item: removes it from the staged array,
  repopulates the name/tag/allergen fields with its data, and refocuses the input. The reopened item's
  tags render in the **existing tag-picker UI** (same `SIGNATURE_TAG_GROUPS`/`PANTRY_TAG_GROUPS` grouped
  chip rendering already used elsewhere on this page) — no new visual design, reuse what exists.
- Staged chips render in the same chip grid as already-saved custom items (not a visually separate
  "pending" section), and are subject to the same category/role filter as everything else (see Item 4) —
  a staged Main-role dish only shows under the Main role tab (or All).

**State shape (illustrative, not final code):**
```ts
type StagedSignatureDraft = { localId: string; name: string; tags: string[]; allergens: string[] }
type StagedPantryDraft = { localId: string; name: string; tags: string[]; allergens: string[] }
```
`localId` is a client-generated key (e.g. incrementing counter or `crypto.randomUUID()`), used only to
track the draft locally (edit/remove) until it's actually inserted — it is never sent to Supabase.

**Submit integration:**
`submitKitchen`'s existing tagged-operation/reconciliation pattern (from the prior session's Task 1 —
`KitchenOp` union, `Promise.allSettled`, per-operation success/failure tracking) is extended with two new
op kinds: one insert per staged signature draft, one insert per staged pantry draft, each tagged with its
`localId`. On partial failure, only the drafts whose operation actually failed stay in the staged arrays
(matching the existing "don't resubmit already-succeeded work" behavior); succeeded drafts are cleared
after `loadData()` refreshes from the DB, exactly like every other operation kind already works.

**Explicitly not changed:**
- The "no way to edit an already-*saved* pantry item" rule stays intact — the new edit-pencil only applies
  to a staged (not-yet-persisted) draft. Once a draft is actually submitted and becomes a real DB row, it
  goes back to the existing saved-item behavior (removable via its chip, staged for deletion like today —
  not re-editable).
- Preset quick-add (tapping a preset chip) is unaffected — this item is only about *custom*, typed-in
  entries.

---

## Item 2: Kitchen setup buttons reflect "already done"

### Problem

Two separate button pairs currently show unconditionally on every visit, regardless of whether the choice
they offer has already been made:

- `ChefTabs.tsx:108-132` — "Fill Kitchen Myself" / "Send To A Chef", gated only on `isEventManager`, shown
  on every Kitchen/Table/Menu/Recipes page visit.
- `app/(chef)/events/[id]/kitchen-setup/page.tsx:56-63` — "Home / other" vs "Restaurant" — no persisted
  field records this choice at all, so it's re-asked every time `/kitchen-setup` is reached (including via
  "Fill Kitchen Myself" above, which routes here, not directly to `/kitchen`).

### Design

**New persisted field:** `events.kitchen_type` — `text check (kitchen_type in ('independent','restaurant'))`,
nullable, migration required. Set once, in `choose()` (`kitchen-setup/page.tsx`), alongside its existing
navigation/`kitchen_status` logic — never overwritten once set (matches "should disappear" — no change
mechanism is being added, since none was requested).

**`/kitchen-setup` screen:** on load, if `kitchen_type` is already set for this event, skip the two-button
choice entirely and navigate straight to the same destination `choose()` already routes to
(`/kitchen` for independent, `/out` for restaurant) — same one `useEffect` that currently loads
`host_id, chef_id, title` also reads `kitchen_type` and performs this redirect before rendering the choice
buttons.

**`ChefTabs.tsx` header:** once `kitchen_status === 'complete'` (regardless of who completed it — self or
delegated chef), replace the `Fill Kitchen Myself` / `Send To A Chef` button pair with a quiet,
non-interactive label — `Kitchen set up ✓` — matching the existing "Saved ✓" transient-confirmation pattern
elsewhere in this app, except persistent (not a timeout). While `kitchen_status` is still `'pending'` (even
if a chef has been assigned but hasn't finished), the existing buttons remain exactly as they are today —
this only changes the "already complete" case.

---

## Item 4: Custom items stop appearing under every category tab

Confirmed in conversation: **both** halves below are real, separate bugs.

### 4a — Pantry ingredient categories (Proteins/Vegetables/Fruits/Herbs & Spices/Dairy & Eggs/Grains &
Starches/Pantry & Condiments)

`customPantry` (`app/(chef)/kitchen/page.tsx:392`) is filtered only to exclude preset-name duplicates —
never by the selected `ingredientCategory` tab. Presets already filter correctly via
`INGREDIENT_PRESETS[ingredientCategory]`; custom items don't, so they show under every tab.

**Fix:** derive an implied `INGREDIENT_CATEGORY` for each custom pantry item from its stored Protein-group
tag (`DESCRIPTIVE_TAG_GROUPS`'s `Protein` group: `beef, lamb, chicken, turkey, pork, duck, fish, shellfish,
egg, dairy, legume, tofu, mushroom, grain, pasta, vegetable, fruit, mixed, none`), via a best-effort
mapping:

| Protein-group tag | Ingredient category |
|---|---|
| beef, lamb, chicken, turkey, pork, duck, fish, shellfish, legume, tofu, mushroom | Proteins |
| vegetable | Vegetables |
| fruit | Fruits |
| dairy, egg | Dairy & Eggs |
| grain, pasta | Grains & Starches |
| mixed, none, or no protein tag present | *(no confident mapping)* |

An item with no confident mapping shows only under "All" — never guessed into the wrong tab, and never
excluded from "All". This mapping lives as one small pure function (e.g. `inferIngredientCategory(tags:
string[]): IngredientCategoryFilter | null` in `lib/ingredient-presets.ts`), used to filter `customPantry`
the same way `filteredIngredients` already filters presets.

No new persisted column, no migration — this is derived at render time from data already stored.

### 4b — Signature dishes: add a Role filter row

There is currently no role-based filter for signatures — only Cuisine tabs (`CUISINE_FILTERS`), and custom
dishes have no cuisine at all, which is *why* they show under every cuisine tab (there's nothing to
exclude them).

**Fix:** add a second filter-tab row, **Role** (`All, Starter, Main, Side, Dessert, Flex` — reusing
`DISH_ROLES` plus an `All` entry, labels via the existing `formatTagLabel` helper), alongside the existing
Cuisine row. Both rows act as an AND filter (default `All`/`All` shows everything, as today). Preset
filtering extends from `d.cuisine === presetCuisine` to also check `d.role === presetRole` (when not
`All`) — presets already carry a `.role: DishRole` field, no data change needed. Custom signatures
(persisted and newly staged) filter by extracting the role from their `tags` array
(`tags.find(isDishRole)`).

This is a genuine small scope addition (confirmed with the user), not a pure bug fix — it's the only way
to make custom dishes filterable at all, since they have no cuisine data to fall back on.

---

## Item 5: "Anything you avoid?" free-text supplement

**New persisted field:** `taste_profiles.avoid_other` — nullable `text`, migration required. Purely
additive: existing `avoid text[]` (the fixed NOGOS checkboxes) is unchanged, and this is a supplementary
free-text field, not a replacement or a new question type. This preserves the architectural rule already
documented in `lib/questionnaire.ts` (canonical questions map 1:1 to fixed columns and can't change type) —
`avoid` stays a fixed-checkbox canonical question; `avoid_other` is a new, separate, optional column, not a
type change to the `avoid` canonical question itself.

**UI:** `components/sofra-v2/PreferencesReceipt.tsx`, directly beneath the existing NOGOS checkbox grid
(after line 180, still inside the `shows('avoid')` block) — an optional single-line text input, placeholder
"Anything else to avoid? (optional)", wired through new `avoidOther`/`onAvoidOtherChange` props threaded
the same way every other field in this component already is. Since both the guest RSVP flow and the host's
own `/profile/preferences` editor render this same component, both get the field automatically — no
separate change needed per surface.

**Persistence:** wherever `avoid: string[]` is currently read/written to `taste_profiles` (RSVP submission,
preferences save), `avoid_other` is written alongside it — same call sites, one extra field.

**Not in scope:** `avoid_other` is not fed into any scoring/matching logic (per `docs/DECISION_LOG.md`'s
existing allergy/diet matching being deterministic against fixed vocabularies) — it's guest-facing context
for the host to read, not a machine-matched value. This mirrors how custom written questionnaire answers
already work elsewhere in this app (untrusted free text, shown to the host, not scored).

---

## Item 6: "What sounds best tonight?" allow 3 selections

Purely mechanical, no design decision:
- `lib/protein-preferences.ts:28` — `specific.length >= 2` → `specific.length >= 3`.
- `lib/questionnaire.ts:72` — `helperText: 'Choose up to two.'` → `'Choose up to three.'`.
- `components/sofra-v2/PreferencesReceipt.tsx:187` fallback text `'Choose up to two.'` → `'Choose up to
  three.'`.
- Any test asserting the old 2-item cap (search `updateProteinPreferenceSelection`, "Choose up to two")
  updates to reflect 3.

---

## Testing requirements

- **Item 1:** staging a valid custom dish/ingredient via blur (not click); staging is blocked while the
  suggestion is still pending and completes automatically once it resolves; a bad/incomplete typed name
  still produces *some* staged guess (no more manual-fallback-required path); editing a staged draft
  removes it from the staged list and repopulates the form; multiple staged drafts (dish + ingredient)
  submit together in one `submitKitchen` call; a failed staged-insert stays staged for retry while a
  succeeded one clears (mirroring the existing reconciliation tests from the prior session).
- **Item 2:** `/kitchen-setup` redirects immediately when `kitchen_type` is already set (no buttons
  rendered); `ChefTabs` shows the buttons when `kitchen_status !== 'complete'` and the quiet label when it
  is.
- **Item 4:** a custom pantry item with an inferred category only appears under that category tab and
  "All"; one with no confident mapping appears only under "All"; a custom/staged signature dish appears
  only under its matching Role tab (and "All") regardless of Cuisine tab selection.
- **Item 5:** `avoid_other` round-trips through RSVP submission and the host preferences editor; omitting
  it doesn't break existing `avoid` checkbox behavior.
- **Item 6:** selecting a 3rd protein preference succeeds; a 4th is still rejected/blocked (cap moves from
  2 to 3, doesn't disappear).

## Migrations needed

1. `events.kitchen_type` (nullable, checked enum) — Item 2.
2. `taste_profiles.avoid_other` (nullable text) — Item 5.

## Out of scope / deferred

- No mechanism to *change* `kitchen_type` once set, or to un-complete a `kitchen_status`, per the literal
  request ("should disappear").
- `avoid_other` is not matched against dish tags/allergens by any scoring logic (see Item 5).
- No changes to the existing signature-editing dead-code path (`editingSignatureId` for already-saved
  signatures) — out of scope for this pass, unrelated to the new staged-draft editing in Item 1.
