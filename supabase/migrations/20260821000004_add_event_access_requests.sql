create table public.event_access_requests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  reviewed_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (event_id, user_id)
);

create index event_access_requests_event_status_idx
  on public.event_access_requests(event_id, status);
create index event_access_requests_user_idx
  on public.event_access_requests(user_id);

-- The app still uses its MVP local identity, but this table is deliberately
-- not exposed through PostgREST. All reads and writes go through the bounded
-- security-definer functions below.
alter table public.event_access_requests enable row level security;
revoke all on public.event_access_requests from anon, authenticated;

create or replace function public.request_event_access(p_event_id uuid, p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  current_status text;
begin
  if not exists (select 1 from public.events where id = p_event_id)
    or not exists (select 1 from public.users where id = p_user_id)
  then
    raise exception 'Event or user not found';
  end if;

  if exists (
    select 1 from public.events e
    where e.id = p_event_id and (e.host_id = p_user_id or e.chef_id = p_user_id)
  ) or exists (
    select 1 from public.event_cohosts where event_id = p_event_id and user_id = p_user_id
  ) or exists (
    select 1 from public.rsvps where event_id = p_event_id and user_id = p_user_id
  ) then
    return 'member';
  end if;

  insert into public.event_access_requests(event_id, user_id, status)
  values (p_event_id, p_user_id, 'pending')
  on conflict (event_id, user_id) do update
    set status = case
          when event_access_requests.status = 'accepted' then 'accepted'
          else 'pending'
        end,
        reviewed_by = case
          when event_access_requests.status = 'accepted' then event_access_requests.reviewed_by
          else null
        end,
        reviewed_at = case
          when event_access_requests.status = 'accepted' then event_access_requests.reviewed_at
          else null
        end,
        updated_at = now()
  returning status into current_status;

  return current_status;
end;
$$;

create or replace function public.respond_to_event_access_request(
  p_request_id uuid,
  p_reviewer_id uuid,
  p_accept boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_event_id uuid;
begin
  select event_id into requested_event_id
  from public.event_access_requests
  where id = p_request_id and status = 'pending';

  if requested_event_id is null then return false; end if;

  if not exists (
    select 1 from public.events e
    where e.id = requested_event_id and e.host_id = p_reviewer_id
  ) and not exists (
    select 1 from public.event_cohosts c
    where c.event_id = requested_event_id and c.user_id = p_reviewer_id
  ) then
    return false;
  end if;

  update public.event_access_requests
  set status = case when p_accept then 'accepted' else 'rejected' end,
      reviewed_by = p_reviewer_id,
      reviewed_at = now(),
      updated_at = now()
  where id = p_request_id and status = 'pending';

  return found;
end;
$$;

create or replace function public.get_event_access_request_status(
  p_event_id uuid,
  p_user_id uuid
)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select status
  from public.event_access_requests
  where event_id = p_event_id and user_id = p_user_id
  limit 1
$$;

create or replace function public.list_pending_event_access_requests(
  p_event_id uuid,
  p_reviewer_id uuid
)
returns table (
  request_id uuid,
  user_id uuid,
  requester_name text,
  requester_photo_url text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not exists (
    select 1 from public.events e
    where e.id = p_event_id and e.host_id = p_reviewer_id
  ) and not exists (
    select 1 from public.event_cohosts c
    where c.event_id = p_event_id and c.user_id = p_reviewer_id
  ) then
    return;
  end if;

  return query
  select r.id, r.user_id, u.name, u.photo_url, r.created_at
  from public.event_access_requests r
  join public.users u on u.id = r.user_id
  where r.event_id = p_event_id and r.status = 'pending'
  order by r.created_at asc;
end;
$$;

create or replace function public.list_managed_event_access_request_counts(p_reviewer_id uuid)
returns table (event_id uuid, pending_count bigint)
language sql
security definer
set search_path = public
stable
as $$
  select r.event_id, count(*)
  from public.event_access_requests r
  where r.status = 'pending'
    and (
      exists (
        select 1 from public.events e
        where e.id = r.event_id and e.host_id = p_reviewer_id
      )
      or exists (
        select 1 from public.event_cohosts c
        where c.event_id = r.event_id and c.user_id = p_reviewer_id
      )
    )
  group by r.event_id
$$;

grant execute on function public.request_event_access(uuid, uuid) to anon, authenticated;
grant execute on function public.respond_to_event_access_request(uuid, uuid, boolean) to anon, authenticated;
grant execute on function public.get_event_access_request_status(uuid, uuid) to anon, authenticated;
grant execute on function public.list_pending_event_access_requests(uuid, uuid) to anon, authenticated;
grant execute on function public.list_managed_event_access_request_counts(uuid) to anon, authenticated;
