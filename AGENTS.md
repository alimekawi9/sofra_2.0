@'
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
- Do not add ingredient quantities or units.
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

## Working rules

- Inspect the current implementation before editing.
- Do not assume a previous prompt was completed.
- Preserve existing behavior unless the task explicitly changes it.
- Do not add production dependencies without explaining why.
- Run relevant tests after changes.
- Run the production build after material changes.
- Report pre-existing failures separately from newly introduced failures.
- Update docs/IMPLEMENTATION_STATUS.md after completing a phase.
'@ | Set-Content -Path "AGENTS.md" -Encoding UTF8