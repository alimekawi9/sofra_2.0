# Sofra Pipeline Amendment: Tag Taxonomy, Kitchen UI, Display Formatting, and WhatsApp Sharing

This section overrides any earlier recommendation-pipeline instructions that conflict with it.

Do not create duplicate roles, tags, dietary systems, allergen terms, or ingredient properties. Preserve existing stored values and existing guest-side dietary terminology wherever it already exists.

Before editing:

1. Read `AGENTS.md`.
2. Read `CLAUDE.md`.
3. Read the complete `docs/RECOMMENDATION_PIPELINE.md`.
4. Inspect the current repository implementation.
5. Search for all definitions and usages of:

   * `DishRole`;
   * signature-dish tag groups;
   * pantry-ingredient tag groups;
   * tag-button and tag-chip rendering;
   * WhatsApp sharing;
   * `wa.me`;
   * `window.open`;
   * `navigator.share`;
   * environment-dependent URL construction.
6. Run `git status`.
7. Review recent `git log` entries related to WhatsApp sharing and the Kitchen/Table UI.
8. Do not assume an earlier prompt was fully implemented.

---

# 1. Pantry ingredients must not have dish roles

Remove the role button group entirely from the pantry ingredient tag picker on the Kitchen page.

Dish roles apply only to complete signature dishes.

The valid dish roles remain:

```text
starter
main
side
dessert
flex
```

Raw pantry ingredients must not be directly tagged as:

```text
starter
main
side
dessert
flex
```

Do not merely hide the role controls with CSS.

Remove the pantry-role picker from:

* JSX;
* component state;
* form initialization;
* validation;
* submission payloads;
* update payloads;
* pantry-item editing;
* reusable picker configuration;
* tests that expect pantry roles.

If a legacy pantry record already contains a role value:

* do not expose it in the UI;
* do not use it in new pantry logic;
* do not add another migration unless one is actually necessary;
* document whether the stale field is ignored or removed.

The role of an ingredient in a particular generated recipe is contextual. It is not a permanent property of the raw pantry ingredient.

For example:

```text
Tomato may be central to one dish,
supporting in another,
and a garnish in another.
```

Therefore, ingredient role inside a proposed dish must be determined within the generated-dish structure, not through a permanent pantry role tag.

---

# 2. Confirm and fix the `main` signature role

Determine whether `main` is:

1. missing from the `DishRole` type or enum itself;
2. present in the type but missing from the Kitchen-page signature-role buttons;
3. present in both but broken elsewhere in persistence, validation, rendering, or filtering.

Fix the real problem rather than blindly adding another value.

The final canonical role definition must include:

```ts
type DishRole =
  | 'starter'
  | 'main'
  | 'side'
  | 'dessert'
  | 'flex'
```

Or the equivalent enum/schema definition already used by the repository.

`main` must work end-to-end for signature dishes:

* selectable on the Kitchen page;
* stored without transformation;
* loaded during edit;
* rendered on the Table page;
* recognized by scoring;
* recognized by role targets;
* recognized by role ceilings;
* recognized by validation;
* recognized by persistence;
* recognized by tests;
* formatted as `Main` in the UI.

Do not add a second role such as:

```text
mains
main_course
entree
```

Use the existing canonical value:

```text
main
```

---

# 3. Add one shared tag-display formatting helper

Create one reusable presentation helper, for example:

```ts
export function formatTagLabel(tag: string): string
```

The helper must:

1. replace underscores with spaces;
2. normalize repeated spaces;
3. trim the result;
4. apply title case for rendering.

Examples:

```text
room_temperature → Room Temperature
tree_nut         → Tree Nut
grain_or_starch  → Grain Or Starch
savory           → Savory
main             → Main
```

This helper is presentation-only.

It must not modify:

* database values;
* submitted values;
* comparison values;
* filter values;
* object keys;
* enum values;
* validation values;
* persisted arrays;
* LLM lineage values;
* exact-match logic.

Correct pattern:

```tsx
<button value={tag}>
  {formatTagLabel(tag)}
</button>
```

Incorrect pattern:

```tsx
const formattedTag = formatTagLabel(tag)
saveTag(formattedTag)
```

