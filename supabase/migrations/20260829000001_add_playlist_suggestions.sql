create table if not exists public.playlist_suggestions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  song text not null check (char_length(btrim(song)) between 1 and 200),
  created_at timestamptz not null default now()
);

create index if not exists playlist_suggestions_event_created_idx
  on public.playlist_suggestions(event_id, created_at, id);

create or replace function public.enforce_playlist_suggestion_limit()
returns trigger
language plpgsql
as $$
begin
  -- Serialize submissions for one person/event so simultaneous requests
  -- cannot both observe two rows and create a fourth suggestion.
  perform pg_advisory_xact_lock(hashtext(new.event_id::text), hashtext(new.user_id::text));

  if (
    select count(*)
    from public.playlist_suggestions
    where event_id = new.event_id
      and user_id = new.user_id
  ) >= 3 then
    raise exception 'A guest can suggest at most 3 songs per event.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists playlist_suggestion_limit on public.playlist_suggestions;
create trigger playlist_suggestion_limit
before insert on public.playlist_suggestions
for each row execute function public.enforce_playlist_suggestion_limit();

-- Match Event Chat and Shared Album while Sofra still uses its local user-id
-- MVP. Event membership is checked before this UI is mounted; true database-
-- backed authentication and RLS remain required before production launch.
alter table public.playlist_suggestions disable row level security;

do $$
begin
  alter publication supabase_realtime add table public.playlist_suggestions;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
