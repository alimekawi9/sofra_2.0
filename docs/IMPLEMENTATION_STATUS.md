# Implementation Status

## Restaurant menu comparison (2026-08-30)

- `Fill Kitchen Myself` and an accepted `Send To A Chef` link now open the same kitchen-type choice first: `Independent kitchen` enters the existing signatures/pantry workspace, while `Restaurant` opens menu extraction and review. Restaurant menus are intentionally not a permanent chef-workspace tab and appear only after Restaurant is selected.
- A host or delegated chef can paste restaurant-menu text or upload one JPG/PNG/WebP menu image or PDF (up to 5 MB). File bytes and the Gemini key remain server-side; Gemini returns only structured dish metadata proposals constrained to Sofra's existing role, tag, and allergen vocabulary. Deterministic sanitization removes unknown values, merges locally inferred allergens, and deduplicates dish names.
- Restaurant extraction reserves a 16,000-token structured-output budget and automatically retries unusually large menus at 32,000 tokens. Concise evidence text keeps the budget focused on complete dish coverage; only a menu that still exceeds the expanded ceiling asks the user to split the source into sections.
- Extracted dishes at 90% or greater model confidence with no stated uncertainty are marked `AUTO-CONFIRMED` and immediately enter the same deterministic scorer. Only low-confidence or explicitly ambiguous dishes enter the required human-confirmation queue; every auto-confirmed dish still exposes an optional correction action. Unconfirmed dishes are never scored.
- Confirmed dishes adapt to the existing `Signature` shape and run through the existing `scoreDish` safety exclusions plus `dinerDishFit`'s 45% protein / 35% flavor / 20% adventurousness preference calculation. The extraction model never ranks or recommends restaurant dishes, and no parallel/RAG recommendation pathway was added.
- Migration `20260830000004_add_restaurant_menus.sql` adds private event-scoped menu/dish records and security-definer RPCs restricted to event managers or the assigned chef. Raw tables have RLS enabled and direct anonymous/authenticated table access revoked. Migration `20260830000005_support_restaurant_menu_pdf.sql` adds PDF as a validated source type, and `20260831000001_add_restaurant_menu_confidence.sql` persists confidence/uncertainty and auto-confirmation state. All three migrations have been applied to the linked Supabase database.
- Focused restaurant-boundary and shared chef-navigation tests, TypeScript, and the isolated production build pass. A live local Gemini text-extraction smoke test returned two canonical proposals and correctly identified the almond dish's nuts/eggs/dairy possibilities. The build retains four pre-existing `no-img-element` warnings in design-preview components.

- Profile now exposes the app-wide production light/dark appearance toggle. Light is the default for new visitors; the selected mode is persisted and restored before paint. Shared production shells, navigation, authentication, event, album, kitchen, Table, and menu-intelligence palettes all consume the same appearance tokens, while invitation artwork and uploaded imagery remain unchanged.
- Dark-mode contrast states keep labels visible on filled and hovered controls, including the appearance switch, event-status filters, album upload action, menu generation/PDF actions, and Kitchen Quick Add selections. Kitchen cuisine, preset, metadata, and allergen chips now use the primary page text token for both their labels and outlines: cream-white in dark mode and burgundy in light mode.
- Location autocomplete results retain a cream suggestion surface with burgundy result text in dark mode, and the questionnaire save action uses explicit contrasting foreground/background pairs on hover and keyboard focus.
- Host edit submit and delete-event controls now use explicit inverse hover/focus colors in both themes, preventing `UPDATE INVITE` and `DELETE EVENT` labels from blending into their button surfaces.
- The final catch-all interactive hover rule now uses the same paired foreground/surface tokens as component-specific states. This keeps file controls such as `Choose a cover image`, including their nested icon and helper copy, readable in both themes and prevents later CSS from undoing earlier contrast fixes.
- Filled hover/focus states retain a visible inverse-color border instead of matching the fill and visually losing their outline.
- The cover-image chooser has its own visible dashed resting border and a two-pixel gold border plus focus ring during hover/focus, independent of shared button styling.
- Table ranking summaries now translate ordinal results into a clear winner or an explicit tie and show first-choice votes instead of unexplained average-position numbers. Choice summaries show counts against the response total.
- Table includes an AI planning-recommendations section generated from aggregate dietary, preference, atmosphere, timing, and event-specific survey context. Guest names are removed from the aggregate profile sent to Gemini, written responses are treated as untrusted data, and the advice is explicitly separated from menu generation.
- Phone login country picker now includes the complete country/territory list ordered alphabetically by English country name and uses an explicitly downward-opening menu.

## Completed

- Co-host invitation URLs now always open their dedicated “You are invited to co-host” artwork before asking a logged-out recipient for identity; phone login begins only after the recipient chooses to view the invitation.
- Kitchen delegation and composed event updates now expose Copy and WhatsApp choices through compact, collapsed share popovers instead of permanently occupying the page with multiple share buttons.
- Event Details now proactively alerts hosts and co-hosts after the date, time, location, or Shared Album photos change. Each reminder names only the fields that actually changed and shows their current value (for example, `Time changed to 7:30 PM`), rather than using a generic date/time/location message. The reminder can open the matching prefilled update composer or be dismissed, and its shared database state survives navigation and devices.
- Canonical event links once again remain invitations for authenticated new
  guests: they show the locked event preview and continue into the existing
  RSVP flow without an access request. The Request Access path is reserved for
  direct shared-album visits by logged-in accounts that are not event members;
  non-member chat visits return to the invitation instead.
- The event community switch renders unread Chat counts in a compact circular
  badge, with inverse colors when the Chat tab is active.
- Kitchen delegation actions now use the same themed burgundy/cream palette,
  uppercase sans-serif typography, pill shape, and inverse interaction state
  as the rest of the production Kitchen interface.
- Kitchen Quick Add controls now separate category filters from their dish or
  pantry-item subjects. Categories occupy a compact horizontal strip, while
  subject chips initially show only a few rows in a keyboard-accessible
  vertical scroller instead of expanding both inventory cards indefinitely.
- Invite-survey range controls now emit live input updates during a drag and
  reserve only horizontal touch gestures for the slider, restoring reliable
  mobile interaction while preserving vertical page scrolling.
- Canonical guest invitation links once again begin with the randomized
  envelope/place-setting artwork and a YALLA action. YALLA continues to login
  when identity is missing and then opens RSVP; returning guests, hosts,
  co-hosts, and delegated chefs still bypass guest onboarding as appropriate.
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
- Kitchen custom signature and pantry creation now automatically show Gemini-assisted metadata suggestions after the user pauses while typing the item name. Suggestions are constrained and revalidated against Sofra's canonical tag/allergen vocabularies, pantry roles are stripped at the API boundary, locally inferred name allergens are merged in, and the user must review/adjust the selected chips before the existing submit/update action persists them. A failed suggestion reveals the same manual controls instead of blocking inventory entry.
- The pantry submit label now derives from the complete pending selection rather than visible/filter state, so any selected ingredient immediately replaces `I LITERALLY HAVE NOTHING` and remains authoritative after filtering or scrolling it out of view. The pantry preset list now scrolls with the page instead of using a nested mobile overflow region that could defer repainting outside the list.
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
# Undecided event dates (2026-08-16)

- Event creation and editing now offer an explicit `Date undecided` option alongside the existing date/time picker.
- Undecided dates persist through a centralized sentinel and render as `Date undecided` / `Time undecided` across event dashboards, guest RSVP previews, co-host previews, and event details instead of appearing as an arbitrary date.
# Explicit empty inventory choice (2026-08-16)

- Signatures and pantry each provide a compact `CLEAR ALL` action beside their preset heading. Clearing remains staged until the relevant submit action is pressed.
- The former large empty-pantry control was removed. When the effective pantry selection is empty, the existing submit button reads `I LITERALLY HAVE NOTHING` and persists that intentional empty state.
- Pressing Pantry `CLEAR ALL` immediately renders every saved and pending ingredient chip as unselected, while database deletion remains deferred until the empty-pantry submit action is pressed.
- Saved pantry ingredients use the same explicit selected-chip colors as newly selected presets, preventing labels from disappearing into the burgundy background until hover.
- Choosing or typing an ingredient automatically exits the empty-inventory state, keeping the two states mutually exclusive.