The stored value must remain:

```text
room_temperature
```

The UI label may display:

```text
Room Temperature
```

---

# 4. Apply consistent formatting everywhere

Search the complete repository for tag, role, allergen, texture, method, temperature, and protein/base labels rendered in the UI.

Apply `formatTagLabel` consistently to all user-facing rendering, including where applicable:

* Kitchen-page signature tag buttons;
* Kitchen-page pantry tag buttons;
* selected-tag chips;
* edit forms;
* Table-page chips;
* menu cards;
* filters;
* role labels;
* allergen chips;
* temperature labels;
* cooking-method labels;
* protein/base labels;
* generated-menu previews;
* admin or debug views intended for users;
* chef-facing menu details;
* guest-facing menu details where tag labels appear.

Remove inconsistent manual rendering such as:

```ts
tag.charAt(0).toUpperCase() + tag.slice(1)
```

or:

```ts
tag.replace('_', ' ')
```

or one-off label maps used only for capitalization, unless a label intentionally differs semantically from the stored value.

Use one shared helper as the default formatter.

After applying the helper, search again for direct tag rendering and verify that no inconsistent capitalization remains.

---

# 5. Preserve raw exact-match logic

Formatting must not alter recommendation behavior.

Search for direct comparisons such as:

```ts
tag === 'room_temperature'
tags.includes('savory')
role === 'main'
allergens.includes('shellfish')
```

Confirm that every comparison still uses the raw stored value.

Do not compare against formatted labels such as:

```ts
tag === 'Room Temperature'
role === 'Main'
```

Do not run `formatTagLabel` before:

* scoring;
* filtering;
* database writes;
* Supabase queries;
* duplicate detection;
* allergen matching;
* dietary matching;
* signature selection;
* ingredient retrieval;
* validation;
* role counting;
* tests of canonical values.

Add tests proving:

```text
formatTagLabel("room_temperature") === "Room Temperature"
```

while:

```text
stored value === "room_temperature"
```

continues to pass all exact-match logic.

---

# 6. Final tag-system reconciliation rules

Use the repository’s existing terms wherever they overlap with proposed values.

Do not create parallel systems.

The following reconciliation is authoritative.

---

# 7. Dish roles: skip as existing structural values

These are not new tags.

| Proposed value | Status                                  | Existing canonical value / action                              |
| -------------- | --------------------------------------- | -------------------------------------------------------------- |
| `starter`      | Skip as duplicate                       | Existing `DishRole.starter`; keep unchanged                    |
| `main`         | Skip as duplicate, but fix availability | Existing canonical role must be selectable and work end-to-end |
| `side`         | Skip as duplicate                       | Existing `DishRole.side`; keep unchanged                       |
| `dessert`      | Skip as duplicate                       | Existing `DishRole.dessert`; keep unchanged                    |
| `flex`         | Skip as duplicate                       | Existing `DishRole.flex`; keep unchanged                       |

Do not add these to the pantry ingredient tag picker.

They remain available only for signature dishes and complete generated dishes.

---

# 8. Guest dietary restrictions: do not add as dish tags

The following proposed values must not be added as clickable signature-dish or pantry tags in this pass:

| Proposed value | Status | Reason / existing system                                                                          |
| -------------- | ------ | ------------------------------------------------------------------------------------------------- |
| `vegetarian`   | Skip   | Belongs to the existing guest-side dietary restriction system                                     |
| `vegan`        | Skip   | Belongs to the existing guest-side dietary restriction system                                     |
| `pescatarian`  | Skip   | Belongs to the existing guest-side dietary restriction system                                     |
| `halal`        | Skip   | Existing dietary wording differs, such as `No pork/alcohol`; do not create a parallel `halal` tag |
| `gluten_free`  | Skip   | Dietary restrictions use an existing naming system; do not duplicate it                           |
| `dairy_free`   | Skip   | Dietary restrictions use an existing naming system; do not duplicate it                           |
| `egg_free`     | Skip   | Dietary restrictions use an existing naming system; do not duplicate it                           |

Do not rename existing guest dietary values as part of this task.

Do not add new dish-side values that fail to match the existing dietary restriction system.

