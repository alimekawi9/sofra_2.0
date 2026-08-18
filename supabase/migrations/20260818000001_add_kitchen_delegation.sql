alter table public.events
  add column if not exists kitchen_status text;

update public.events set kitchen_status = 'complete' where kitchen_status is null;

alter table public.events
  alter column kitchen_status set default 'pending',
  alter column kitchen_status set not null;

alter table public.events
  add constraint events_kitchen_status_check
  check (kitchen_status in ('pending', 'complete'));

create table public.event_kitchen_invites (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  token uuid not null default gen_random_uuid() unique,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  accepted_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index event_kitchen_invites_event_id_idx on public.event_kitchen_invites(event_id);
alter table public.event_kitchen_invites disable row level security;
grant select, insert, update, delete on public.event_kitchen_invites to anon, authenticated;

create or replace function public.accept_kitchen_invite(p_token uuid, p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invited_event_id uuid;
begin
  update event_kitchen_invites
  set status = 'accepted', accepted_by = p_user_id
  where token = p_token and status = 'pending'
  returning event_id into invited_event_id;

  if invited_event_id is null then return null; end if;

  update events
  set chef_id = p_user_id,
      kitchen_status = 'pending'
  where id = invited_event_id;

  return invited_event_id;
end;
$$;

grant execute on function public.accept_kitchen_invite(uuid, uuid) to anon, authenticated;