# Fully editable event questionnaires (2026-08-16)

- Hosts can edit the guest-survey headline, remove any question, remove individual answer choices, and change any question between one answer, multiple answers, short text, and slider formats.
- Multiple-answer questions retain a host-controlled maximum selection count. Converting a Sofra profile question into another format makes it a custom event question so fixed taste-profile fields are never populated with incompatible response data.
- Removed Sofra questions and choices are omitted from both the live preview and the real guest questionnaire, including saved surveys with no canonical questions remaining.
- Ranking is available as a question type. Guests order every option with accessible up/down controls, responses persist as ordered option IDs, and hosts see the aggregate order ranked by average position in table insights.
- Guest and preview rendering now honors the saved order across both Sofra profile questions and custom questions, so a ranking question placed first remains first.
- Returning hosts are prompted to answer customized canonical questions and any unanswered event-specific questions, using the same event questionnaire response checks as returning guests.
- Table intelligence hides fixed topic cards when their source question was removed. Lightweight semantic matching preserves a topic only when a host-written question clearly covers the same concept; unrelated custom answers remain in the type-appropriate event-specific summaries.
- Host preference-only mode never creates an RSVP or exposes RSVP choices. Back returns directly to host event details, and event-specific follow-up questions omit the `Pulled from your profile` badge.
- The linked Demo Host event is seeded with a fully custom four-question survey and deliberately unbalanced event-specific answers for the host and eight demo guests, allowing Table insights to demonstrate a clear majority rather than artificial ties.

# Profile caption editing (2026-08-16)

- Saving an About Me caption locks the text field and changes the action to `EDIT CAPTION`; editing must be explicitly re-enabled before the caption can change again. Existing saved captions load in the same locked state.
- Profile history formats venues as `date at location`, and each Sofra title is an interactive control that opens its event page.
- Long survey answer choices span the full checkbox-grid width instead of wrapping inside one narrow column while the neighboring column remains unused.
- Cover-image `REPLACE` and `REMOVE` controls now use Sofra's rounded pill shape consistently in event creation and editing.
- Co-host invitation URLs now emit their own Open Graph and large-image social metadata using the event cover image, with the standard Sofra cover as fallback.

# Consistent long-table transitions (2026-08-16)

- Every long-table loading transition uses the shared `SofraTransition` presentation. The artwork now preserves its native 3:1 proportions at every viewport size rather than compressing horizontally on phones.
- The transition waits one full second before appearing, so operations that complete in under one second never flash a loading preview.
- On generated menus, the `Generated for X guests` snapshot badge now follows the new-response/regenerate notice so the current-response change is explained before the older generation snapshot is shown.

# Event chat (2026-08-17)

- Event Details now places an event-scoped `CHAT` view directly beside the existing Shared Album view. The album remains the default, preserving its existing layout and behavior.
- Hosts, co-hosts, and guests with an RSVP row can read and send persisted messages. Every message includes the sender's linked profile photo/name and timestamp; the current user's messages use an inverse background and align separately from everyone else's.
- Chat history is ordered chronologically, capped to the latest bounded query, refreshable after errors, and subscribed to Supabase inserts for live updates while the event is open.
- The `event_messages` migration is applied to the linked database with Realtime enabled. RLS remains disabled under the explicitly accepted anonymous-access MVP model, so true database-enforced event membership remains future security work.
- Event Details now mirrors the Shared Album interaction: the adjacent `CHAT` view previews only the latest three messages and opens the complete conversation on `/events/[id]/chat`. The dedicated page owns message composition and the full live history, and all visible headings use the concise label `Chat`.
- The number beside `CHAT` is a per-user unread count, excluding the current user's own messages. Opening the full chat records it as read, and incoming messages received while the full chat remains open are immediately read, so the badge disappears on return.

# Delegated Kitchen setup (2026-08-18)

- Event creation now explicitly offers `FILL KITCHEN NOW`, `FILL IN LATER`, and `SEND TO A CHEF`. Kitchen readiness is stored independently from invitation publishing, so choosing either deferred option opens the event without requiring inventory.
- In `Set the Sofra`, original hosts see two matching actions: `FILL KITCHEN MYSELF` and `SEND TO A CHEF`. The latter reveals copy and WhatsApp sharing only after it is selected; it no longer appears on Event Details. Choosing self-fill clears any prior chef assignment, while the one-time chef link assigns its accepting account after the existing phone/name onboarding.
- Assigned chefs are restricted in the visible workflow to Kitchen, Drafted Menu, and Recipes; Table, general Kitchen, and the global production navigation are omitted. Menu and recipe APIs now recognize the assigned chef as an authorized collaborator.
- Submitting the event Kitchen marks it complete. Attempting generation while it is pending shows a warning first, offering either Kitchen setup or an explicit inventory-free continuation; the API independently enforces the same confirmation handshake.
- Migration `20260818000001_add_kitchen_delegation.sql` is applied to the linked Supabase project. Its chef-invite table follows the explicitly accepted MVP anonymous-access model with RLS disabled; database-enforced identity remains future security work.
- Chef invitations no longer collect a phone number. A new chef supplies only a name, while an existing local session accepts immediately. Kitchen, Drafted Menu, and Recipes share the Drafted Menu navigation width and remain available throughout the delegated workflow.
- Recipes now include a `PRINT RECIPES` action. The print stylesheet omits navigation and editing controls, printing only completed recipe content with browser print/PDF support.
- The shared chef-workspace header now owns its typography and tab styling directly. Kitchen, Drafted Menu, and Recipes all use the Drafted Menu shell width, large Sofra wordmark, uppercase tabs, spacing, and active underline without page-specific selector overrides.

# Semantic menu deduplication (2026-08-18)

- Final menu validation now uses deterministic culinary text normalization, modifier removal, stemming, recognized base-dish terms, and structured core-ingredient overlap instead of comparing only complete dish names.
- Variants such as `Smoky Mushroom Polenta` and `Sumac Marinated Polenta` are one core dish. Semantic duplicates receive priority repair and become blocking errors if the two-attempt repair budget cannot remove them, so they are never persisted as a supposedly valid menu.
- Generated-dish scoring metadata now persists with each menu course and is reused after reload. Composed dishes are scored once as complete dishes rather than requiring every raw pantry ingredient to independently prove vegan/vegetarian/no-pork compatibility; component names and declarations are still unioned for allergen safety, including inference such as almonds → nuts.
- Migration `20260818000002_persist_generated_dish_scoring.sql` is applied to the linked Supabase project.
- Ingredient safety is centralized in `lib/ingredient-safety.ts` and shared by proposal validation, persisted menu re-scoring, recipe imports, and recipe warnings. It recognizes the complete canonical allergen set, reconciles all declared and missing ingredients, and deterministically removes contradictory vegan/vegetarian/no-pork claims instead of trusting an LLM label.

# Sharing, chat counts, and co-host history (2026-08-18)

- Sofra's supplied table logo is now the site favicon (including a real multi-size `/favicon.ico` for browser search/history), Apple touch icon, and default social-sharing image.
- Chat unread values are normalized to a non-negative integer both when calculated and when rendered, so the tab can never display a negative badge.
- Shared-Sofra membership now includes qualifying guest RSVPs, original event hosts, and accepted co-hosts. Co-hosting the same event unlocks each person's public history, and hosted/co-hosted events appear in that history even without an RSVP row.

# Static event date and time (2026-08-21)

- Event date/time values are now floating wall-clock values: the date and clock time entered by the host are stored without applying the host device's timezone and rendered without applying a guest device's timezone.
- Guest invitation details, RSVP and co-host flows, the events board, profiles, event-update messages, Kitchen/Table/Menu/Recipes headers, and printable menu output all use the centralized timezone-invariant event formatter.
- Event editing restores the exact stored wall-clock value to the date/time input. Chat messages, album activity, and other real timestamps remain timezone-aware.

# One-time RSVP and role-aware link entry (2026-08-21)