If recommendation validation currently derives dietary compatibility through existing restrictions and allergens, preserve that behavior.

---

# 9. Existing allergens: skip proposed duplicates and preserve current terms

Keep the existing allergen vocabulary exactly as it is for existing terms.

| Proposed value | Status                                       | Existing canonical term                                                                |
| -------------- | -------------------------------------------- | -------------------------------------------------------------------------------------- |
| `peanut`       | Skip as duplicate/conflict                   | Use existing `nuts`                                                                    |
| `tree_nut`     | Skip as duplicate/conflict                   | Use existing `nuts`                                                                    |
| `dairy`        | Skip as duplicate                            | Existing `dairy`                                                                       |
| `egg`          | Skip as duplicate/conflict                   | Use existing `eggs`                                                                    |
| `gluten`       | Skip as duplicate                            | Existing `gluten`                                                                      |
| `wheat`        | Skip as duplicate/conflict                   | Continue using existing `gluten`; do not create a separate wheat allergen in this pass |
| `soy`          | Skip as duplicate                            | Existing `soy`                                                                         |
| `fish`         | Do not add unless already present separately | Preserve current allergen model; do not split or redesign in this pass                 |
| `shellfish`    | Skip as duplicate                            | Existing `shellfish`                                                                   |
| `pork`         | Skip as duplicate                            | Existing `pork`                                                                        |

Existing allergen terms that must remain unchanged:

```text
nuts
gluten
soy
dairy
shellfish
eggs
pork
```

Do not migrate these existing values to more granular alternatives during this task.

---

# 10. New allergens to add

Add only these genuinely new allergen values:

```text
sesame
mustard
celery
sulfites
lupin
molluscs
```

Add them consistently to:

* canonical allergen definitions;
* signature tag picker;
* pantry tag picker where allergens are selected;
* validation schemas;
* UI chips;
* allergen matching;
* chef menu rendering;
* guest menu/PDF rendering;
* tests.

Use the exact stored values above.

Render them using `formatTagLabel`.

Examples:

```text
sesame   → Sesame
sulfites → Sulfites
molluscs → Molluscs
```

Do not create singular/plural alternatives.

---

# 11. Protein/base types to add

Add the following as a dedicated protein/base tag group for signature dishes and pantry ingredients where appropriate:

```text
beef
lamb
chicken
turkey
pork
duck
fish
shellfish
egg
dairy
legume
tofu
mushroom
grain
pasta
vegetable
fruit
mixed
none
```

Full reconciliation:

| Value       | Status                    | Notes                                                                                                 |
| ----------- | ------------------------- | ----------------------------------------------------------------------------------------------------- |
| `beef`      | Add                       | New protein/base value                                                                                |
| `lamb`      | Add                       | New protein/base value                                                                                |
| `chicken`   | Add                       | New protein/base value                                                                                |
| `turkey`    | Add                       | New protein/base value                                                                                |
| `pork`      | Add to protein/base group | Existing allergen/restriction value may also exist; same raw word may appear in separate typed groups |
| `duck`      | Add                       | New protein/base value                                                                                |
| `fish`      | Add                       | New protein/base value                                                                                |
| `shellfish` | Add to protein/base group | Existing allergen may also exist; keep groups typed and distinct                                      |
| `egg`       | Add to protein/base group | Existing allergen is `eggs`; do not rename allergen term                                              |
| `dairy`     | Add to protein/base group | Existing allergen is also `dairy`; typed groups must distinguish usage                                |
| `legume`    | Add                       | New protein/base value                                                                                |
| `tofu`      | Add                       | New protein/base value                                                                                |
| `mushroom`  | Add                       | New substantial-base value                                                                            |
| `grain`     | Add                       | New substantial-base value                                                                            |
| `pasta`     | Add                       | New substantial-base value                                                                            |
| `vegetable` | Add                       | New base value                                                                                        |
| `fruit`     | Add                       | New base value                                                                                        |
| `mixed`     | Add                       | For dishes with no single dominant base                                                               |
| `none`      | Add                       | For dishes without a meaningful protein/base                                                          |

These values support:

* protein preference scoring;
* substantial-base matching;
* menu repetition analysis;
* residual protein demand;
* pantry narrowing.

