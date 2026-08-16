create table public.event_cohost_invites (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  token uuid not null default gen_random_uuid() unique,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  accepted_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index event_cohost_invites_event_id_idx on public.event_cohost_invites(event_id);

create table public.event_cohosts (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index event_cohosts_user_id_idx on public.event_cohosts(user_id);

alter table public.event_cohost_invites disable row level security;
alter table public.event_cohosts disable row level security;
grant select, insert, update, delete on public.event_cohost_invites to anon, authenticated;
grant select, insert, update, delete on public.event_cohosts to anon, authenticated;

create or replace function public.respond_to_cohost_invite(
  p_token uuid,
  p_user_id uuid,
  p_accept boolean
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  invited_event_id uuid;
  original_host_id uuid;
begin
  update event_cohost_invites
  set status = case when p_accept then 'accepted' else 'declined' end,
      accepted_by = case when p_accept then p_user_id else null end
  where token = p_token and status = 'pending'
  returning event_id into invited_event_id;

  if invited_event_id is null then return false; end if;
  if not p_accept then return true; end if;

  select host_id into original_host_id from events where id = invited_event_id;
  if original_host_id = p_user_id then
    update event_cohost_invites set status = 'pending', accepted_by = null where token = p_token;
    return false;
  end if;

  insert into event_cohosts(event_id, user_id)
  values (invited_event_id, p_user_id)
  on conflict do nothing;
  return true;
end;
$$;
grant execute on function public.respond_to_cohost_invite(uuid, uuid, boolean) to anon, authenticated;