- Invite-mode login now honors an identity already stored on the same device and returns to the complete requested internal URL, including co-host/Kitchen tokens and subpage query parameters.
- Canonical event links resolve database-backed membership before navigation: hosts and accepted co-hosts open event details, assigned chefs open delegated Kitchen, guests with any existing RSVP open event details, and only ordinary guests without an RSVP enter the RSVP flow.
- Opening `/rsvp` again with an existing RSVP returns to event details. The explicit `Edit RSVP` action adds a dedicated edit intent and remains available without creating a second RSVP row; the database uniqueness constraint and upsert continue to enforce one row per event/user.
- Co-host and Kitchen invitation links bypass RSVP entirely. Revisiting an accepted assignment opens the appropriate event or Kitchen workspace even after its one-time invitation token has been consumed.
- Accepting co-host status supersedes any earlier guest RSVP for role, access, dashboard placement, roster badges, and guest/host counts. The RSVP row remains only as attendance and preference data, preventing promotion from erasing the person's dietary answers.
- Direct Album and Chat links preserve their destination through login. Authenticated non-members enter RSVP once, while existing guests and event managers continue directly to the requested page.
- RSVP lookup errors fail closed and show an error instead of treating an uncertain result as a missing RSVP.
- Event-update messages now use explicitly marked update links. After login, existing guests, hosts, co-hosts, and assigned chefs continue without RSVP; a non-member sees a membership error and is never routed into RSVP. The same rule applies to Shared Album links sent in photo updates.
- Phone login now considers canonical international, digits-only, national, and leading-zero legacy variants. If multiple accounts share those equivalent forms, an event link selects the account that already belongs to that event instead of creating or choosing a duplicate identity.

# RSVP preview identity cleanup (2026-08-21)

- The RSVP preview no longer renders a fallback-initial badge beside the same guest's name. Existing profile photos remain visible, while guests without photos appear once by name.
- The invitation heading now renders `YOU'RE INVITED TO` with a real apostrophe instead of exposing the HTML entity text.

# Profile preferences and image framing (2026-08-21)

- Every signed-in user can open `EDIT MY PREFERENCES` from the Profile preference card. The standalone `/profile/preferences` editor loads and updates the shared taste profile without requiring the user to host an event, possess an RSVP, or answer event-specific questions.
- New profile photos open a square crop editor before upload. New and replacement Sofra cover images open a widescreen crop editor. Both provide zoom, horizontal positioning, vertical positioning, and reset-to-center controls, then bake the selected framing into the uploaded image.
- Shared Album upload controls visibly state `Maximum 20 photos per upload.` before the device photo picker is opened; the existing validation still rejects oversized selections.

# Mobile menu and recipe printing (2026-08-21)

- Menu printing no longer depends on a delayed popup window. The selected design prints directly from the already-loaded on-page preview, preserving the user gesture required by mobile Safari and embedded browsers.
- Menu frames render as real image elements rather than optional CSS print backgrounds, so mobile print/PDF output retains the selected artwork.
- Recipes now open a visible, dedicated print preview before invoking the native print sheet. Both previews include an iPhone/iPad fallback directing users to the browser Share menu and `Print` when an embedded browser suppresses `window.print()`.

# Host form validation placement (2026-08-21)

- Create/Edit Sofra validation errors now have one consistent location directly beneath the form's final `CONTINUE` or `UPDATE INVITE` action instead of appearing midway through the form beside questionnaire customization.

# Dark menu contrast and export hierarchy (2026-08-21)

- The Table and Drafted Menu response-progress card now uses a high-contrast cream surface with burgundy text in dark mode, and the Hard Limits warning label uses a visible gold treatment.
- Menu printing remains hidden until a generated draft exists. Once available, `PRINT MENU` uses the same styling and top-right header placement as `PRINT RECIPES`.
- The separate “current menu has not changed” response alert and its duplicate Regenerate action were removed; regeneration is available only through the draft's primary Set the Table/Regenerate control.
- The empty Recipes state no longer exposes a redundant “Could not load recipes” message. The empty Drafted Menu table illustration now has a genuine transparent background, retaining its full-color appearance over both light and dark themes without a white box or blend-mode blackout.
- Secondary recipe actions such as `GENERATE RECIPE` and `PASTE A RECIPE` now permanently use their high-contrast filled treatment instead of revealing readable contrast only on hover.
- On Shared Album pages at every screen size, `SELECT` and `ADD PHOTOS` stay side by side and align along the same top edge; the 20-photo upload note remains beneath Add Photos without shifting either action.

# Event album sharing previews (2026-08-21)

- Shared Album URLs now publish event-specific social metadata, using the Sofra's uploaded cover image and event title instead of inheriting the site's default logo preview.
- Newly composed event-update links include a harmless per-session preview version so messaging apps fetch the current event image rather than reusing a previously cached preview for the same URL.

# Sofra x Moga account reconciliation (2026-08-21)

- A data audit found phone-normalized login accounts separated from the phone-less historical user IDs that owned Sofra x Moga RSVPs and preferences.
- Migration `20260821000002_reconcile_sofra_x_moga_guest_accounts.sql` atomically reconnects seven uniquely supported matches (Hassan, Seliem, Nour, Mona, Layla, Lujain, and Hussein), retaining original RSVP history and richer preferences while preserving the normalized account currently used on guests' devices.
- The migration deliberately leaves 17 unmatched or ambiguous historical attendees unchanged pending phone confirmation; it does not infer identity from a loose name similarity.
- Migration `20260821000003_attach_confirmed_sofra_x_moga_phones.sql` applies the host-confirmed second batch: six historical accounts receive their international numbers in place, El Os/Os consolidate into the existing Osama Soliman phone account, and the confirmed Ellabban duplicate is removed from Hassan's account history.

# Host-approved event access requests (2026-08-21)

- A signed-in person who follows a private Sofra link without already being a host, co-host, assigned chef, or RSVP guest now sees a dedicated `REQUEST ACCESS` screen instead of entering RSVP immediately. Logged-out visitors first complete the existing login flow and return to that screen.
- Requests are persisted once per event and account. Pending requests appear as notifications on the host/co-host events board and as an approval list on Event Details, including the requester's profile identity.
- Hosts and accepted co-hosts can accept or reject each request. Acceptance grants entry to the normal RSVP flow; it does not invent an RSVP response on the requester's behalf. Rejection leaves the event private and permits a later re-request.
- Direct RSVP, Album, and Chat routes enforce the same membership gate, while existing RSVP guests and event managers retain their role-aware bypasses.
- Stale or deleted event URLs no longer expose Supabase's single-row coercion error during local development. They remove the obsolete pending-invite entry and return the viewer to `Your Sofras`; genuine database failures still retain the retry error state.
- Migration `20260821000004_add_event_access_requests.sql` adds the request records and bounded security-definer functions under the current local-identity MVP model. RLS stays enabled, the table grants no direct anonymous reads or writes, and requester/manager views are exposed only through scoped functions. True database-backed authentication remains future security work.

# Hard-limit presentation cleanup (2026-08-24)

- The Table view now presents allergy and dietary hard-limit labels as plain text without the red no-entry emoji. The existing `MUST NOT VIOLATE` heading continues to communicate their severity without decorative symbols.

# Host event-page hierarchy redesign (2026-08-26)

- Host Event Details now follows the compact production Figma hierarchy while retaining Sofra's existing typography, palette, uploaded/default cover artwork, and role-aware behavior.
- Invite sharing is consolidated behind one `Invite` popover containing Copy Link, WhatsApp, and Send Update actions. Co-host sharing remains collapsed behind its own top-level control.
- Event facts and the full guest-management roster are collapsed into accessible disclosure summaries, reducing initial page density without removing maps, custom details, host/co-host badges, or guest-removal controls.
- Set the Sofra and Edit Event are now paired primary actions near the event title. Past events continue to suppress editing.
- Shared Album and Chat retain their existing segmented control and data behavior; populated albums continue to render their current photo-tile preview and overflow count inside the redesigned album card.
- The collapsed guest summary prioritizes attendees with uploaded profile photos in its three visible avatar slots while preserving the existing roster order everywhere else.

# Explicit connections and Arrange the Table (linked database, 2026-08-29)

