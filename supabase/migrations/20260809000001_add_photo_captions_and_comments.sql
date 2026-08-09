alter table public.event_photos
  add column caption text,
  add column upload_batch_id uuid;

create index event_photos_batch_idx
  on public.event_photos(upload_batch_id);

create table public.event_photo_comments (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references public.event_photos(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index event_photo_comments_photo_created_idx
  on public.event_photo_comments(photo_id, created_at);

-- Same MVP posture as event_photos (20260807000002): local user id rather
-- than Supabase Auth, RLS disabled for MVP application tables
-- (20260728000005_disable_rls_mvp).
alter table public.event_photo_comments disable row level security;
