# Sofra Project Instructions

## Project

Sofra is a Next.js and TypeScript application using Supabase and Gemini.

Before making recommendation-engine changes, read:

- docs/SOFRA_PRODUCT_SPEC.md
- docs/RECOMMENDATION_PIPELINE.md
- docs/IMPLEMENTATION_STATUS.md
- docs/DECISION_LOG.md

## Permanent product rules

- Pantry availability is binary.
- Ingredient quantities and units are optional, additive pantry metadata (nullable `quantity_amount`/`quantity_unit`) — not required, and not read by any deduction or shopping-cart logic yet.
- Do not restore drinks.
- Do not restore the fixed five-course structure.
- Dish roles are starter, main, side, dessert, and flex.
- Do not introduce cuisine preferences.
- Tags are internal and should not be sent raw to the LLM.
- The allergy large-group cutoff is 8 guests.
- Protein preference weight is 45%.
- Flavor preference weight is 35%.
- Adventurousness weight is 20%.
- Every diner should have more than half the menu satisfying their preferences.
- Dish count is decided solely by guest-count-based menu structure (`calculateTargetDishCount`); it never scales as a side effect of any other feature. Per-dish portion/batch-size guidance may scale with guest count — variety (dish count) and quantity (batch size) are scaled independently, never as a substitute for one another.

## Working rules

- Inspect the current implementation before editing.
- Do not assume a previous prompt was completed.
- Preserve existing behavior unless the task explicitly changes it.
- Do not add production dependencies without explaining why.
- Run relevant tests after changes.
- Run the production build after material changes.
- Report pre-existing failures separately from newly introduced failures.
- Update docs/IMPLEMENTATION_STATUS.md after completing a phase.
