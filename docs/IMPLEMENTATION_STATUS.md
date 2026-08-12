# Implementation Status

## Completed

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

## Invitation entry experience (2026-08-12)

- First-time shared-link visitors now see an event-name-only invitation landing before the RSVP questionnaire or full event details.
- Each event receives one stable design from four invitation treatments: lace, silver place setting, spotted envelope, or burgundy envelope.
- RSVP responses remain three square postcard controls in one horizontal row on desktop and mobile.

## Guest event link-preview metadata (2026-08-12)

- `app/(guest)/events/[id]/page.tsx` was split into a server `page.tsx` (exports `generateMetadata`) and a new client `EventDetailClient.tsx` carrying all existing interactive logic unchanged, because `generateMetadata` cannot be exported from a `'use client'` file.
- `generateMetadata` does its own minimal server-side Supabase read of `title,tagline,cover_url,is_published` only — never the guest list or address, preserving the locked/unlocked boundary, since link previews render for anyone the link reaches, invited or not.
- `og:title`/`<title>` use the event title, `og:description` falls back to "You're invited to a Sofra." when no tagline is set, and `og:image` falls back to the existing `/design-preview/arabesque-ornament.png` themed artwork (already used elsewhere as the no-cover-photo fallback) when there's no cover photo.
- Unpublished draft events and missing/deleted event ids get a fully generic card ("Sofra Invitation") rather than leaking the real draft title to whoever the link reaches before publish.
- New `lib/site-url.ts` (`getSiteUrl()`) resolves an absolute origin server-side (`NEXT_PUBLIC_SITE_URL` → Vercel's `VERCEL_PROJECT_PRODUCTION_URL`/`VERCEL_URL` → `localhost:3000`) for the fallback image URL and is also wired into `app/layout.tsx`'s new `metadataBase`.
- **Known limitation:** the fallback image (`arabesque-ornament.png`) is a 1254×1254, ~1.6MB PNG designed for in-app artwork, not an optimized ~1200×630 OG image; some link-preview crawlers (WhatsApp in particular) are known to be unreliable with large images. Live-link testing (WhatsApp/iMessage/Facebook Sharing Debugger) after deploy should confirm whether it renders consistently; if not, it should be resized/compressed into a dedicated OG asset.
- Full test suite (614 tests, incl. 6 new `generateMetadata` tests), TypeScript, lint, and an isolated production build all pass with no newly introduced failures.
