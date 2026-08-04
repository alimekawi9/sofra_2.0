-- supabase/migrations/20260805000001_add_tags_and_allergens_to_pantry_items.sql

-- Give pantry_items the same declarative dietary metadata that signatures
-- already have, so the hard-limit safety check in lib/menu.ts can trust
-- explicit chef declarations instead of defaulting to "diet-safe status
-- unknown" for every strict-diet guest against every pantry pick.
--
-- Existing rows get empty arrays, which matches the pre-migration semantics
-- for allergens (substring on name is still the fallback) and keeps the
-- diet check failing closed until the chef tags an item.

alter table public.pantry_items
  add column if not exists tags               text[] not null default '{}',
  add column if not exists contains_allergens text[] not null default '{}';