Do not treat the display label as the stored value.

---

# 12. Texture tags to add

Add these texture values:

```text
crunchy
tender
chewy
juicy
silky
flaky
firm
```

Full reconciliation:

| Value     | Status |
| --------- | ------ |
| `crunchy` | Add    |
| `tender`  | Add    |
| `chewy`   | Add    |
| `juicy`   | Add    |
| `silky`   | Add    |
| `flaky`   | Add    |
| `firm`    | Add    |

If `crispy`, `creamy`, or `soft` already exist, keep them unchanged and do not duplicate them.

Do not add texture-role controls to pantry ingredients unless the current schema already supports ingredient textures for a justified existing purpose. The primary requirement is that these values exist for signature-dish description and menu-diversity analysis.

---

# 13. Additional profile tags to add

The following values were included in the requested new tag set:

```text
mild
bitter
savory
herbal
```

These are flavor/profile descriptors rather than physical textures.

If the repository has a flavor tag group, add them there.

Do not place them into a texture enum merely because they appeared beside texture terms in an earlier list.

Full reconciliation:

| Value    | Status                     | Group          |
| -------- | -------------------------- | -------------- |
| `mild`   | Add if not already present | Flavor/profile |
| `bitter` | Add if not already present | Flavor/profile |
| `savory` | Add if not already present | Flavor/profile |
| `herbal` | Add if not already present | Flavor/profile |

If any already exist, skip them as duplicates and preserve their existing canonical values.

Do not create alternatives such as:

```text
savoury
herbaceous
not_spicy
```

---

# 14. Cooking methods to add

Add these cooking-method values:

```text
braised
baked
steamed
boiled
seared
smoked
stewed
pickled
```

Full reconciliation:

| Value     | Status |
| --------- | ------ |
| `braised` | Add    |
| `baked`   | Add    |
| `steamed` | Add    |
| `boiled`  | Add    |
| `seared`  | Add    |
| `smoked`  | Add    |
| `stewed`  | Add    |
| `pickled` | Add    |

If values such as `raw`, `grilled`, `roasted`, or `fried` already exist, retain them and do not duplicate them.

These methods apply to complete dishes, especially signatures.

Do not assume a raw pantry ingredient has one permanent cooking method.

---

# 15. Temperature values to add

Add these temperature values:

```text
chilled
hot
cold
room_temperature
```

Full reconciliation:

| Value              | Status | Notes                        |
| ------------------ | ------ | ---------------------------- |
| `chilled`          | Add    | Distinct presentation state  |
| `hot`              | Add    | Stored lowercase             |
| `cold`             | Add    | Stored lowercase             |
| `room_temperature` | Add    | Render as `Room Temperature` |

Use `formatTagLabel` for display.

Do not store:

```text
Room Temperature
room temperature
room-temperature
```

The canonical stored value is:

```text
room_temperature
```

---

# 16. Recipe-function tags: hold out entirely

Do not add these as fixed clickable dish or pantry tags:

```text
core
supporting
garnish
seasoning
acid
fat
sweetener
binder
sauce_base
```

Full reconciliation:

| Value        | Status   | Reason                              |
| ------------ | -------- | ----------------------------------- |
| `core`       | Hold out | Role within one specific recipe     |
| `supporting` | Hold out | Role within one specific recipe     |
| `garnish`    | Hold out | Role within one specific recipe     |
| `seasoning`  | Hold out | Role within one specific recipe     |
| `acid`       | Hold out | Function within one specific recipe |
| `fat`        | Hold out | Function within one specific recipe |
| `sweetener`  | Hold out | Function within one specific recipe |
| `binder`     | Hold out | Function within one specific recipe |
| `sauce_base` | Hold out | Function within one specific recipe |

These may later appear in the LLM’s structured output for a particular proposed dish.

For example:

```json
{
  "name": "Lemon",
  "importance": "supporting"
}
```

They must not be treated as permanent properties of a pantry ingredient.

---

# 17. Retrieval/computed tags: hold out entirely

Do not add these as clickable fixed tags:

