alter table public.events
  add column if not exists kitchen_type text;

alter table public.events
  add constraint events_kitchen_type_check
  check (kitchen_type in ('independent', 'restaurant'));
