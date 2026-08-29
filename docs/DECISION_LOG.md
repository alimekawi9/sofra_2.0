# Sofra Decision Log

## Recommendation engine

- Use deterministic TypeScript code for scoring, filtering, menu structure, validation, and pantry retrieval.
- Use the LLM for focused culinary invention and signature refinement.
- Use MCP as a thin interface over shared services.
- The website should call shared services directly for lower latency.
- Event-planning advice is a separate structured Gemini task over aggregate Table intelligence and event-specific survey summaries. It may explain consensus, disagreement, logistics, atmosphere, and communication, but it must not alter deterministic menu scoring or menu generation.

## Menu structure

- Dynamic dish count based on guest count.
- Broad roles: starter, main, side, dessert, flex.
- Weak signature dishes should not be forced into empty roles.
- Missing roles should be filled by focused LLM generation.
- Final validation treats semantically equivalent core dishes as duplicates, using normalized culinary names and structured core-ingredient overlap. Seasoning or technique changes do not make two instances of the same base dish distinct.

## Preferences

- No cuisine-preference scoring.
- Protein preference weight: 45%.
- Flavor preference weight: 35%.
- Adventurousness weight: 20%.
- Every diner should have strictly more than half of the menu satisfying their preferences.

## Allergies

- Large-group cutoff: 8 guests.
- Under 8 guests, conflicting dishes are excluded.
- At 8 or more guests, affected diners receive a score of zero for the dish.
- Allergens appear on chef and guest menus.
- Affected diner names appear only in the chef view.

## Pantry

- Availability is binary.
- Quantity (amount + unit) is optional, additive metadata on pantry items — nullable `quantity_amount`/`quantity_unit` columns, not required, and not wired into any deduction or shopping-cart logic yet.
- Tags are used internally.
- The LLM receives ingredient names grouped by useful categories, not raw tags.
- Event publishing and Kitchen readiness are separate states. A pending Kitchen never blocks event creation or invitations; generation presents a warning and requires an explicit continue action before producing a menu without Kitchen context.
- Kitchen setup may be delegated to a single assigned chef. The assigned chef owns the signatures and current-week pantry used for that event and receives only Kitchen, Drafted Menu, and Recipes navigation.

## Portions ("variety vs. quantity" rule)

- Dish count (variety) and portion/batch size (quantity) scale independently. Dish count is decided solely by `calculateTargetDishCount` (guest count only); portion guidance may separately scale with guest count, but never as a substitute for dish count and never by changing which or how many dishes exist.
- `portionGuidance(slot, guestCount?)` (`lib/menu.ts`) stays at its static per-slot baseline for guest counts at or under 13 — the guest count at which `calculateTargetDishCount` already caps dish count at its maximum of 9. Beyond that point, dish count can't grow further, so the per-dish batch estimate scales up proportionally instead, capped at 4x the baseline.

## Pending: Deficit-weighted whole-menu course selection

Status: Fully designed and approved (see docs/superpowers/specs/2026-08-05-whole-menu-course-selection-design.md), NOT implemented. Current live system still uses the original per-guest Substitution/assignSubstitutions model. Implementing this would remove that system and replace it with whole-menu-aware, deficit-weighted course selection where allergies get visible callouts and diet preferences only affect invisible scoring weight.

## Pending: LLM input-narrowing pipeline (not yet formally specced)

Status: Discussed, never written to a formal spec, not implemented. Idea: pre-filter candidate dishes deterministically (via existing scoreDish/tableFit logic) before sending to Gemini, so the prompt only includes a small, relevant shortlist per slot rather than the full signature/pantry catalog every time — reduces prompt size and lets Gemini reason over pre-vetted options rather than the entire inventory. Motivated originally by Gemini latency concerns, which were separately resolved by switching to gemini-3.6-flash; this remains worth doing to minimize what's left to LLM judgment, per user's stated goal of reducing "grunt work" delegated to the LLM.

## Deferred: Full recipe input + AI recipe scaling + shopping cart

Status: Concept documented, NOT implemented, deliberately deferred.

Source concept: "Intelligent Home Event Planner" — host onboarding flow, recipe input (AI-generated or manual), gram-precise portion-per-head scaling, inventory deduction against locked recipes, department-grouped shopping cart output.

Reason deferred: requires a genuinely new recipe data model (structured ingredient quantities/units/instructions per dish) that doesn't exist in the current schema. The variety-vs-quantity rule and basic pantry-quantity tracking were extracted and built now (see the "Portions" and "Pantry" sections above, and migration `20260811000001_add_pantry_item_quantity.sql`); the rest needs its own dedicated design pass once there's a real need for full grocery-logistics functionality.

## Deferred: Live Apple Music playlist creation

Status: Deliberately deferred. Sofra provides an always-available UTF-8 playlist list that includes every suggestion, while Spotify supports live playlist creation through host OAuth. Live Apple Music export is not part of this pass because MusicKit requires Apple Developer Program membership (currently $99/year) and additional token/catalog integration. Revisit only if real user demand specifically justifies live Apple Music playlist creation; general cross-platform export alone is not sufficient reason to add the paid dependency.

## Event prep alert thresholds and product feedback

- Weeks-out required prep begins alerting at 14 days, the 1–2 weeks group at 7 days, and day-of seating at 48 hours. These thresholds leave enough time for invitations and logistics, then reserve the final two days for seating changes driven by late RSVPs.
- Optional checklist items never produce urgency alerts. Missing optional planning destinations use persisted inline notes and completion toggles instead of pretending another page exists.
- Post-event Sofra feedback is offered to hosts and attending guests and is private to Sofra. It is product research, not an event survey, so it is not surfaced back to hosts or other participants.
