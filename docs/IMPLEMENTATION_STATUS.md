# Implementation Status

## Completed

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
