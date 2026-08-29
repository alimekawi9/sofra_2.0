create table public.event_seating_participation (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  participating boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create table public.event_seating_layouts (
  event_id uuid primary key references public.events(id) on delete cascade,
  assignments jsonb not null default '[]'::jsonb check (jsonb_typeof(assignments) = 'array'),
  algorithm_version text not null default 'connections-v1',
  manually_modified boolean not null default false,
  version integer not null default 1 check (version > 0),
  created_by uuid not null references public.users(id) on delete restrict,
  updated_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.event_seating_participation enable row level security;
alter table public.event_seating_layouts enable row level security;
revoke all on public.event_seating_participation from anon, authenticated;
revoke all on public.event_seating_layouts from anon, authenticated;

create or replace function public.is_event_manager_user(p_event_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.events e where e.id = p_event_id and e.host_id = p_user_id
  ) or exists (
    select 1 from public.event_cohosts c where c.event_id = p_event_id and c.user_id = p_user_id
  )
$$;

create or replace function public.event_seating_user_participates(p_event_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select case
    when public.is_event_manager_user(p_event_id, p_user_id) then coalesce(
      (select p.participating from public.event_seating_participation p
       where p.event_id = p_event_id and p.user_id = p_user_id),
      true
    )
    else exists (
      select 1 from public.rsvps r
      where r.event_id = p_event_id and r.user_id = p_user_id
        and r.status in ('going', 'maybe')
    )
  end
$$;

create or replace function public.set_event_seating_participation(
  p_event_id uuid,
  p_user_id uuid,
  p_participating boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_event_manager_user(p_event_id, p_user_id) then return false; end if;
  insert into public.event_seating_participation(event_id, user_id, participating)
  values (p_event_id, p_user_id, p_participating)
  on conflict (event_id, user_id) do update
    set participating = excluded.participating, updated_at = now();
  return true;
end;
$$;

create or replace function public.list_event_seating_participation(
  p_event_id uuid,
  p_manager_id uuid
)
returns table (user_id uuid, participating boolean)
language sql
security definer
set search_path = public
stable
as $$
  select p.user_id, p.participating
  from public.event_seating_participation p
  where p.event_id = p_event_id
    and public.is_event_manager_user(p_event_id, p_manager_id)
$$;

create or replace function public.get_event_seating_layout(
  p_event_id uuid,
  p_manager_id uuid
)
returns table (
  assignments jsonb,
  algorithm_version text,
  manually_modified boolean,
  version integer,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select l.assignments, l.algorithm_version, l.manually_modified, l.version, l.updated_at
  from public.event_seating_layouts l
  where l.event_id = p_event_id
    and public.is_event_manager_user(p_event_id, p_manager_id)
$$;

create or replace function public.get_event_seating_signals(
  p_event_id uuid,
  p_manager_id uuid
)
returns table (
  first_user_id uuid,
  second_user_id uuid,
  connection_status text,
  shared_past_count bigint
)
language sql
security definer
set search_path = public
stable
as $$
  with current_participants as (
    select distinct candidate.user_id
    from (
      select r.user_id from public.rsvps r
      where r.event_id = p_event_id and r.status in ('going', 'maybe')
      union all
      select e.host_id from public.events e where e.id = p_event_id
      union all
      select c.user_id from public.event_cohosts c where c.event_id = p_event_id
    ) candidate
    where public.event_seating_user_participates(p_event_id, candidate.user_id)
  ), pairs as (
    select a.user_id as first_user_id, b.user_id as second_user_id
    from current_participants a
    join current_participants b on a.user_id < b.user_id
  ), all_participation as (
    select r.event_id, r.user_id from public.rsvps r where r.status in ('going', 'maybe')
    union
    select e.id, e.host_id from public.events e
    union
    select c.event_id, c.user_id from public.event_cohosts c
  )
  select
    p.first_user_id,
    p.second_user_id,
    coalesce(c.status, 'none') as connection_status,
    (
      select count(distinct a.event_id)
      from all_participation a
      join all_participation b on b.event_id = a.event_id
      where a.user_id = p.first_user_id
        and b.user_id = p.second_user_id
        and a.event_id <> p_event_id
    ) as shared_past_count
  from pairs p
  left join public.connections c
    on least(c.requester_id, c.recipient_id) = p.first_user_id
   and greatest(c.requester_id, c.recipient_id) = p.second_user_id
  where public.is_event_manager_user(p_event_id, p_manager_id)
$$;

create or replace function public.save_event_seating_layout(
  p_event_id uuid,
  p_manager_id uuid,
  p_assignments jsonb,
  p_expected_version integer,
  p_manually_modified boolean
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  current_version integer;
  assignment_count integer;
begin
  if not public.is_event_manager_user(p_event_id, p_manager_id) then return -1; end if;
  if jsonb_typeof(p_assignments) <> 'array' then return -1; end if;

  assignment_count := jsonb_array_length(p_assignments);
  if assignment_count <> (
    select count(*)
    from (
      select distinct candidate.user_id
      from (
        select r.user_id from public.rsvps r
        where r.event_id = p_event_id and r.status in ('going', 'maybe')
        union all select e.host_id from public.events e where e.id = p_event_id
        union all select c.user_id from public.event_cohosts c where c.event_id = p_event_id
      ) candidate
      where public.event_seating_user_participates(p_event_id, candidate.user_id)
    ) participants
  ) then return -2; end if;

  if exists (
    select 1 from jsonb_array_elements(p_assignments) value
    where not public.event_seating_user_participates(p_event_id, (value->>'userId')::uuid)
  ) then return -2; end if;
  if assignment_count <> (
    select count(distinct value->>'userId') from jsonb_array_elements(p_assignments) value
  ) then return -2; end if;

  select l.version into current_version from public.event_seating_layouts l
  where l.event_id = p_event_id for update;

  if current_version is null then
    if p_expected_version <> 0 then return -3; end if;
    insert into public.event_seating_layouts(
      event_id, assignments, manually_modified, created_by, updated_by
    ) values (
      p_event_id, p_assignments, p_manually_modified, p_manager_id, p_manager_id
    );
    return 1;
  end if;

  if current_version <> p_expected_version then return -3; end if;
  update public.event_seating_layouts
  set assignments = p_assignments,
      manually_modified = p_manually_modified,
      version = version + 1,
      updated_by = p_manager_id,
      updated_at = now()
  where event_id = p_event_id;
  return current_version + 1;
end;
$$;

grant execute on function public.is_event_manager_user(uuid, uuid) to anon, authenticated;
grant execute on function public.event_seating_user_participates(uuid, uuid) to anon, authenticated;
grant execute on function public.set_event_seating_participation(uuid, uuid, boolean) to anon, authenticated;
grant execute on function public.list_event_seating_participation(uuid, uuid) to anon, authenticated;
grant execute on function public.get_event_seating_layout(uuid, uuid) to anon, authenticated;
grant execute on function public.get_event_seating_signals(uuid, uuid) to anon, authenticated;
grant execute on function public.save_event_seating_layout(uuid, uuid, jsonb, integer, boolean) to anon, authenticated;
