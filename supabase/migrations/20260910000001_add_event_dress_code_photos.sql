-- Host-curated reference photos illustrating an event's dress code (e.g. a
-- "cocktail attire" example image), distinct from event_photos (the guest-
-- contributed Shared Album): no uploader roster, no captions/comments, and
-- only the host/co-host ever adds or removes one. Reuses the existing
-- 'event-photos' storage bucket under a distinct path prefix rather than
-- provisioning a new bucket.
create table public.event_dress_code_photos (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  storage_path text not null unique,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index event_dress_code_photos_event_idx
  on public.event_dress_code_photos(event_id, sort_order);

-- This project currently uses its local user id rather than Supabase Auth and
-- has RLS disabled for MVP application tables (20260728000005_disable_rls_mvp).
alter table public.event_dress_code_photos disable row level security;
