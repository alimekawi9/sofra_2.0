# Implementation Status

## Completed

- Shared-link invitation landing titles now use a narrower, balanced text box
  with length-aware type scaling so long event names remain inside the artwork
  label instead of leaking across its edges.
- Invite entry ordering is now strictly landing → existing phone page → name
  page only for an unknown phone → RSVP status. Invite claims always open the
  phone page immediately, while the RSVP route mounts no details until local
  identity is confirmed. Existing page content and RSVP button destinations
  are unchanged; typed name text is burgundy.
- Opened but unanswered shared-link invitations are retained locally and
  merged into the existing Invited dashboard tab until an RSVP is saved, so
  backing out to Your Sofras does not lose the invitation. The phone plate now
  reserves a fixed-width country selector and right-side input breathing room,
  keeping long dial-code labels and placeholders inside the inner circle.

- Event menu recipes now support host-entered or one-time structured Gemini
  generation, persisted base servings/instructions/ingredient quantities,
  deterministic guest-count scaling, and visible recipe-level allergen
  warnings that identify dish-metadata gaps. Shopping and pantry deduction
  remain deferred.
- `portionGuidance(slot, guestCount?)` (`lib/menu.ts`) now optionally scales its
  batch estimate with guest count once the dynamic dish-count formula caps out
  at 9 dishes (guestCount > 13), bounded to 4x the static baseline; omitting
  guestCount (every pre-existing caller) is unchanged. Wired into both the
  Table/Menu page course cards and the PDF export. `pantry_items` gained
  optional, nullable `quantity_amount`/`quantity_unit` columns (migration
  `20260811000001_add_pantry_item_quantity.sql`) with an optional quantity
  input in the Kitchen page's manual pantry-add form; availability stays
  binary and this data isn't read by any deduction logic yet. See
  docs/DECISION_LOG.md for the full recipe-input/shopping-cart scope this was
  deliberately extracted from and deferred.
- Generated menu dishes now return strict dish-specific canonical scoring
  metadata; unknown novelty is neutral, explicit no-protein-preference is
  neutral, and questionnaire sensory choices such as crispy participate in
  the existing flavor-weighted fit dimension. Pre-LLM gaps allocate anonymous
  per-diner satisfying and substantial coverage across distinct compatible,
  role-feasible gaps. Repairs prioritize the largest deficit, replace the
  lowest marginal-value unlocked dish, build a diner/role-specific gap, and
  still stop after two attempts.
- Gemini structured-output diagnostics now distinguish max-token truncation,
  harmless local-only Markdown wrapping, incomplete/prose output, malformed
  JSON, and post-JSON schema rejection. The metadata-rich seven-dish response
  budget is 1,600 tokens; input context and the 8-second deadline are unchanged.
- Kitchen signature and pantry creation now use progressive manual tagging with no AI metadata inference.
- Signature edits preserve and rehydrate saved names/tags in place.
- Legacy sea/land/green menu slots are normalized to starter/main/side/dessert roles.
- Menu generation now initializes one menu per event after validation; opening an empty menu page no longer creates a rule-based draft.

- Signature scoring metadata now reuses canonical `tags[]` dimensions and
  trusted `contains_allergens[]` through one normalized accessor. Migration
  `20260810000001_add_signature_novelty_and_substantial.sql` adds only the two
  genuinely missing complete-dish fields (`novelty_score` and
  `is_substantial`) and backfills the three audited presets. New preset
  selections persist curated metadata; genuinely custom dishes receive one
  bounded Gemini metadata suggestion at creation time and save it for future
  deterministic scoring. Editing a saved dish does not invoke Gemini again.
- A local pre-LLM inspection helper and read-only real-event script now expose
  signature score components and decisions, the explicit N/selected/locked/M
  invariant, anonymized diner coverage and gaps, pantry retrieval stage counts,
  and the compact brief without calling Gemini. Controlled signature, allergy,
  pantry, and preference-sensitivity fixtures verify deterministic control.
