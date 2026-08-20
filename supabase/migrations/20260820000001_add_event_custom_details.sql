alter table public.events
  add column custom_details jsonb not null default '[]'::jsonb;
