alter table public.events
  add column if not exists is_published boolean;

-- Events created before this lifecycle existed were already live.
update public.events
set is_published = true
where is_published is null;

alter table public.events
  alter column is_published set default false,
  alter column is_published set not null;

create index if not exists events_is_published_idx
  on public.events (is_published);
