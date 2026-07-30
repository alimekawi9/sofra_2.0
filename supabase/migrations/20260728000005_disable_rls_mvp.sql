-- =============================================================================
-- MVP: REMOVE ALL ROW LEVEL SECURITY
--
-- This migration drops every auth.uid()-based RLS policy and then disables
-- RLS entirely on all application tables.
--
-- WHAT THIS MEANS:
--   Any Supabase client (browser, server) can read and write every row in
--   every table with no per-user isolation whatsoever. There is no access
--   control beyond knowing the Supabase URL and anon key.
--
-- DO NOT use this with real user data or in any environment exposed to the
-- public internet. This configuration is intentional for local MVP testing
-- only. Restore proper RLS policies before any production or beta deployment.
-- =============================================================================

-- ---- users ------------------------------------------------------------------
drop policy if exists users_select_authenticated     on public.users;
drop policy if exists users_insert_self              on public.users;
drop policy if exists users_update_self              on public.users;
alter table public.users disable row level security;

-- ---- events -----------------------------------------------------------------
drop policy if exists events_select_authenticated    on public.events;
drop policy if exists events_insert_host             on public.events;
drop policy if exists events_update_host             on public.events;
drop policy if exists events_delete_host             on public.events;
alter table public.events disable row level security;

-- ---- rsvps ------------------------------------------------------------------
drop policy if exists rsvps_select_self_or_host      on public.rsvps;
drop policy if exists rsvps_insert_self              on public.rsvps;
drop policy if exists rsvps_update_self              on public.rsvps;
drop policy if exists rsvps_delete_self              on public.rsvps;
alter table public.rsvps disable row level security;

-- ---- taste_profiles ---------------------------------------------------------
drop policy if exists taste_profiles_select_self         on public.taste_profiles;
drop policy if exists taste_profiles_insert_self         on public.taste_profiles;
drop policy if exists taste_profiles_update_self         on public.taste_profiles;
drop policy if exists taste_profiles_delete_self         on public.taste_profiles;
drop policy if exists taste_profiles_select_host_or_chef on public.taste_profiles;
alter table public.taste_profiles disable row level security;

-- ---- signatures -------------------------------------------------------------
drop policy if exists signatures_select_authenticated    on public.signatures;
drop policy if exists signatures_insert_chef             on public.signatures;
drop policy if exists signatures_update_chef             on public.signatures;
drop policy if exists signatures_delete_chef             on public.signatures;
alter table public.signatures disable row level security;

-- ---- pantry_items -----------------------------------------------------------
drop policy if exists pantry_items_select_authenticated  on public.pantry_items;
drop policy if exists pantry_items_insert_chef           on public.pantry_items;
drop policy if exists pantry_items_update_chef           on public.pantry_items;
drop policy if exists pantry_items_delete_chef           on public.pantry_items;
alter table public.pantry_items disable row level security;

-- ---- menus ------------------------------------------------------------------
drop policy if exists menus_select_authenticated         on public.menus;
drop policy if exists menus_insert_chef                  on public.menus;
drop policy if exists menus_update_chef                  on public.menus;
drop policy if exists menus_delete_chef                  on public.menus;
alter table public.menus disable row level security;

-- ---- menu_courses -----------------------------------------------------------
drop policy if exists menu_courses_select_authenticated  on public.menu_courses;
drop policy if exists menu_courses_insert_chef           on public.menu_courses;
drop policy if exists menu_courses_update_chef           on public.menu_courses;
drop policy if exists menu_courses_delete_chef           on public.menu_courses;
alter table public.menu_courses disable row level security;