```text
protein_or_substantial_base
grain_or_starch
herb_or_aromatic
sauce_acid_dairy_or_condiment
available
is_substantial
dessert_capable
```

Full reconciliation:

| Value                           | Status   | Reason                                  |
| ------------------------------- | -------- | --------------------------------------- |
| `protein_or_substantial_base`   | Hold out | Retrieval grouping or computed category |
| `grain_or_starch`               | Hold out | Retrieval grouping                      |
| `herb_or_aromatic`              | Hold out | Retrieval grouping                      |
| `sauce_acid_dairy_or_condiment` | Hold out | Retrieval grouping                      |
| `available`                     | Hold out | Existing state/boolean, not a tag       |
| `is_substantial`                | Hold out | Computed or structured boolean          |
| `dessert_capable`               | Hold out | Computed/derived property               |

Do not expose these in the Kitchen tag picker during this pass.

If the algorithm needs these concepts, derive or map them internally from the actual tag groups and structured data.

Pantry availability remains the existing binary availability state.

---

# 18. Complete final reconciliation list

The implementation report must list every proposed value and one of:

```text
ADDED
SKIPPED_AS_DUPLICATE
HELD_OUT
FIXED_EXISTING_ROLE
```

Use the following authoritative result.

## Fixed existing role

```text
main
```

Reason:

```text
Existing DishRole value that must become selectable and work end-to-end.
```

## Skipped as existing roles

```text
starter
side
dessert
flex
```

## Skipped as guest dietary-system values

```text
vegetarian
vegan
pescatarian
halal
gluten_free
dairy_free
egg_free
```

## Skipped in favor of existing allergen terms

```text
peanut      → nuts
tree_nut    → nuts
egg         → eggs, only in allergen context
wheat       → gluten
```

## Existing allergens retained without replacement

```text
nuts
gluten
soy
dairy
shellfish
eggs
pork
```

## New allergens added

```text
sesame
mustard
celery
sulfites
lupin
molluscs
```

## Protein/base values added

```text
beef
lamb
chicken
turkey
pork
duck
fish
shellfish
egg
dairy
legume
tofu
mushroom
grain
pasta
vegetable
fruit
mixed
none
```

## Texture values added

```text
crunchy
tender
chewy
juicy
silky
flaky
firm
```

## Flavor/profile values added if absent

```text
mild
bitter
savory
herbal
```

## Cooking methods added

```text
braised
baked
steamed
boiled
seared
smoked
stewed
pickled
```

## Temperature values added

```text
chilled
hot
cold
room_temperature
```

## Held-out recipe-function values

```text
core
supporting
garnish
seasoning
acid
fat
sweetener
binder
sauce_base
```

## Held-out computed/retrieval values

```text
protein_or_substantial_base
grain_or_starch
herb_or_aromatic
sauce_acid_dairy_or_condiment
available
is_substantial
dessert_capable
```

---

# 19. Typed groups must prevent semantic collisions

Some raw values may appear in more than one conceptual system.

Examples:

```text
pork
shellfish
dairy
egg / eggs
```

Do not merge typed groups merely because labels overlap.

Examples:

```text
protein/base: shellfish
allergen: shellfish
```

and:

```text
protein/base: egg
allergen: eggs
```

The UI and schemas must know which group a value belongs to.

Do not run global deduplication across different semantic groups.

Deduplicate only within each group.

---

# 20. Signature and pantry picker requirements

## Signature dish picker

Signature dishes may expose the appropriate groups:

* role;
* protein/base;
* flavor/profile;
* texture;
* cooking method;
* temperature;
* allergen.

Do not add the held-out recipe-function or retrieval tags.

Do not add duplicate guest dietary restriction tags.

## Pantry ingredient picker

Pantry ingredients may expose only groups that accurately describe a raw ingredient under the current schema, such as:

* protein/base where appropriate;
* flavor/profile where appropriate;
* allergen.

Do not expose:

* dish role;
* recipe-function tags;
* retrieval-category tags;
* computed booleans as tags.

If texture, method, or temperature is inherently dish-specific in the current implementation, do not force those groups into pantry ingredients merely because they exist for signatures.

The central requirement is:

```text
No starter/main/side/dessert/flex picker for pantry ingredients.
```

