create table public.connections (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.users(id) on delete cascade,
  recipient_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  -- Kept as required provenance even if the originating event is later deleted.
  -- Deliberately not a foreign key: accepted personal connections outlive events.
  originating_event_id uuid not null,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  updated_at timestamptz not null default now(),
  check (requester_id <> recipient_id),
  check (
    (status = 'pending' and responded_at is null)
    or (status in ('accepted', 'declined') and responded_at is not null)
  )
);

create unique index connections_canonical_pair_idx
  on public.connections (least(requester_id, recipient_id), greatest(requester_id, recipient_id));
create index connections_recipient_status_idx on public.connections(recipient_id, status);
create index connections_requester_status_idx on public.connections(requester_id, status);

alter table public.connections enable row level security;
revoke all on public.connections from anon, authenticated;

create or replace function public.users_share_sofra(
  p_first_user_id uuid,
  p_second_user_id uuid,
  p_event_id uuid
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    p_first_user_id <> p_second_user_id
    and exists (
      select 1
      from public.events e
      where e.id = p_event_id
        and (
          e.host_id = p_first_user_id
          or exists (
            select 1 from public.event_cohosts c
            where c.event_id = e.id and c.user_id = p_first_user_id
          )
          or exists (
            select 1 from public.rsvps r
            where r.event_id = e.id and r.user_id = p_first_user_id
              and r.status in ('going', 'maybe')
          )
        )
        and (
          e.host_id = p_second_user_id
          or exists (
            select 1 from public.event_cohosts c
            where c.event_id = e.id and c.user_id = p_second_user_id
          )
          or exists (
            select 1 from public.rsvps r
            where r.event_id = e.id and r.user_id = p_second_user_id
              and r.status in ('going', 'maybe')
          )
        )
    )
$$;

create or replace function public.latest_shared_sofra(
  p_first_user_id uuid,
  p_second_user_id uuid
)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select e.id
  from public.events e
  where public.users_share_sofra(p_first_user_id, p_second_user_id, e.id)
  order by e.event_date desc nulls last, e.created_at desc, e.id
  limit 1
$$;

create or replace function public.request_connection(
  p_requester_id uuid,
  p_recipient_id uuid,
  p_originating_event_id uuid default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  supporting_event_id uuid;
  existing_connection public.connections%rowtype;
begin
  if p_requester_id = p_recipient_id then return 'invalid'; end if;
  if not exists (select 1 from public.users where id = p_requester_id)
    or not exists (select 1 from public.users where id = p_recipient_id)
  then
    return 'invalid';
  end if;

  supporting_event_id := coalesce(
    case
      when p_originating_event_id is not null
        and public.users_share_sofra(p_requester_id, p_recipient_id, p_originating_event_id)
      then p_originating_event_id
    end,
    public.latest_shared_sofra(p_requester_id, p_recipient_id)
  );
  if supporting_event_id is null then return 'not_eligible'; end if;

  select * into existing_connection
  from public.connections c
  where least(c.requester_id, c.recipient_id) = least(p_requester_id, p_recipient_id)
    and greatest(c.requester_id, c.recipient_id) = greatest(p_requester_id, p_recipient_id)
  limit 1;

  if existing_connection.id is null then
    insert into public.connections(requester_id, recipient_id, originating_event_id)
    values (p_requester_id, p_recipient_id, supporting_event_id);
    return 'pending';
  end if;

  if existing_connection.status = 'accepted' then return 'accepted'; end if;
  if existing_connection.status = 'pending' then return 'pending'; end if;
  if existing_connection.responded_at > now() - interval '2 days' then return 'cooldown'; end if;

  update public.connections
  set requester_id = p_requester_id,
      recipient_id = p_recipient_id,
      status = 'pending',
      originating_event_id = supporting_event_id,
      created_at = now(),
      responded_at = null,
      updated_at = now()
  where id = existing_connection.id;
  return 'pending';
end;
$$;

create or replace function public.respond_to_connection_request(
  p_request_id uuid,
  p_recipient_id uuid,
  p_accept boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.connections
  set status = case when p_accept then 'accepted' else 'declined' end,
      responded_at = now(),
      updated_at = now()
  where id = p_request_id
    and recipient_id = p_recipient_id
    and status = 'pending';
  return found;
end;
$$;

create or replace function public.get_connection_context(
  p_viewer_id uuid,
  p_profile_user_id uuid
)
returns table (
  request_id uuid,
  connection_status text,
  direction text,
  originating_event_id uuid,
  originating_event_title text,
  retry_after timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  existing_connection public.connections%rowtype;
  supporting_event_id uuid;
begin
  select * into existing_connection
  from public.connections c
  where least(c.requester_id, c.recipient_id) = least(p_viewer_id, p_profile_user_id)
    and greatest(c.requester_id, c.recipient_id) = greatest(p_viewer_id, p_profile_user_id)
  limit 1;

  if existing_connection.id is not null then
    return query
    select
      existing_connection.id,
      case
        when existing_connection.status = 'declined'
          and existing_connection.responded_at > now() - interval '2 days'
        then 'cooldown'
        when existing_connection.status = 'declined' then 'eligible'
        else existing_connection.status
      end,
      case
        when existing_connection.requester_id = p_viewer_id then 'outgoing'
        when existing_connection.recipient_id = p_viewer_id then 'incoming'
        else 'none'
      end,
      existing_connection.originating_event_id,
      e.title,
      case
        when existing_connection.status = 'declined'
        then existing_connection.responded_at + interval '2 days'
        else null
      end
    from (select 1) marker
    left join public.events e on e.id = existing_connection.originating_event_id;
    return;
  end if;

  supporting_event_id := public.latest_shared_sofra(p_viewer_id, p_profile_user_id);
  if supporting_event_id is not null then
    return query
    select null::uuid, 'eligible'::text, 'none'::text, e.id, e.title, null::timestamptz
    from public.events e where e.id = supporting_event_id;
  else
    return query
    select null::uuid, 'not_eligible'::text, 'none'::text, null::uuid, null::text, null::timestamptz;
  end if;
end;
$$;

create or replace function public.list_pending_connection_requests(p_recipient_id uuid)
returns table (
  request_id uuid,
  requester_id uuid,
  requester_name text,
  requester_photo_url text,
  originating_event_id uuid,
  originating_event_title text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select c.id, c.requester_id, u.name, u.photo_url,
    c.originating_event_id, e.title, c.created_at
  from public.connections c
  join public.users u on u.id = c.requester_id
  left join public.events e on e.id = c.originating_event_id
  where c.recipient_id = p_recipient_id and c.status = 'pending'
  order by c.created_at asc
$$;

create or replace function public.are_connected(p_first_user_id uuid, p_second_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select p_first_user_id = p_second_user_id or exists (
    select 1 from public.connections c
    where c.status = 'accepted'
      and least(c.requester_id, c.recipient_id) = least(p_first_user_id, p_second_user_id)
      and greatest(c.requester_id, c.recipient_id) = greatest(p_first_user_id, p_second_user_id)
  )
$$;

-- Preserve the visibility that existing users already had: every pair that
-- the former derived-mutual helper considered mutual becomes accepted.
with participants as (
  select r.event_id, r.user_id
  from public.rsvps r where r.status in ('going', 'maybe')
  union
  select e.id, e.host_id from public.events e
  union
  select c.event_id, c.user_id from public.event_cohosts c
), legacy_pairs as (
  select distinct on (least(a.user_id, b.user_id), greatest(a.user_id, b.user_id))
    least(a.user_id, b.user_id) as requester_id,
    greatest(a.user_id, b.user_id) as recipient_id,
    a.event_id as originating_event_id
  from participants a
  join participants b on b.event_id = a.event_id and b.user_id <> a.user_id
  join public.events e on e.id = a.event_id
  order by least(a.user_id, b.user_id), greatest(a.user_id, b.user_id),
    e.event_date desc nulls last, e.created_at desc
)
insert into public.connections(
  requester_id, recipient_id, status, originating_event_id, responded_at
)
select requester_id, recipient_id, 'accepted', originating_event_id, now()
from legacy_pairs
on conflict do nothing;

grant execute on function public.users_share_sofra(uuid, uuid, uuid) to anon, authenticated;
grant execute on function public.latest_shared_sofra(uuid, uuid) to anon, authenticated;
grant execute on function public.request_connection(uuid, uuid, uuid) to anon, authenticated;
grant execute on function public.respond_to_connection_request(uuid, uuid, boolean) to anon, authenticated;
grant execute on function public.get_connection_context(uuid, uuid) to anon, authenticated;
grant execute on function public.list_pending_connection_requests(uuid) to anon, authenticated;
grant execute on function public.are_connected(uuid, uuid) to anon, authenticated;
