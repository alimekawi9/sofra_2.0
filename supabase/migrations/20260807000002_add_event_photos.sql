create table public.event_photos (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  uploaded_by uuid not null references public.users(id) on delete cascade,
  storage_path text not null unique,
  created_at timestamptz not null default now()
);

create index event_photos_event_created_idx
  on public.event_photos(event_id, created_at desc);

-- This project currently uses its local user id rather than Supabase Auth and
-- has RLS disabled for MVP application tables (20260728000005_disable_rls_mvp).
alter table public.event_photos disable row level security;