- The former automatic shared-attendance mutual gate has been removed from application code. Public dining history now unlocks only after an explicit connection is accepted; shared attendance establishes request eligibility but does not itself expose history.
- Pending connection requests appear on the recipient's Profile with accept/decline actions. A declined request has a two-day cooldown before either eligible participant may request again. Existing derived mutual pairs are backfilled as accepted connections by migration `20260828000001_add_connections.sql` so the privacy change does not unexpectedly remove previously available history.
- Connection eligibility includes going/maybe guests, original hosts, and accepted co-hosts who share a Sofra. The connection table has one canonical row per unordered user pair and preserves its required originating-event provenance even if that event is later deleted.
- The host/co-host-only `Arrange the Table` page is linked from inside the Set the Sofra workspace, immediately beneath its Kitchen/Table/Menu/Recipes navigation rather than adding another action to Event Details. It renders exactly one chair per participating person: going and maybe RSVPs are included; original hosts and co-hosts are included by default and may individually opt out or back in. An odd participant count creates one head seat, while an even count uses equal seats along both sides.
- Seating recommendations lexicographically prioritize accepted-connection adjacency, pending-request proximity, then prior shared attendance. The existing 45% protein / 35% flavor / 20% adventurousness affinity is used only after those relationship signals; shared dietary/allergy service needs are the weakest placement tiebreaker. Maybe attendees remain visibly highlighted.
- Either participant in an accepted connection can now explicitly unconnect from the other person's public profile. The action requires an inline confirmation, immediately re-locks mutual-gated profile history, leaves RSVP/co-host/shared-event records untouched, and transitions the connection into the existing two-day declined-request cooldown before a new request can be sent. Migration `20260830000003_add_disconnect_connection.sql` was applied to the linked database on 2026-08-30.
- Hosts can drag chairs to swap guests or use the touch/keyboard-friendly select-one-then-another interaction. Layouts persist with optimistic version checks so concurrent co-host edits cannot silently overwrite each other. Refreshing the recommendation remains an explicit host action.
- Seating export opens a Sofra-styled print/PDF preview and lists seats clockwise starting at the head when one exists. Names and RSVP uncertainty are included by default; private dietary/allergy service notes are opt-in and carry a sharing warning.
- Migration `20260828000002_add_event_seating.sql` stores manager participation choices and persisted layouts, and exposes bounded manager-only functions under the current local-identity MVP security model. Migrations `20260828000001_add_connections.sql` and `20260828000002_add_event_seating.sql` were applied to the linked Supabase database on 2026-08-29. Applying the connections migration also completed the one-time backfill that converts every legacy derived-mutual pair into an accepted connection; new relationships now require an explicit request and acceptance.
- Until those migrations are applied, a missing PostgREST connection RPC no longer blanks public or personal Profile pages. Profiles render normally with history locked and a scoped connection-unavailable notice; unrelated database errors continue to fail visibly.
- Arrange the Table now automatically retries bounded transient PostgREST schema-cache, network, and concurrent-layout refresh failures during initial entry, so a short-lived first request no longer requires the host to press Retry manually. Terminal permission and data errors still fail visibly.
- The seating canvas now owns its horizontal overflow instead of allowing the app shell to leak. Its table, opposing seat rows, and optional head seat are centered as one symmetrical composition with equal reserved space on the left and right, including responsive layouts.
- The seating editor now presents a smaller `Recommended Seating Arrangement` heading and an unlabelled tabletop. Its export action is a compact icon in the header's top-right corner, keeping chart controls out of the primary action row. One real drop position exists at each head, while additional side positions support Centered, Corners, Head Seats, and fully custom spreads. Empty positions reveal on hover, drag, keyboard focus, or touch selection, and moving into one leaves the previous position open rather than forcing a swap.
- The complete table always remains within the page width. Small and medium parties use the horizontal long-table treatment; mobile layouts and parties above eight rotate it vertically and extend down the page so profile labels retain a readable minimum size without horizontal clipping. A compact Seat Spread control now sits directly beneath the table, offering Centered, Corners, and Head Seats arrangements without exposing recommendation-engine reasoning in the interface.

# Shared playlist and planning emphasis (2026-08-29)