- Production Menu Drafting (`/events/[id]/menu`) now uses the approved
  Sofra/Lovable light application shell with rounded course cards, clearer
  locked and table-fit states, responsive controls, and a restyled PDF export
  area. Existing deterministic derivation, Gemini generation, course swaps,
  locking, substitutions, persistence, and print-ready export are unchanged.

## In progress

- Deterministic-first recommendation restoration: central thresholds, dynamic
  dish-count/role planning primitives, purchase/context formulas, server-owned
  generation inputs, an environment-configurable low-latency Gemini model,
  bounded structured-output cap, and an 8-second abort are implemented. Sequential
  residual-aware signature scoring/selection, structured gaps, thresholded
  pantry relevance, and MMR diagnostics are implemented as deterministic
  planning modules. Exact pantry category ceilings and retrieval diagnostics
  plus a typed compact gap-only Gemini brief and strict structured proposal
  schema/parser are implemented and tested without
  IDs, raw tags, diner names, full profiles, or full inventory. The production
  generation route now uses that compact contract, skips Gemini
  when M=0, and safely replaces variable unlocked rows while preserving locked
  IDs and legacy slot compatibility. The menu UI renders the resulting ordered
  3–9 rows with broad role labels. The full ordered deterministic validator and
  priority-driven, single-dish repair engine are complete; repairs stop after
  two attempts, preserve locked dishes, and return an explicit warning/fallback
  state. The final 18-guest run calculated 9 dishes, selected 0 signatures, and
  requested 9 generated dishes; validation correctly exhausted two repairs and
  returned fallback rather than persisting an invalid menu.
- Production Table Intelligence (`/events/[id]/table`) now uses the approved
  Sofra/Lovable light application shell, rounded responsive intelligence
  cards, restyled host navigation, bar charts, adventurousness visualization,
  brief, custom-answer summaries, and substitution plan. Existing Supabase
  access checks, preference aggregation, deterministic intelligence building,
  and menu-derived substitution behavior are unchanged.
- Production `/kitchen` now uses the approved Sofra/Lovable light application
  styling while retaining the existing Supabase-backed signature and weekly
  pantry workflows. Preset selection, custom add/edit/delete, canonical raw
  tags, allergen selection, and event-return navigation remain intact; pantry
  availability remains binary and pantry ingredients still have no dish-role
  controls. Saved preset and custom inventory now appear only as active chips
  in their selectors rather than being duplicated in written lists. Inline
  chip edit buttons have been replaced by the full inventory edit forms, and
  production Kitchen cards and controls now use consistently rounded corners.
- Shared Album uploads now persist an `event_photos` record containing the
  route event ID, uploader ID, Storage path, and server-generated timestamp.
  The album queries those records newest-first, immediately appends the
  returned insert row, derives its count from the rendered array, and exposes
  restrained upload/insert/fetch errors without clearing existing photos.
  Migration `20260807000002_add_event_photos.sql` must be applied before this
  flow is used in production.
- Guest protein/base preferences support up to two raw selections, legacy
  single-value normalization, readable Table aggregation, and deterministic
  45% OR-matching against canonical dish base tags.
- Production migration Phase 1 establishes the approved Playfair Display and
  DM Sans visual tokens, off-white/burgundy application shell, and persistent
  SOFRAS / HOST / PROFILE navigation.
- Production migration Phase 2 makes `users.phone` nullable (migration
  `20260807000001_make_users_phone_nullable.sql`; UNIQUE constraint
  untouched — Postgres allows unlimited NULLs) and migrates the approved
  Name-only onboarding UI (`app/(auth)/name`, reusing `NamePlateForm`) and
  the Profile UI (`app/(guest)/profile`, new `ProfileCard` component wired
  to real Supabase data) out of `/design-preview` into production. `/login`
  is unchanged for existing phone-based users and gains one link to `/name`.
  The localStorage `sofra_user_id` identity model is unchanged. Real
  Supabase Auth, RLS, and a phone-verification onboarding step remain
  explicitly deferred.