---

# 21. WhatsApp sharing: diagnose before fixing

The WhatsApp share button currently works on localhost but not on the deployed Vercel site.

Do not apply speculative fixes first.

Diagnose and report the actual root cause with evidence.

## 21.1 Check source-control state

Run:

```bash
git status
git diff
git log --oneline --decorate -n 20
```

Search for the WhatsApp implementation:

```bash
git grep -n "wa.me"
git grep -n "WhatsApp"
git grep -n "window.open"
git grep -n "navigator.share"
```

Determine:

* whether the WhatsApp code is committed;
* whether the commit exists on the deployed branch;
* whether the commit was pushed;
* whether Vercel is deploying that branch;
* whether the live deployment predates the commit.

Report exact evidence:

```text
File
Commit hash
Commit date
Current branch
Remote tracking state
Whether local branch is ahead of remote
```

Do not claim a deployment bug if the code was never pushed.

## 21.2 Inspect the deployed behavior

If the code is committed and deployed:

* open the live Vercel site;
* open browser developer tools;
* click the WhatsApp button;
* record any console error;
* inspect whether a popup is blocked;
* inspect the generated URL;
* inspect whether the click handler runs;
* inspect whether the button is disabled or absent;
* inspect whether hydration or client/server boundaries differ in production.

Check whether the code relies on:

* `localhost`;
* `window.location.origin`;
* a missing public environment variable;
* a development-only URL;
* an undefined event ID;
* an undefined invitation code;
* an unavailable phone number;
* malformed encoding;
* an unescaped ampersand;
* server-side access to `window`;
* a condition that is true only with local seed data;
* environment-specific feature flags;
* stale Vercel deployment output.

## 21.3 Verify the `wa.me` URL

The final URL should be constructed safely.

Example pattern:

```ts
const message = encodeURIComponent(shareText)
const whatsappUrl = `https://wa.me/?text=${message}`
```

If sharing to a specific number:

```ts
const normalizedPhone = phone.replace(/[^\d]/g, '')
const whatsappUrl =
  `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(shareText)}`
```

Do not include:

* a plus sign in the normalized `wa.me` phone path;
* spaces;
* parentheses;
* unencoded message text.

Verify whether the app intends to open:

```text
https://wa.me/?text=...
```

or:

```text
https://wa.me/<number>?text=...
```

Do not change the behavior without confirming the product intention.

## 21.4 Check button visibility logic

Inspect every condition controlling whether the button renders.

Examples:

```ts
event.status === 'ready'
shareUrl
typeof window !== 'undefined'
guestCount > 0
invitationCode
```

Compare live production data with local data.

Report whether the button:

* is not rendered;
* is rendered but disabled;
* receives no click;
* creates an invalid URL;
* opens and immediately fails;
* is blocked by the browser;
* points to stale localhost content.

## 21.5 Fix only after identifying the cause

Once the real cause is known:

* make the smallest correct fix;
* preserve working localhost behavior;
* add tests where practical;
* commit the fix;
* push it to the deployed branch if authorized;
* verify the new Vercel deployment;
* retest the live button.

The final report must state:

```text
Root cause
Evidence
Files changed
Why the fix addresses the root cause
Live verification result
```

Do not report “likely,” “possibly,” or “probably” after the diagnosis is complete.

If live-site access or deployment logs are unavailable, state exactly what could not be verified and do not invent a root cause.

---

# 22. Required tests

Add or update tests covering the following.

## Pantry-role removal

* pantry ingredient picker has no role controls;
* pantry create payload contains no role;
* pantry update payload contains no role;
* pantry edit does not load role state;
* role picker is not merely hidden.

## Signature `main` role

* `main` exists in `DishRole`;
* `main` appears in the signature-role UI;
* a signature can be created with `main`;
* a `main` signature can be edited;
* a `main` signature persists;
* a `main` signature renders correctly;
* role scoring recognizes `main`.

## Display formatting

Verify:

```ts
formatTagLabel('room_temperature') === 'Room Temperature'
formatTagLabel('savory') === 'Savory'
formatTagLabel('main') === 'Main'
formatTagLabel('sauce_acid_dairy_or_condiment')
  === 'Sauce Acid Dairy Or Condiment'