- Event Details now adds `THE VIBE` as a third community tab beside Shared Album and Chat. It reuses the same segmented switch, unlocked host/co-host-or-RSVP membership boundary, card treatment, `ProfileIdentityLink`, and `AlbumAvatar` identity system rather than introducing a parallel community surface.
- Playlist suggestions use one freeform `song` value such as `Levitating — Dua Lipa`, since this phase deliberately has no Spotify, Apple Music, or other streaming integration. Everyone inside the Sofra can see the complete chronological list and contribute up to three songs; automatic streaming-playlist creation remains a future enhancement.
- Migration `20260829000001_add_playlist_suggestions.sql` adds `playlist_suggestions` and a concurrency-safe database trigger enforcing three suggestions per user/event. It was applied to the linked Supabase database on 2026-08-29 and verified in the remote migration ledger. The UI performs the same validation immediately, reports `0 of 3` through `3 of 3`, and removes its input at the cap. The table follows Chat/Album's existing anonymous-MVP application-access posture; production authentication/RLS remains separate security work.
- The earlier freeform-only phase is now superseded by Spotify-backed autocomplete. A server-only Client Credentials wrapper and internal `/api/spotify/search` route return normalized track choices without exposing Sofra's Spotify credentials or OAuth token to the browser. Failed and no-match searches still permit manual freeform entry.
- Migration `20260829000002_add_spotify_track_id.sql` adds the backward-compatible nullable Spotify identifier and was applied to the linked Supabase database on 2026-08-29. Selecting a result stores clean title/artist text plus `spotify_track_id`; manual entries store a null ID. Live autocomplete requires server-only `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` deployment variables.
- Host-only live Spotify export uses Authorization Code OAuth with `playlist-modify-private`, resumes the export after authorization, resolves manual suggestions through a final text search, creates a private playlist, and visibly lists anything it could not match. OAuth tokens are AES-256-GCM encrypted and stored in the RLS-enabled `spotify_connections` table, which has no anon/authenticated grants or browser policies and is accessed only with the server-side Supabase service role.
- Migration `20260829000003_add_spotify_connections.sql` was applied to the linked Supabase database on 2026-08-29 and verified in the remote migration ledger. Live search/export still requires `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, and (for OAuth export) `SPOTIFY_TOKEN_ENCRYPTION_KEY` in each running environment; missing search credentials produce a clear manual-entry fallback instead of blocking contributions.
- Spotify refresh tokens are not treated as permanent. If Spotify returns `invalid_grant` after its current six-month authorization lifetime, Sofra removes the unusable encrypted connection and sends the host through authorization again on the next export attempt.
- A suggester can remove their own song, and event managers (the original host or an accepted co-host) can remove any suggestion. The UI applies those role checks consistently and removes a successful deletion immediately; this follows the playlist table's explicitly accepted anonymous-access MVP posture until production authentication can enforce identity at the database boundary.
- Every member who can view The Vibe can download a complete UTF-8 `Artist – Title` text list. This is the zero-cost universal handoff format; it is intentionally not described as automatic Apple Music catalog import because title-only files cannot resolve playable Apple catalog tracks without MusicKit. Live Apple Music export remains deferred in the decision log.
- Sofra's Gemini planning output now includes exact `actionHighlights` and `reasonHighlights` selected through the existing NLP call for concrete dates, times, quantities, option names, people, and places. The server discards phrases not actually found in their matching text, and the Table renderer uses React text/`strong` nodes rather than injecting model-produced HTML.

# Guided Sofra creation (2026-08-31)

- Creating a Sofra is now a four-stage guided flow: Details, Look, Guest questions, and Kitchen, instead of one long form. A persistent step label and segmented progress bar show where the host is and how much remains.
- The Guest questions stage now makes all three supported choices explicit: use Sofra's five curated questions with an inline preview, open the full questionnaire editor to customize them, or create the event with no guest questions.
- Choosing no questions persists an intentionally empty event questionnaire so the RSVP flow does not fall back to defaults. Choosing customization creates the event once, opens the existing full editor, and resumes the selected kitchen path after the questionnaire is saved.
- Back navigation between creation stages retains all entered details and the cropped cover image in memory. Required event details are validated before the host can leave the first stage.
- Hosts may explicitly leave the location undecided during creation, matching the existing undecided date treatment; the event stores no fabricated venue or address and displays the existing pending-location fallback.
- Completing creation now lands on the finished Sofra rather than immediately opening the kitchen-type chooser. The restaurant versus Home / other choice appears only when Kitchen is explicitly opened, eliminating the transient kitchen screen during creation.
- Wizard Back and Continue actions share the page's centered pill treatment, with a restrained outline Back action and the existing filled primary Continue action.

# Host event prep checklist (2026-08-30)

- Host Event Details now includes a compact, collapsible prep checklist organized into Weeks out, 1–2 weeks out, Day of, and After. Required items produce gold attention alerts at 14 days, 7 days, and 48 hours respectively, and pre-event alerts stop once the event has passed. The one deliberate optional exception is private Sofra feedback: it alerts after the event until that host submits it; all other optional items remain non-alerting.
- Completion is derived from real event data wherever possible: concept copy, guest/budget estimates, venue, a drafted menu, The Vibe suggestions, and Shared Album photos. Invites, dietary review, timing, seating, and unsupported optional planning tasks use persisted manager confirmations and optional notes.
- Every item leads to its actual management surface. Event fields deep-link to the relevant edit section, playlist and album items open their existing tabs, and menu, Table intelligence, and seating use their existing pages. Photo reminders reuse the existing event-update composer and its photo template.
- Event editing now includes optional estimated guest count and budget fields. Migration `20260830000001_add_event_prep_checklist.sql` adds those fields, manager-only checklist state RPCs, and private Sofra product feedback storage; it was applied to the linked Supabase database and verified in the remote migration ledger.
- Optional post-event Sofra feedback is available to hosts and attending guests. Feedback is never selected back into the client or displayed to hosts, co-hosts, or guests; clients receive only a scoped boolean indicating whether their own response exists. Once an event's wall-clock date/time has passed, an attending guest must submit this private feedback before viewing or adding Shared Album photos. Event Details retains a blurred photo preview and the direct Album route independently enforces the same gate without fetching album rows; original hosts and accepted co-hosts remain exempt.
- The required Timing Schedule item now opens a dedicated host/co-host page instead of an inline note. It seeds editable Drinks, Starters, Mains + sides, and Dessert moments from the event's static wall-clock start time, renders them as a vertical timeline, permits up to 30 custom moments, and sorts saved entries chronologically.
- Saving a real timing schedule persists it through manager-scoped RPCs and completes the matching prep item atomically. Migration `20260830000002_add_event_timeline.sql` was applied to the linked Supabase database and verified as the sole pending migration before application.
- The Event Details and Event Prep disclosure controls use the same minimal horizontal-line indicator, eliminating the mismatched arrow glyph sizing and alignment.
- The optional 1–2 weeks prep item previously labeled Signature drink is now presented as Custom name tags; its internal persistence key remains unchanged so existing completion state is preserved.

# Restaurant menu reuse (2026-09-03)

- Typing a restaurant name on the restaurant-menu review page (`/events/[id]/out`) now searches for a close match against every restaurant menu in Sofra that already has at least one human-reviewed dish, using deterministic `pg_trgm` trigram similarity rather than an LLM call. A match surfaces a small suggestion under the name field; accepting it copies that restaurant's confirmed dishes straight into the current event, already marked confirmed, with no AI extraction call and no re-review needed.
- The match is intentionally anonymous and system-wide: it never reveals which other host or event the reused menu came from, and it is not limited to events the current user manages. Only dishes with `review_status` of `confirmed` or `auto_confirmed` are ever eligible to be reused.
- `restaurant_menus.source_type` gains a fourth value, `'reused'`, rendered as `REUSED MENU` alongside the existing `PASTED MENU` / `UPLOADED PDF` / `UPLOADED MENU` labels via the new shared `restaurantMenuSourceLabel` helper in `lib/restaurant-menu.ts`.
- Migration `20260831000002_add_restaurant_menu_reuse.sql` adds the `pg_trgm` extension and two new `security definer` functions, `search_similar_restaurant_menu` (anonymous, read-only, global) and `reuse_restaurant_menu` (still gated by the existing per-event `can_access_event_restaurant_menus` check, same as every other write to this table). It was applied to the linked Supabase database and verified in the remote migration ledger.
- `scripts/verify-restaurant-menu-reuse.mjs` (real DB, cleans up after itself, following the existing `verify-*.mjs` convention) exercises the migration's security-sensitive claims end to end — the 3-character minimum, unconfirmed-only menus being ineligible, typo matching, recency tie-breaking, that the search result never exposes `created_by`/`event_id`/`reviewed_by`, and that `reuse_restaurant_menu` rejects a caller without access to the destination event. Run against the real database on 2026-09-04: all 14 checks passed.

# Host entry plate transition (2026-09-04)

- Visiting `/host/new` now shows a new intro screen first: a centered silver plate on a fixed burgundy background, captioned "Ready to host your own Sofra?" with a fork and knife flanking it. It shows on every visit — there's no "seen it once" persistence — and only appears after the existing logged-in-identity check already passes.
- Clicking the plate plays a true shared-element transition (via the new `framer-motion` dependency's `layoutId`) into the existing, otherwise-unmodified four-step Create-a-Sofra wizard: the plate's position, size, and shape animate directly into the wizard's own card container, while the card text/cutlery fade out and the background crossfades from burgundy to the wizard's actual page background.
- `HostCreateForm` gained one new optional prop, `shellLayoutId`, used only by `/host/new` to make its shell element a Framer Motion shared-layout target; `/host/[id]/edit` never passes it and is unaffected. Both the plate's `layoutId` and `HostCreateForm`'s `shellLayoutId` derive from one shared exported constant, `HOST_ENTRY_SHELL_LAYOUT_ID` (in `HostEntryPlate.tsx`), rather than duplicated string literals.
- A `prefers-reduced-motion` user gets an instant transition instead of the morph, via `MotionConfig reducedMotion="user"` wrapping both the plate and wizard branches in `/host/new`.
- **Known limitation:** the actual animation (shared-element morph proportions, timing, and visual appearance in a real browser) has not been visually verified in this environment — there is no Playwright/chromium-cli tooling available here. A structural check (dev server + curl) confirmed the route serves successfully and the plate's expected markup is present, but the transition itself needs a real browser check before considering this fully done.

# Kitchen scroll transition and unified submit (2026-09-06)

- The Kitchen page's Signatures and Pantry sections now share one sticky scroll frame: scrolling from one
  into the other plays a Framer-Motion-driven crossfade (position/size held in place, opacity swaps) instead
  of the two sections just being stacked one after another. The currently-invisible section is also made
  non-interactive (`pointer-events: none`), hidden from assistive technology (`aria-hidden`), and unreachable
  by keyboard (native `inert`, set imperatively via refs since it isn't yet typed on JSX by this project's
  `@types/react` version) — so it can't silently intercept clicks, get announced, or be tabbed into while
  invisible.
- One shared submit button, positioned after the Pantry section, now saves everything from both sections in
  a single action — new/removed signature selections, new/removed pantry selections, any newly-typed custom
  dish or ingredient, and the existing kitchen-completion/invite-publish step. The two separate per-section
  submit buttons are gone. The submit batch is tagged per-operation so a partial failure (e.g. the pantry
  side commits but a signature op fails) refreshes from the database and only leaves the genuinely-failed
  operations pending for retry, instead of risking duplicate inserts if the whole batch were blindly
  resubmitted.
- Removing a saved pantry ingredient is now staged, matching how signature dish removal already worked —
  clicking a saved chip toggles it off visually; nothing is deleted from the database until the shared
  submit button is pressed. The submit button's empty-state label ("I LITERALLY HAVE NOTHING") reflects
  pantry state as before.
- The "Edit a saved pantry item" dropdown is removed. A saved ingredient can still be removed (by clicking
  its chip), but its tags/allergens can no longer be reopened and changed after the fact. Signature dish
  editing is unaffected.
- **Known limitation:** the actual scroll animation (crossfade timing, exact scroll distance) has not been
  visually verified in this environment — there is no Playwright/chromium-cli tooling available here. Unlike
  the host-entry-plate structural check, a dev-server-plus-curl check of `/kitchen` could not confirm the
  expected markup: this route renders `{loading && <p>Loading…</p>}` until a client-side Supabase fetch
  resolves, so the server-rendered HTML is only that loading shell regardless of auth state, and none of
  `sv2-kitchen-scroll-track`, `sv2-kitchen-signatures`, `sv2-kitchen-pantry`, or the single `class="add"`
  submit button appear in the raw response. The unified test suite (including `__tests__/kitchen-page.test.tsx`)
  is the actual coverage for this markup; the transition itself still needs a real browser check before
  considering this fully done.

# Kitchen inventory sleekness and preferences (2026-09-09)

- Adding a custom signature dish or pantry ingredient no longer needs its own submit button. The
  suggestion API now always commits to a best guess across every relevant tag group (role, protein,
  texture, method, temperature, flavor) instead of ever declining for low confidence — with allergens kept
  conservative and excluded from that "always guess" latitude, per a code-review catch during this same
  pass. That guess is shown while typing, and stepping away from the draft area (blur) auto-stages it as a
  name-only chip — no Enter key required, mobile-first. A small edit pencil on the staged chip reopens it
  (repopulating the form and removing it from the staged list) if the guess needs correcting; switching to
  edit a *different* staged chip first stages whatever complete draft was still in the form, rather than
  silently discarding it. Multiple staged drafts across both signatures and pantry submit together with the
  existing single page-wide submit action, using the same per-operation partial-failure reconciliation
  already built for the rest of this page — a failed staged insert stays staged for retry; a succeeded one
  clears.
- Signature dishes gained a Role filter row (Starter/Main/Side/Dessert/Flex) alongside the existing Cuisine
  tabs, and custom/staged dishes are now filterable by it. A shared `FilterTabRow` component now backs all
  three filter-tab rows on this page (Cuisine, Role, and the pre-existing Pantry category row), replacing
  three copies of the same inline JSX/styling. Custom pantry ingredients are now filtered by their inferred
  category (derived from their existing protein/base tag, reconciled against the curated preset picker's
  own placement — e.g. mushroom is filed under Vegetables to match the existing "Mushrooms" preset, not
  Proteins) instead of always appearing under every tab; an ingredient with no confident category mapping
  shows only under "All".
- The recurring "Fill Kitchen Myself" / "Send To A Chef" header pair is replaced with a quiet "Kitchen set
  up ✓" label once `kitchen_status` is `'complete'`. The independent-vs-restaurant kitchen-type choice is
  now persisted (`events.kitchen_type`, migration `20260909000001_add_event_kitchen_type.sql`) and skipped
  entirely on repeat visits once already chosen.
- The "Anything you avoid?" question gained an optional free-text supplement (`taste_profiles.avoid_other`,
  migration `20260909000002_add_taste_profile_avoid_other.sql`) on both the guest RSVP flow and the host's
  own `/profile/preferences` editor. It is not fed into any scoring/matching logic — guest-facing context
  for the host, same as other free-text questionnaire answers.
- The protein preference question ("What sounds best tonight?") now allows 3 selections instead of 2.
- Both new migrations were applied to the linked Supabase database during this work.
- **Known limitation:** the actual staging/blur/auto-suggest interaction has not been visually verified in
  a real browser in this environment — there is no Playwright/chromium-cli tooling available here. Test
  coverage (`__tests__/kitchen-page.test.tsx`) exercises the underlying state machine, including two real
  bugs a code-quality review caught and a follow-up commit fixed (a suggestion-suppression flag that could
  get permanently stuck on a same-value re-edit, and a different staged item's edit pencil silently
  discarding an unrelated in-progress draft) — each with a regression test verified to fail on the pre-fix
  code — but the actual feel of the blur-to-stage timing still needs a real device/browser check.
- **Deferred follow-up (not done, explicitly flagged rather than skipped silently):** a code-quality review
  recommended extracting the near-duplicated signature/pantry staging logic (`tryStage*Draft`,
  `editStaged*Draft`, `handle*DraftBlur`, the suggestion-suppression and stage-intent effects — roughly
  150-200 lines of parallel, non-trivial stateful logic) into one shared hook. Deliberately not done in this
  pass, given the risk of introducing a new bug in logic that had just been fixed twice; worth doing as a
  dedicated follow-up.

# Kitchen page crash and stale kitchen-type fixes (2026-09-09)

- Fixed the Kitchen page throwing an unhandled runtime error ("Target ref is defined but not hydrated")
  on every real page load. Root cause, confirmed by reading Framer Motion's actual `useScroll` source: it
  gives a target ref exactly one microtask to hydrate before throwing, but `scrollTrackRef`'s div only
  mounted once the async `loadData()` Supabase fetch resolved — always far longer than one microtask. This
  bug predates this session's work (part of the original Kitchen scroll-crossfade feature) and was
  previously undetected because the existing test suite fully mocks `framer-motion`, so the real
  hydration-timing check never ran. **Superseded the same day** — see below: the whole scroll-crossfade
  mechanism this bug lived in was subsequently removed entirely, after a second, related bug surfaced in
  real use (scrolling a long tag list could itself trigger the crossfade and hide the section being
  interacted with). The interim fix and its dedicated test both no longer exist.
- Backfilled `kitchen_type` (migration `20260909000003_backfill_event_kitchen_type.sql`, applied to the
  linked database) for events that completed kitchen setup before that column existed — previously they'd
  be asked the independent-vs-restaurant question one more time despite having already finished setup,
  since the redirect-skip logic only engages once `kitchen_type` is actually set. Both backfill signals are
  unambiguous: a `restaurant_menus` row is only reachable via the restaurant path, and `kitchen_status =
  'complete'` is set in exactly one place in the whole codebase (the finish step of the independent
  pantry/signatures flow) — the restaurant path never sets it.
- **Removed the scroll-crossfade entirely, per explicit user request after real-browser testing surfaced a
  second bug it caused**: `.sv2-kitchen-scroll-frame .sv2-kitchen-card` constrained each section to
  `max-height:100%` with its own `overflow-y:auto`, so scrolling a long tag list inside a card to see the
  rest of it could bottom out and start scrolling the outer page too — which is exactly what drives the
  crossfade, so the section being actively used could switch opacity/pointer-events/`inert` and disappear
  mid-interaction. Rather than patch this further, removed `useScroll`/`useTransform`, the
  `signaturesActive`/`inert` wiring, both `motion.section` wrappers, and the scroll-track/scroll-frame CSS.
  Signatures and Pantry are plain `<section>` elements again, stacked in normal document flow with native
  page scrolling — no JS-driven visibility toggling to fight the user's own scroll gesture.
- **Implemented the compact tag-suggestion preview that was designed during this feature's original
  brainstorming but never actually built.** The Task 8 implementation kept the pre-existing "reveal the
  full tag-group picker immediately, with suggested tags pre-selected" behavior verbatim instead of the
  agreed "show a compact preview first, edit only on request" flow — so every suggestion still showed every
  possible tag in every group, identical to before the staging feature existed. Added
  `sigTagsEditing`/`pantryTagsEditing` state (default false) and a new `SuggestionPreview` component: a
  successful suggestion now shows its guessed tags/allergens as small read-only chips plus an "Edit tags"
  link, not the full picker. Tapping "Edit tags" reveals the same full picker as before, unchanged, for
  correction. A failed suggestion (nothing to preview) and reopening an already-staged draft via its edit
  pencil both still go straight to the full picker, since both are cases where the chef needs to build or
  fix tags manually rather than just glance at a guess.
- Fixed the shared Kitchen submit button's silently-lost pill styling. Root cause, confirmed by rendering
  the real component and checking the actual DOM: the button sits outside both `.sv2-kitchen-card`
  sections (correct — it submits both at once, by design since the submit-unification work), but its
  styling rule, `.sv2-production-kitchen .sv2-kitchen-card .add`, required exactly that nesting to match.
  With the rule never matching, the button silently fell back to a *different*, unrelated global `.add`
  rule in `app/globals.css` with different proportions — not literally unstyled, which is why it still
  looked like a button, just not the intended one. Fixed by dropping the `.sv2-kitchen-card` requirement
  from the selector (and its `:disabled`/`:focus-visible` variants) rather than moving the button, since it
  needs to stay outside both sections by design.
- Removed the "Brief" note under the submit button, and renamed its empty-state label from "I LITERALLY
  HAVE NOTHING" to "I have an empty kitchen".
- `ChefTabs`' "Fill Kitchen Myself" / "Send To A Chef" actions no longer render while already on the
  Kitchen page itself (`active === 'kitchen'`) — redundant once you're already there. They still show on
  every other chef-workspace page.
- The "Kitchen set up ✓" label that previously replaced those actions once the kitchen was complete has
  been removed entirely, everywhere (including the Kitchen page) — nothing renders in that slot once
  complete. The now-unused `.sv2-chef-kitchen-complete` CSS rule was removed with it.
- **Superseded the next day** — see "Edit Kitchen action" below: that slot no longer renders nothing once
  complete; it shows a single `Edit Kitchen` action in the same place and style.

# Swap's near-empty-inventory fallback (2026-09-09)

- `draftCourse` (the deterministic Table/Menu Swap path, `lib/menu.ts`) only ever draws from stored
  signature dishes. Once a chef has too few signatures left for a slot after excluding what's already
  used, it either returns `origin: 'empty'` ("no options") or, with only 1-2 signatures total, keeps
  re-offering the same one or two dishes on every press. Guest protein/flavor/dietary preferences are
  still enough signal to compose a genuinely new dish in that dead end, so this is now the one place in
  Swap that calls an LLM: `POST /api/menu/swap-ai` builds a single-dish gap brief (reusing
  `buildRecommendationPlan`/`buildMenuCreationBrief`/`buildCompactGapPrompt` with `signatures: []`, so it
  can never re-suggest a signature the deterministic path already ruled out) and asks Gemini for exactly
  one dish. It only fires once the client's `draftCourse` call already returned `'empty'` — never on an
  ordinary swap — keeping usage rare and each call cheap (one dish, not a whole menu).
- The proposed dish is deterministically re-checked with `dinerDishFit` against every actual guest's
  stated allergies/diet before it is ever persisted; a conflict is rejected outright rather than shown.
  It persists as `dish_origin: 'pantry-composed'` with `source: null`, matching the same shape the main
  generation pipeline already uses for LLM-composed dishes with no single backing pantry item — no schema
  or `deriveCourse` changes were needed.
- `handleSwap` (`app/(chef)/events/[id]/menu/page.tsx`) was also fixed to exclude every dish already used
  anywhere on the current menu, not just the slot being swapped — previously only the current slot's own
  dish was excluded, so the same signature could end up recommended for two different slots (e.g. both a
  main and a side) at once. The widened exclude set also feeds the new fallback's avoid-list, so the LLM
  is told the same set of names to avoid repeating.
- The Swap button shows "Finding a dish…" and disables itself only for the specific course being
  AI-swapped while the request is in flight; a network/Gemini/safety-validation failure falls back to the
  existing "no options" toast rather than erroring visibly.

# Manual course add/remove on the drafted menu (2026-09-09)

- Each course card on the Table/Menu drafting page now has small `−`/`+` buttons beside Swap/Lock, so a
  host can manually remove a course entirely or add another one, addressing the earlier "dish count should
  correlate to guest count, but if the host wants more they should be able to add them" feedback. This is a
  deliberate exception to the "dish count is guest-count-only" rule, documented as such in `AGENTS.md`,
  `docs/SOFRA_PRODUCT_SPEC.md`, and `docs/DECISION_LOG.md` — the automatic formula still owns the count at
  generation time; this is an explicit, visible, one-course-at-a-time host action afterward, not an
  automatic side effect of another feature.
- `+` adds a new course with the same role as the course it's attached to (e.g. `+` on a Side adds another
  Side), appended at the end of the menu, and immediately tries to fill it — first through the existing
  deterministic signature pool (`draftCourse`), then through the same `swap-ai` LLM fallback Swap already
  uses once that pool is exhausted. The host never has to add a blank slot and separately remember to press
  Swap on it. `−` deletes a course outright; both actions are disabled on a locked course, and both are
  disabled while any AI operation (Swap, Add, or a full Regenerate) is already in flight to avoid racing
  concurrent writes to the same menu.
- `handleSwap`'s fill logic (deterministic pool, then `swap-ai` fallback, then persistence) was extracted
  into a shared `fillCourse(course, currentCourses)` helper reused by both Swap and Add, taking the course
  list as an explicit parameter rather than reading the `courses` state closure — a freshly-inserted course
  from Add hasn't necessarily been reflected in a React re-render yet when its fill immediately follows.
- New courses are appended at the end of the list (`sort_order = max + 1`) rather than inserted at a
  specific position; there is no course-reordering feature yet, so this keeps the implementation simple.
- **Known limitation:** no automated test coverage was added for this page-level interaction — this page
  has no existing component test harness (unlike the new `/api/menu/swap-ai` route, which does), and
  building one from scratch was judged out of scope for this pass. Typecheck and the full existing suite
  (929 passed, same 19 pre-existing unrelated failures) both pass with no regressions; the actual click-path
  has not been visually verified in a real browser in this environment.

# Edit Kitchen action (2026-09-10)

- The header slot beside Swap/Lock that used to show `Fill Kitchen Myself` / `Send To A Chef` (and
  briefly, then not at all, showed a completion label — see the two entries above) now shows a single
  `Edit Kitchen` action, same place and same `sv2-chef-kitchen-action` style as before, once
  `kitchen_status` is `'complete'`. It still routes through the existing `fillKitchenMyself` handler
  (`/events/[id]/kitchen-setup?from_page=...`), which already loads and edits the chef's existing
  signatures/pantry regardless of completion state — no new routing logic was needed. Still hidden while
  already on the Kitchen page itself, and still gated to the host/an accepted co-host
  (`canDelegateKitchen`), matching every other rule this slot already followed.

# Kitchen-type question flash fix and HOST tab restyle (2026-09-10)

- Fixed a second, distinct flash on the same `/events/[id]/kitchen-setup` screen (the independent-vs-
  restaurant chooser): its `<header>`, including the "Is this at a restaurant or at home / elsewhere?"
  headline and the Back link, rendered unconditionally — even during the brief loading window before the
  effect discovers `kitchen_type` is already set and redirects away. Every "Edit Kitchen" visit (or any
  revisit) briefly flashed the full question text before the redirect fired. Gated the header and choice
  grid behind `!loading && !error`, so nothing beyond a neutral "Opening the kitchen…" line renders until
  it's confirmed the question genuinely needs asking. Added a regression test asserting the heading itself
  (not just the choice buttons, which an earlier test already covered) never appears when `kitchen_type` is
  already set; confirmed it fails pre-fix, passes post-fix.
- The bottom navigation's `HOST` tab now uses the existing burgundy table-mark logo
  (`public/sofra-table-mark.png`, already used in `WelcomeCard` and the empty-menu illustration) as the
  button itself — no separate background block. The word `HOST` is overlaid centered on top of the logo in
  the app's "on burgundy" cream/beige text color (`--sf-intel-on-burgundy`, theme-invariant, since the mark
  image itself is a fixed burgundy silhouette regardless of light/dark mode), replacing the plain text-only
  treatment shared with `SOFRAS`/`PROFILE`. (An earlier version of this put the logo inside a separate
  rounded burgundy badge as a small icon beside the text; corrected same-day per feedback that the logo
  itself should be the button surface.)

# Add to Calendar (2026-09-10)

- Both the guest event-detail view (reached immediately after RSVP submission — Sofra has no separate RSVP
  confirmation screen, guests land back on the event page) and the host event-detail view (reached right
  after finishing the create-Sofra wizard) now offer `Google Calendar` and `Apple Calendar` buttons, since
  both flows converge on the same shared `EventPaper` component.
- **Placement, corrected twice same-day per feedback:** the event facts `<dl>` (originally one block
  covering Date/Time/Location *and* Dress code/custom details/Your RSVP together) is now split into three —
  `eventFactsDate` (Date, Time), `eventFactsLocation` (Location), `eventFactsExtra` (Dress code, custom
  details, Your RSVP) — with the calendar buttons rendered between the first two, i.e. directly under the
  stated Time, before Location (an earlier pass only moved them out from after Dress code to after Location,
  which still wasn't specific enough). For the host that's inside the collapsible `Date · Time` disclosure
  (`sv2-host-details-disclosure`); for the guest (no such collapsible) it's the same split, just always
  visible. The guest's previously separate, duplicated inline `<dl>` markup was replaced with these same
  shared consts, removing that duplication as a side effect.
- New `lib/calendar.ts` (`googleCalendarUrl`, `buildIcsFile`, `icsDataUrl`) builds both a Google Calendar
  compose-URL and a minimal RFC 5545 `.ics` file client-side — no backend route, no dependency. "Add to
  Apple Calendar" is the standard `.ics`-file pattern (Apple Calendar has no separate web API); the button
  is a plain `<a download>` pointing at a `data:text/calendar` URI, which downloads on desktop and typically
  opens the system "Add to Calendar" sheet directly on iOS Safari.
- Both formats deliberately use *floating* (timezone-suffix-free) timestamps — `DTSTART`/`DTEND` with no
  `Z`/offset, and Google's `dates=` param unsuffixed — matching how `event_date` is treated everywhere else
  in Sofra (`lib/event-date.ts`: the stored Y/M/D/H/M digits are the literal wall-clock time every viewer
  should see, never converted per device timezone). The helpers read the stored ISO string back out with
  `Date`'s UTC getters, the same technique `formatEventDate`/`formatEventTime` already use, so the exported
  calendar time always matches what's shown on the page.
- Sofra has no stored event end time, so calendar events default to a 3-hour duration
  (`DEFAULT_DURATION_HOURS` in `lib/calendar.ts`); duration arithmetic correctly rolls over midnight since
  it operates on real `Date` millisecond math before re-extracting UTC fields, not string manipulation.
- Calendar buttons are omitted entirely when the event's date is the undecided sentinel
  (`isEventDateUndecided`) — there's no real time to export yet. Location is included only when there's a
  venue, and the address component is included only when `unlocked` (i.e., never leaked to a guest who
  hasn't RSVP'd, matching the existing address-privacy boundary already enforced elsewhere on this page).
- The Google/Apple icons are small hand-drawn inline SVGs (`GoogleCalendarGlyph`/`AppleGlyph` in
  `EventPaper.tsx`) rather than the literal trademarked logos, matching this file's existing icon
  convention — e.g. its own "Share via WhatsApp" button already uses a generic share glyph, not the
  WhatsApp bubble. The Google glyph reuses the same generic calendar-outline path already used elsewhere in
  this file (the host details-disclosure icon) with four small dots in Google's brand colors; the Apple
  glyph is an originally-drawn, simplified apple-fruit silhouette, not a trace of Apple's actual mark.
- New `__tests__/calendar.test.ts` covers both formats: correct floating timestamps, optional
  description/location inclusion, custom duration, midnight rollover, ICS special-character escaping, and
  that the `.ics` data URI decodes back to the same calendar text. 9 tests, all passing.

# Dress code reference photos (2026-09-10)

- The host can now upload up to `MAX_DRESS_CODE_PHOTOS` (6) reference images illustrating the dress code
  (e.g. a "cocktail attire" example) directly in the Dress code row of `EventPaper.tsx`, next to the
  existing free-text field — not a separate edit-event-form flow. Small thumbnail previews are visible to
  everyone (host and guest alike, unconditionally — dress code isn't gated behind RSVP unlock, matching the
  existing text field), but only the host can add or remove one, each with an inline `×` on its thumbnail.
  The host sees this row even with no dress code text or photos yet, since it's the only place to add them;
  a guest only sees the row once there's actually something to show.
- New `event_dress_code_photos` table (migration `20260910000001_add_event_dress_code_photos.sql`, applied
  to the linked Supabase database) — deliberately separate from `event_photos` (the guest-contributed
  Shared Album): no uploader roster, no captions/comments, host-only writes, matching this codebase's
  existing convention of a child table (not a URL array column) for any multi-image gallery. Reuses the
  existing `event-photos` Storage bucket under a `dress-code/<eventId>/...` path prefix rather than
  provisioning a new bucket. RLS disabled, following the same explicitly-accepted anonymous-access MVP
  posture already used for `event_photos` and most other application tables in this codebase.
- New `lib/event-dress-code-photos.ts` (`fetchDressCodePhotos`, `uploadDressCodePhotos`,
  `deleteDressCodePhoto`) mirrors `lib/shared-album.ts`'s upload-then-insert-with-rollback-on-failure
  pattern and reuses its exported `runBatchWithConcurrency` helper rather than duplicating it. 8 new tests
  in `__tests__/event-dress-code-photos.test.ts`.
- A failed background fetch of existing dress-code photos on page load is deliberately silent (console-only,
  no user-visible alert) — these are a minor illustrative extra, not worth an error banner on every guest's
  page load. `dressCodePhotoError` is reserved for host-initiated upload/delete failures, where the host
  took an action and should hear back about it. (A first version surfaced the fetch failure as an alert too,
  which collided with the Shared Album's own `role="alert"` upload-limit message in existing tests whose
  Supabase mocks predate this table — `getByRole('alert')` then matched two elements. Caught by the full
  suite comparison before committing; fixed by making the background fetch failure silent, which is also
  simply the better product behavior here, not just a test workaround.)

# Dress code photo prompt during create/edit (2026-09-10)

- The original pass only let a host manage dress code reference photos from the already-created event's
  detail page. Per feedback, the host is now also prompted for them directly inside the create-a-Sofra
  wizard and the edit-event form (`HostCreateForm.tsx`, shared by both), right under the Dress code text
  field — a collapsed `+ ADD INSPO PHOTOS` toggle (renamed to `+ INSPO PHOTOS (n)` once any exist, `HIDE
  INSPO PHOTOS` while open) that expands to the same thumbnail-grid-plus-upload UI used on the event detail
  page, so it doesn't take up space until the host actually wants it.
- During **create**, there's no `event_id` yet, so newly picked files are staged as plain `File[]` in the
  page's own state (mirroring exactly how the cover image is already staged via `coverFileRef` and only
  actually uploaded in `handleSubmit`/`saveEventRow`) and previewed locally via `URL.createObjectURL`
  (generated and revoked inside `HostCreateForm` itself via `useMemo`/`useEffect`, since the File objects
  are the source of truth the parent page owns). The actual upload happens once the real event id is known,
  right before `saveEventRow` returns it; on success the pending list is cleared immediately so a second
  `saveEventRow` call (e.g. the final publish after an earlier `CUSTOMIZE GUEST QUESTIONS` save had already
  created the row) can't re-upload and duplicate the same photos.
- During **edit**, already-persisted photos are loaded on mount and removed immediately on delete (there's
  nothing staged/undoable about an already-saved photo), while newly picked files follow the same
  stage-then-upload-on-Save pattern as create, with `startingSortOrder` continuing on from the existing
  count.
- Both flows treat a failed upload as best-effort and silent (console-only) rather than blocking or
  interrupting Save/Publish — consistent with the rest of this feature's error-handling stance, and because
  both pages navigate away immediately on a successful save regardless, so a post-navigation error message
  would never actually be seen.

# Calendar button sizing and dress code photo grid (2026-09-10)

- `.sv2-calendar-action` now matches `.sv2-map-links a`'s size exactly (`min-height:32px`, `padding:7px 8px`,
  9px font, down from a taller/larger ad hoc size) for visual consistency between the two button rows in the
  same facts list. `.sv2-calendar-actions`' margin-top dropped from 14px to 10px (matching the map links'
  own top margin, "lifting" the buttons closer to Time) and gained a matching 10px margin-bottom so there's
  breathing room before the Location row's divider line below it. The buttons already wrap to a second line
  on narrow layouts (`flex-wrap:wrap`); `min-width` was reduced from a flat 150px to 130px so that still
  happens readily without being needlessly wide.
- Dress code reference photos (both the event-detail preview in `EventPaper.tsx` and the create/edit form's
  preview in `HostCreateForm.tsx`) now use the exact same grid/tile styling as the Shared Album's preview
  grid — a responsive `repeat(3,1fr)` grid with `aspect-ratio:1` tiles (single-photo and two-photo layouts
  get the same `data-count`-driven overrides the album grid already has) — replacing the earlier small fixed
  56×56px flex-wrapped tiles, per feedback that they should look like the Shared Album's own preview.
