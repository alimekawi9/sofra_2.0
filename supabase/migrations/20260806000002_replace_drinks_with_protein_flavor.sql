-- Replace the drinks question on the RSVP flow with two taste axes:
--   protein_anchor    — single-select (Beef/Chicken/Fish/Pork/Lamb/Vegetarian/No preference)
--   flavor_preference — multi-select, capped at 3 by the UI
-- The `drinks` column existed solely to persist the removed drinks
-- question, so it's dropped here rather than repurposed.

alter table public.taste_profiles
  drop column drinks,
  add column protein_anchor    text,
  add column flavor_preference text[] not null default '{}';
