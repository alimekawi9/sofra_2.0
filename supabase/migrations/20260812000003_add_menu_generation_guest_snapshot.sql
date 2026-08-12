alter table public.menus
  add column if not exists generated_guest_count integer;

alter table public.menus
  drop constraint if exists menus_generated_guest_count_nonnegative;

alter table public.menus
  add constraint menus_generated_guest_count_nonnegative
  check (generated_guest_count is null or generated_guest_count >= 0);

comment on column public.menus.generated_guest_count is
  'Number of going/maybe RSVP guests included in the latest explicit menu generation.';
