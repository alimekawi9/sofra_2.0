-- supabase/migrations/20260806000001_add_component_ids_to_menu_courses.sql

-- Persist the pantry item ids that go into a pantry-composed dish. Without
-- this, `source` on menu_courses is null for AI-composed dishes and
-- deriveCourse (lib/menu.ts) has no way to reconstruct which pantry items
-- backed the dish — exclusions come back empty and the UI silently shows
-- "safe for the whole table" even when the untagged components fail-closed
-- on vegetarian/vegan guests.
--
-- Nullable so pre-migration rows keep working; new AI regenerations populate
-- it. Only meaningful when dish_origin='pantry-composed'.

alter table public.menu_courses
  add column if not exists component_ids uuid[];
