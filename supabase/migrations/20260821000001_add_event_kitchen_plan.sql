alter table public.events
  add column if not exists kitchen_plan text;

alter table public.events
  add constraint events_kitchen_plan_check
  check (kitchen_plan in ('now', 'later', 'chef'));
