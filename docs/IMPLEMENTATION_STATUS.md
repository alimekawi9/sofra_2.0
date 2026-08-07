# Implementation Status

## Completed

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
