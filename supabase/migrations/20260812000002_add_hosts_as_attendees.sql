insert into public.rsvps (event_id, user_id, status)
select id, host_id, 'going'::public.rsvp_status
from public.events
on conflict (event_id, user_id) do update set status = 'going'::public.rsvp_status;

create or replace function public.ensure_event_host_attends()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.rsvps (event_id, user_id, status)
  values (new.id, new.host_id, 'going'::public.rsvp_status)
  on conflict (event_id, user_id) do update set status = 'going'::public.rsvp_status;
  return new;
end;
$$;

drop trigger if exists events_ensure_host_attends on public.events;
create trigger events_ensure_host_attends
after insert or update of host_id on public.events
for each row execute function public.ensure_event_host_attends();
