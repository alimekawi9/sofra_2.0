-- supabase/migrations/20260811000001_add_pantry_item_quantity.sql

-- Optional quantity tracking on pantry items, so a chef can express "I have
-- 2 lbs of chicken" rather than just binary presence/absence. Both columns
-- are nullable and purely additive: existing rows and any chef who never
-- enters a quantity keep working exactly as before -- availability itself
-- stays binary (a pantry_items row still just means "this is on hand this
-- week"), and this data is not read by any deduction/shopping-cart logic in
-- this pass. See docs/DECISION_LOG.md for the deferred full recipe/shopping-
-- cart scope this is scoped out of.

alter table public.pantry_items
  add column if not exists quantity_amount numeric,
  add column if not exists quantity_unit   text;
