-- The post-event guest photo gate asks one safety-specific question.
-- Host product feedback continues to use the existing rating/ease/comment RPC.

alter table public.sofra_product_feedback
  alter column rating drop not null,
  add column if not exists dietary_needs_missed boolean;

create or replace function public.submit_guest_dietary_feedback(
  p_event_id uuid,
  p_user_id uuid,
  p_dietary_needs_missed boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_dietary_needs_missed is null then return false; end if;

  if not exists (
    select 1
    from public.rsvps r
    join public.events e on e.id = r.event_id
    where r.event_id = p_event_id
      and r.user_id = p_user_id
      and r.status in ('going', 'maybe')
      and e.event_date <= now()
  ) then
    return false;
  end if;

  insert into public.sofra_product_feedback(
    event_id, user_id, role, rating, planning_ease, comment, dietary_needs_missed
  ) values (
    p_event_id, p_user_id, 'guest', null, null, '', p_dietary_needs_missed
  )
  on conflict(event_id, user_id) do update
    set dietary_needs_missed = excluded.dietary_needs_missed;

  return true;
end
$$;

revoke all on function public.submit_guest_dietary_feedback(uuid,uuid,boolean) from public;
grant execute on function public.submit_guest_dietary_feedback(uuid,uuid,boolean) to anon, authenticated;
