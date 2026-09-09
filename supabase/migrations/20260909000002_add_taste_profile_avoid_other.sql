alter table public.taste_profiles
  add column if not exists avoid_other text;
