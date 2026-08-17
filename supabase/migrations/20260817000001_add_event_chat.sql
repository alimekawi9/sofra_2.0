create table if not exists public.event_messages (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists event_messages_event_created_idx
  on public.event_messages(event_id, created_at);

-- This project currently uses application-level event membership checks under
-- its MVP anonymous-access model, matching RSVPs and the shared album.
alter table public.event_messages disable row level security;

do $$
begin
  alter publication supabase_realtime add table public.event_messages;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
