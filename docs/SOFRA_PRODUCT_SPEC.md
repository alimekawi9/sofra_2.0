@'
# Sofra Implementation Status

## Current state

Not yet audited.

## Completed

- Project documentation structure created.

## In progress

- Repository audit.
- Recommendation-engine redesign.

## Not yet implemented

- Central recommendation configuration.
- Deterministic scoring.
- Signature selection.
- Residual diner analysis.
- Pantry retrieval.
- Compact LLM brief.
- Validation and targeted repair.
- MCP wrappers.
- Updated chef menu and guest PDF.
- Performance testing.

## Known issues

Add verified issues here after inspecting the repository.

## Last verification

Tests: Not run  
Type-check: Not run  
Production build: Not run

## Next step

Inspect the repository and compare the existing implementation with docs/RECOMMENDATION_PIPELINE.md.
'@ | Set-Content -Path "docs/IMPLEMENTATION_STATUS.md" -Encoding UTF8

@'
# Sofra Implementation Status

## Current state

Not yet audited.

## Completed

- Project documentation structure created.

## In progress

- Repository audit.
- Recommendation-engine redesign.

## Not yet implemented

- Central recommendation configuration.
- Deterministic scoring.
- Signature selection.
- Residual diner analysis.
- Pantry retrieval.
- Compact LLM brief.
- Validation and targeted repair.
- MCP wrappers.
- Updated chef menu and guest PDF.
- Performance testing.

## Known issues

Add verified issues here after inspecting the repository.

## Last verification

Tests: Not run  
Type-check: Not run  
Production build: Not run

## Next step

Inspect the repository and compare the existing implementation with docs/RECOMMENDATION_PIPELINE.md.
'@ | Set-Content -Path "docs/IMPLEMENTATION_STATUS.md" -Encoding UTF8

@'
# Sofra Decision Log

## Recommendation engine

- Use deterministic TypeScript code for scoring, filtering, menu structure, validation, and pantry retrieval.
- Use the LLM for focused culinary invention and signature refinement.
- Use MCP as a thin interface over shared services.
- The website should call shared services directly for lower latency.

## Menu structure

- Dynamic dish count based on guest count.
- Broad roles: starter, main, side, dessert, flex.
- Weak signature dishes should not be forced into empty roles.
- Missing roles should be filled by focused LLM generation.

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
- No quantities or units.
- Tags are used internally.
- The LLM receives ingredient names grouped by useful categories, not raw tags.
'@ | Set-Content -Path "docs/DECISION_LOG.md" -Encoding UTF8

@'
# Sofra Product Specification

## Product

Sofra helps chefs generate shared menus based on:

- guest preferences;
- protein preferences;
- adventurousness;
- dietary restrictions;
- allergies;
- chef signature dishes;
- currently available pantry ingredients.

## Main users

- Guests entering preferences.
- Chefs entering signatures and pantry availability.
- Hosts or chefs generating menus.

## Core technology

- Next.js
- TypeScript
- Supabase
- Gemini through @google/genai

## Permanent constraints

- Pantry availability is binary.
- Ingredient quantities and units are not tracked.
- Drinks are not part of the recommendation flow.
- Menus do not use fixed start, sea, land, green, and finish slots.
- Menu size changes based on guest count.
- Dish roles are starter, main, side, dessert, and flex.
- Signature dishes are prioritized when they strongly fit the table.
- The LLM fills only remaining menu gaps.
- Final results must be validated by deterministic code.
'@ | Set-Content -Path "docs/SOFRA_PRODUCT_SPEC.md" -Encoding UTF8