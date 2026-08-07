-- Enables name-only onboarding: new users created via the name-only path
-- store phone = null. The existing UNIQUE constraint on phone is untouched
-- (Postgres UNIQUE allows any number of NULLs, so this does not weaken
-- uniqueness for users who do have a phone number).
alter table public.users
  alter column phone drop not null;