- **Known limitation:** the phone-nullable migration file is committed but
  has not been applied to the live database — this sandbox has no
  `SUPABASE_ACCESS_TOKEN` / DB connection string to run it. Until it's
  applied, `/name` submissions will fail at the `phone: null` insert with
  the old NOT NULL constraint. Apply
  `supabase/migrations/20260807000001_make_users_phone_nullable.sql`
  before relying on the name-only path.

## Verification

- Focused preference tests: 107 passed.
- Lint and TypeScript: passed.
- Production build: passed using an isolated output directory
  (`next.config.mjs` now supports `SOFRA_BUILD_DIST_DIR` to route around a
  recurring Windows `.next/trace` EPERM lock from a stale dev-server
  process — same root cause as the pre-existing `.next-task9-build*` cruft
  in the repo root).
- Full suite: 4 pre-existing event-detail invite-test (WhatsApp URL
  encoding) failures, unrelated to this change; 365 pass, including 7 new
  tests for `/name` and `/profile`.
- `scripts/verify-phone-nullable.mjs` (real DB, cleans up after itself) run
  against the live database confirms: duplicate non-null phones are already
  rejected today; null-phone inserts correctly still fail until the
  migration above is applied. Re-run it after applying the migration to
  confirm null-phone uniqueness end-to-end.

## Draft event publishing lifecycle (2026-08-11)

- New events are saved as unpublished drafts and continue into Kitchen before the invite is published.
- A draft-aware Kitchen visit publishes the event and returns to its event page; standalone Kitchen behavior remains unchanged.
- Hosts see drafts under Hosting with a Draft badge. Unpublished events are hidden from invited-event lists, direct non-host views, and RSVP submission.
- Migration: `20260811000003_add_event_publishing.sql` backfills existing events as published, then defaults new events to unpublished.
- Focused event-flow tests: 150 passed. TypeScript and isolated production build passed.
- Local migration application is pending because Docker/Podman is unavailable in the current environment; no remote database was touched.

## Recipe capture review flow (2026-08-11)

- Custom recipes now begin with separate name-only ingredient rows and a general typed/spoken instruction prompt.
- Recipe generation opens a visible quantity/unit/instruction review form and no longer silently persists before host confirmation.
- Focused recipe tests, TypeScript, and the isolated production build pass.
- Recipe capture recommends a base serving count from the current guest count, supports structured import from a pasted recipe, and collapses saved cards to a single View recipe action.
- Generated, pasted, and edited recipe quantities are now deterministically scaled to the seated guests who can eat each specific dish; base servings are no longer user-selectable.

## Kitchen inventory submission (2026-08-11)

- Signature presets and custom dishes now share one card-level action; pantry presets and custom ingredients do the same.
- The per-item Continue, Save ingredient, and Add selected controls were removed.
- Each card says Submit when its saved inventory is empty and Update after inventory exists, while preserving the draft-event Publish Invite action.
- Dashboard event cards display the invitation's uploaded cover image when available and retain the themed artwork as the no-image fallback.

## Public profiles and mutuals (2026-08-12)