```

Also verify that raw values are still used for:

* form state;
* callbacks;
* database writes;
* comparisons;
* filters.

## Tag reconciliation

Test that:

* no duplicate role tags are created;
* guest dietary values are not introduced as dish tags;
* existing allergens remain;
* only the six new allergens are added;
* held-out tags are absent from clickable tag groups;
* `room_temperature` remains the stored value;
* the pantry picker has no role group.

## WhatsApp

Where practical, test:

* the share message is URL encoded;
* the `wa.me` URL is valid;
* specific phone numbers are normalized;
* production URL inputs do not fall back to localhost;
* the button renders under the correct conditions;
* the click handler opens the expected URL.

---

# 23. Self-review requirements

Before reporting completion, explicitly verify all of the following.

## Pantry roles

Confirm the pantry role picker is genuinely gone:

* no JSX;
* no shared picker configuration;
* no form state;
* no payload field;
* no hidden CSS-only implementation.

## Signature main role

Confirm `main` works end-to-end:

* type;
* schema;
* picker;
* create;
* edit;
* persistence;
* display;
* scoring;
* validation.

## Formatting

Confirm:

* one shared formatter is used;
* no inconsistent manual capitalization remains;
* underscores display as spaces;
* title case is consistent;
* raw stored values remain unchanged.

## Exact-match logic

Search the repository for direct string comparisons against tag values.

Confirm all logic compares raw canonical strings.

Provide examples in the final report.

## Tag reconciliation

List every proposed tag and classify it as:

* added;
* skipped as duplicate;
* held out;
* fixed existing role.

Do not provide only a summary.

## WhatsApp

Report the actual root cause with evidence.

Do not say only:

```text
Fixed WhatsApp sharing
```

State why it failed on Vercel but worked locally.

---

# 24. Commands to run

Run the repository’s existing commands for:

```bash
npm test -- --runInBand
npm run build
```

Also run, when configured:

```bash
npm run lint
npm run type-check
```

Run:

```bash
git status
git diff --check
```

Report pre-existing failures separately from failures introduced by this work.

---

# 25. Final acceptance criteria

This amendment is complete only when:

* pantry ingredients no longer have dish-role controls;
* the pantry role picker is removed rather than hidden;
* `main` is a valid and selectable signature role;
* `main` works through creation, persistence, editing, rendering, scoring, and validation;
* one shared `formatTagLabel` helper is used;
* `room_temperature` renders as `Room Temperature`;
* stored values remain unchanged;
* exact-match logic still uses raw values;
* capitalization is consistent across Kitchen, Table, menu, and chip displays;
* guest dietary restrictions were not duplicated as dish tags;
* existing allergens were preserved;
* only `sesame`, `mustard`, `celery`, `sulfites`, `lupin`, and `molluscs` were added as new allergens;
* all requested protein/base values were added;
* all requested new texture values were added;
* `mild`, `bitter`, `savory`, and `herbal` were added to the appropriate flavor/profile group if absent;
* all requested cooking methods were added;
* all requested temperature values were added;
* recipe-function tags were held out;
* retrieval/computed tags were held out;
* no pantry role values were reintroduced through another component;
* the WhatsApp issue was diagnosed before repair;
* the actual WhatsApp root cause was reported with evidence;
* relevant tests pass;
* production build passes.

---

# 26. Final implementation report

When finished, provide:

1. The real reason `main` was unavailable.
2. The exact files changed for the role fix.
3. Confirmation that pantry roles were fully removed.
4. The path of `formatTagLabel`.
5. Every place where the helper was applied.
6. Examples proving stored values remain raw.
7. The complete tag reconciliation table.
8. New allergens added.
9. New protein/base values added.
10. New texture/profile values added.
11. New cooking methods added.
12. New temperature values added.
13. Held-out values.
14. WhatsApp root cause.
15. Git evidence for the WhatsApp implementation.
16. Browser-console or live-site evidence.
17. The WhatsApp fix.
18. Test results.
19. Build result.
20. Any remaining limitations.

Do not claim completion unless the repository was inspected, the tests were run, and the production build was attempted.
