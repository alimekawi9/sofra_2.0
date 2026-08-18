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
- A host may delegate Kitchen setup to one assigned chef through a one-time link. That chef is restricted to the event Kitchen, Drafted Menu, and Recipes surfaces.

## Core technology

- Next.js
- TypeScript
- Supabase
- Gemini through @google/genai

## Permanent constraints

- Pantry availability is binary.
- Ingredient quantities and units are optional, additive pantry metadata — not required to add an ingredient, and not read by any deduction or shopping-cart logic yet (that's deferred; see docs/DECISION_LOG.md).
- Drinks are not part of the recommendation flow.
- Menus do not use fixed start, sea, land, green, and finish slots.
- Menu size (dish count) changes based on guest count, and only based on guest count — no other feature (e.g. portion/batch-size scaling) may change dish count as a side effect.
- Per-dish portion/batch-size guidance may scale with guest count once dish-count scaling has already maxed out; this only ever changes displayed portion text, never which or how many dishes exist.
- Dish roles are starter, main, side, dessert, and flex.
- Signature dishes are prioritized when they strongly fit the table.
- The LLM fills only remaining menu gaps.
- Final results must be validated by deterministic code.
- Kitchen completion is not required to create or invite people to an event. Menu generation must warn before proceeding without completed Kitchen data, but the host or assigned chef may explicitly continue with an inventory-free draft.