- User captions are stored in nullable `users.caption` and editable from the private profile.
- Person names across production event, RSVP, table-intelligence, dashboard, and shared-album views now use linked photo/initial avatars.
- `/profile/[userId]` shows public identity and caption. RSVP history is queried only after the viewer is confirmed as the owner or a mutual through shared `going`/`maybe` RSVP rows; non-mutuals receive a private-history message.
- Mutual relationships remain derived from RSVP data and are not stored separately.
- Event hosts are automatically maintained as `going` RSVP attendees, so their taste profile contributes to menu fit and portion counts. Existing events are backfilled and hosts appear in Around this Sofra with a Host badge.
- Host table preferences are managed from Profile instead of the event preview. Hosts without a taste profile see a dismissible reminder, and mobile invite sharing keeps Copy Link and WhatsApp side by side.
- A preference form opened from Profile says Save Preferences for first-time users and Update Preferences only when a saved taste profile exists; regular attendee flows retain RSVP-specific labels.
- Returning guests see only host-modified canonical questions and newly added unanswered custom questions. Unchanged base questions and previously answered custom questions are not repeated.
- Declined event details label the RSVP as “I have better things to do apparently” without a trailing icon.
- Going event details label the RSVP as “Blessing us with your presence” without a star.
- Profile-photo upload centers its camera affordance and replaces initials on hover/focus over a subtle full-circle burgundy tint.
- Kitchen pantry capture is binary again: quantity/unit controls are removed, and custom dish/ingredient inputs use complete rounded outlines.
- Host event details show a compact taste-preference reminder only when the host has no saved profile, linking directly to the preference form.
- Inactive transparent outline buttons across Sofra share a burgundy hover/focus tint with warm light text; filled and selected states remain unchanged.
- The same outline hover treatment covers the Add Photos upload label, My Table Preferences link, and My Kitchen navigation control.
- Published host events automatically move from Hosting to Hosted after their event date passes; unpublished drafts remain under Hosting.
- Event cards and event-detail date rows include the year so future-year Sofras are unambiguous.

## Menu design chooser (2026-08-12)

- Generate Menu PDF now opens a dedicated four-design chooser before showing a full selected-menu preview.
- Folk Garden, Paper Lace, Garden Stripe, and Red Bloom use print-ready artwork with live event and course text.
- The selected design carries into the existing browser print flow, preserving print and Save as PDF support.
- Printed menus now reuse the preview's guest-facing content, artwork ratio, and safe text insets; operational origin/portion notes no longer collide with the decorative frame.

## Invitation entry experience (2026-08-12)

- First-time shared-link visitors now see an event-name-only invitation landing before the RSVP questionnaire or full event details.
- Each fresh invite landing randomly selects one of four treatments: lace, silver place setting, spotted envelope, or burgundy envelope.
- RSVP responses remain three square postcard controls in one horizontal row on desktop and mobile.

## Guest event link-preview metadata (2026-08-12)

