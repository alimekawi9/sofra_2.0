-- Older generic detail reminders cannot be split accurately after the fact.
-- Dismiss them rather than showing a misleading date/time/location claim.
update public.event_update_notices
set notice_kinds = array_remove(notice_kinds, 'details'),
    dismissed_at = coalesce(dismissed_at, now())
where 'details' = any(notice_kinds);

alter table public.event_update_notices
  drop constraint if exists event_update_notices_notice_kinds_check;

alter table public.event_update_notices
  add constraint event_update_notices_notice_kinds_check
  check (notice_kinds <@ array['date', 'time', 'location', 'photos']::text[]);

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
  if p_kind not in ('date', 'time', 'location', 'photos') then return false; end if;

  if p_kind in ('date', 'time', 'location')
    and not public.is_event_update_manager(p_event_id, p_actor_id)
  then
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
