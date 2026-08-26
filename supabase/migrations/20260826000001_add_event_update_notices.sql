create table public.event_update_notices (
  event_id uuid primary key references public.events(id) on delete cascade,
  notice_kinds text[] not null default '{}',
  changed_by uuid references public.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  dismissed_at timestamptz,
  check (notice_kinds <@ array['details', 'photos']::text[])
);

alter table public.event_update_notices enable row level security;
revoke all on public.event_update_notices from anon, authenticated;

create or replace function public.is_event_update_manager(p_event_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.events e
    where e.id = p_event_id and e.host_id = p_user_id
  ) or exists (
    select 1 from public.event_cohosts c
    where c.event_id = p_event_id and c.user_id = p_user_id
  )
$$;

create or replace function public.record_event_update_notice(
  p_event_id uuid,
  p_actor_id uuid,
  p_kind text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_kind not in ('details', 'photos') then return false; end if;

  if p_kind = 'details' and not public.is_event_update_manager(p_event_id, p_actor_id) then
    return false;
  end if;

  if p_kind = 'photos'
    and not public.is_event_update_manager(p_event_id, p_actor_id)
    and not exists (
      select 1 from public.rsvps r
      where r.event_id = p_event_id and r.user_id = p_actor_id
    )
  then
    return false;
  end if;

  insert into public.event_update_notices(event_id, notice_kinds, changed_by, changed_at, dismissed_at)
  values (p_event_id, array[p_kind], p_actor_id, now(), null)
  on conflict (event_id) do update
    set notice_kinds = case
          when event_update_notices.dismissed_at is null
            then array(select distinct unnest(event_update_notices.notice_kinds || excluded.notice_kinds))
          else excluded.notice_kinds
        end,
        changed_by = excluded.changed_by,
        changed_at = now(),
        dismissed_at = null;

  return true;
end;
$$;

create or replace function public.get_pending_event_update_notice(
  p_event_id uuid,
  p_manager_id uuid
)
returns table (notice_kinds text[], changed_at timestamptz)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_event_update_manager(p_event_id, p_manager_id) then return; end if;
  return query
    select n.notice_kinds, n.changed_at
    from public.event_update_notices n
    where n.event_id = p_event_id and n.dismissed_at is null;
end;
$$;

create or replace function public.dismiss_event_update_notice(
  p_event_id uuid,
  p_manager_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_event_update_manager(p_event_id, p_manager_id) then return false; end if;
  update public.event_update_notices
  set dismissed_at = now()
  where event_id = p_event_id and dismissed_at is null;
  return true;
end;
$$;

grant execute on function public.record_event_update_notice(uuid, uuid, text) to anon, authenticated;
grant execute on function public.get_pending_event_update_notice(uuid, uuid) to anon, authenticated;
grant execute on function public.dismiss_event_update_notice(uuid, uuid) to anon, authenticated;