- `app/(guest)/events/[id]/page.tsx` was split into a server `page.tsx` (exports `generateMetadata`) and a new client `EventDetailClient.tsx` carrying all existing interactive logic unchanged, because `generateMetadata` cannot be exported from a `'use client'` file.
- `generateMetadata` does its own minimal server-side Supabase read of `title,tagline,cover_url,is_published` only — never the guest list or address, preserving the locked/unlocked boundary, since link previews render for anyone the link reaches, invited or not.
- `og:title`/`<title>` use the event title, `og:description` falls back to "You're invited to a Sofra." when no tagline is set, and `og:image` falls back to the existing `/design-preview/arabesque-ornament.png` themed artwork (already used elsewhere as the no-cover-photo fallback) when there's no cover photo.
- Unpublished draft events and missing/deleted event ids get a fully generic card ("Sofra Invitation") rather than leaking the real draft title to whoever the link reaches before publish.
- New `lib/site-url.ts` (`getSiteUrl()`) resolves an absolute origin server-side (`NEXT_PUBLIC_SITE_URL` → Vercel's `VERCEL_PROJECT_PRODUCTION_URL`/`VERCEL_URL` → `localhost:3000`) for the fallback image URL and is also wired into `app/layout.tsx`'s new `metadataBase`.
- **Known limitation:** the fallback image (`arabesque-ornament.png`) is a 1254×1254, ~1.6MB PNG designed for in-app artwork, not an optimized ~1200×630 OG image; some link-preview crawlers (WhatsApp in particular) are known to be unreliable with large images. Live-link testing (WhatsApp/iMessage/Facebook Sharing Debugger) after deploy should confirm whether it renders consistently; if not, it should be resized/compressed into a dedicated OG asset.
- Full test suite (614 tests, incl. 6 new `generateMetadata` tests), TypeScript, lint, and an isolated production build all pass with no newly introduced failures.

## Menu RSVP snapshot visibility (2026-08-12)

- Table and Menu show the current count of `going`/`maybe` guests used by deterministic menu planning. Sofra has no invitation roster or expected-headcount field, so the UI intentionally avoids an invented denominator.
- Migration `20260812000003_add_menu_generation_guest_snapshot.sql` adds nullable, non-negative `menus.generated_guest_count`; existing `generated_at` records the latest explicit generation time.
- Successful explicit generation updates both snapshot fields. Existing menus never auto-regenerate, and new responses produce a persistent banner with an explicit Regenerate action.
- Legacy menus with no saved snapshot show current response visibility but no fabricated “generated for” count until their next explicit regeneration.

## Country-aware plate phone input (2026-08-16)

- The existing burgundy plate is unchanged; only its phone input now includes a country-code selector, numeric national-number field, repeating-555 placeholder, live digit counter, and country-aware length validation.
- Submitted/stored phone values are normalized as dial code plus national digits, and Continue remains disabled until the selected country's accepted digit count is reached.

## Shared default event cover (2026-08-16)

- Events without an uploaded cover now use the supplied ivory-envelope and burgundy-wax-seal image across dashboard cards, event headers, RSVP invitations, editable invitation previews, and Open Graph/WhatsApp previews.
- Uploaded event covers continue to take priority. The fallback path is centralized in `lib/event-images.ts` so rendered and social-preview defaults cannot drift apart.
- Event creation/editing no longer shows obsolete fallback-color choices. The default cover crop is biased slightly upward so the wax seal lands lower and centered in wide preview containers.

## Profile history lace artwork cycle (2026-08-16)

- Replaced the plain diamond marker beside profile table-history rows with eight supplied lace artworks.
- The sequence starts with the ivory-on-burgundy treatment, advances by history-row position, and repeats from burgundy after every eighth event on both private and mutual-visible public profiles.

## Event map links (2026-08-16)

- Unlocked event addresses now offer side-by-side Google Maps and Apple Maps links using the saved formatted address; no additional API key is required.
- Map links follow the existing address privacy boundary and are only rendered when the address itself is unlocked.

## OpenStreetMap location autocomplete (2026-08-16)

- The shared host create/edit location field now searches Nominatim after a 450 ms debounce and displays up to five keyboard-accessible suggestions.
- A same-origin `/api/locations/search` proxy supplies the required Sofra `User-Agent`/Referer identification, applies a one-request-per-second process-level queue, caches queries for ten minutes, and times out upstream calls after five seconds.
- Failed or empty searches never block the form: the host's manually typed location remains the submitted value. OpenStreetMap attribution is linked in the suggestion panel.

## Guest-only RSVP readiness (2026-08-16)

- RSVP readiness on Table and Menu now excludes the host while deterministic menu planning continues to include the host's preferences and portions.
- Fewer than three non-host responses shows a burgundy accuracy warning; three or more shows neutral guidance that the host can generate now.
- Removed the implementation-oriented going/maybe explanation. Menu generation snapshots now use the same guest-only count, with migration `20260816000001_exclude_host_from_menu_response_snapshots.sql` normalizing existing snapshots.

## Kitchen preset-picker stale name fix (2026-08-12)

- Root cause: renaming a preset-derived signature (e.g. quick-added "Hummus", then renamed via "Edit a saved signature") only ever updates `name`/`tags`/`contains_allergens`/etc. — never `preset_key`. The "Quick add from presets" grid matches its highlighted/selected state by `preset_key`, which survives the rename, but was rendering the button's *label* from the static preset library name (`p.name`) instead of the live saved row's name, so the picker permanently showed the pre-rename name.
- Fix (`app/(chef)/kitchen/page.tsx`): the preset chip now renders `saved.name` (the persisted signature's current name) when the preset is already saved, falling back to the static `p.name` only when it isn't yet added. Pantry ingredients were separately verified (code review + live reproduction) to already update correctly on rename, since pantry items have no `preset_key` and are matched/rendered by live name.
- Added a regression test in `__tests__/kitchen-page.test.tsx` seeding a preset-derived signature whose name no longer matches its preset, asserting the picker shows the current name and not the stale preset label; confirmed it fails without the fix. Also hardened the test file's Supabase mock (`order()` now returns a fresh array copy instead of the same mutated reference) since the stale reference was silently defeating React's re-render on the previous version of this test.

## Site-wide button hover consistency (2026-08-16)

- Every enabled button in the current Sofra UI now receives the shared burgundy wash with warm light text on hover and keyboard focus; disabled controls remain unchanged.
- The rule is scoped across Sofra v2, production Kitchen/Table/Menu screens, legacy application surfaces, and file-upload labels that visually act as buttons, so newly added controls inherit the interaction without manual selector updates.

## Long-running action transition coverage (2026-08-16)

- The assembling-the-plates transition now has a reusable React overlay and appears after a 180 ms delay, avoiding flashes for instantaneous interactions.
- It covers menu generation/regeneration, menu-design preview artwork loading, print preparation, event draft creation/questionnaire setup, Kitchen loading/saving, and final invite publishing.
- The overlay now sits above every known application layer while preserving the separate horizontal snake and vertical wave animations and the existing reduced-motion behavior.
- The transition uses a high-resolution, continuous reconstruction of the supplied long-table artwork with no baked-in cutoff; the welcome wordmark block has been removed.
- The long-table band now occupies substantially more of the viewport and has a fuller vertical profile instead of reading as a compressed ribbon.

## Shared album cap and slider touch fixes (2026-08-16)

- `validateUploadBatch` (`lib/shared-album.ts`) now checks a new selection against the album's existing photo count, not just the size of the new batch, so uploads across multiple sessions can no longer push a shared album past 20 photos total. `AddPhotosControl` takes a `currentCount` prop, hides the upload trigger once the album is full, and surfaces how many more photos (if any) can still be added. A native OS multi-photo picker can't be capped mid-selection from the web app; this enforces the cap before and after that picker runs.
- The shared `.sv2-slider` thumb (used by the adventurousness slider and custom questionnaire sliders) was 14×14px with no `touch-action`, well under mobile touch-target guidance and prone to the browser mistaking a drag for a page-scroll gesture. Enlarged the thumb to 26px, the control height to 28px, and added `touch-action: none`.
# International phone-country coverage (2026-08-16)

- Replaced the invite phone form's hand-picked selector with comprehensive ISO country and territory coverage, including individually selectable regions that share the `+1` calling code.
- Existing country-specific lengths remain enforced where defined. Other countries use the E.164 15-digit ceiling as a permissive fallback so valid numbering-plan variations are not incorrectly rejected.
# Co-host invitations and shared event management (2026-08-16)

- Original hosts can expand a compact `CO-HOST` action on an event and then copy a unique co-host link or send it through WhatsApp; the sharing controls remain hidden until requested.
- Co-host recipients follow the existing randomized invite landing and phone/name onboarding before event details are revealed. They then accept or reject co-hosting instead of submitting an RSVP.
- Accepted co-hosts see the Sofra in their `HOSTING` tab and receive event edit, questionnaire, table, menu, and recipe access. Only the original host can issue co-host links or delete the event.
- Added tokenized co-host invites, explicit event membership, and an atomic database response function so a link cannot create multiple co-hosts after it has been consumed.
- The co-host landing now explicitly says the recipient is invited to co-host, and its CTA describes opening the co-host invitation. After onboarding, co-hosts see the same invitation artwork and event-detail card as guests, with co-host-specific acceptance copy and the same progressively shrinking three-step rejection interaction.
- Accepted co-hosts are included in the event's `Around this Sofra` roster with the same `Host` badge as the original host, without duplicating a person who also has an RSVP row.
# Draft invitations remain active (2026-08-16)

- Event invite landing pages, onboarding, RSVP submission, dashboard visibility, and social-link metadata no longer reject an event merely because `is_published` is false. Draft status describes host setup progress; it is not an invitation-access boundary.
- The existing `is_published` setup flag now acts only as the Kitchen/inventory readiness gate in menu generation. An incomplete setup returns a clear menu-generation error without disabling invite links or RSVP.
