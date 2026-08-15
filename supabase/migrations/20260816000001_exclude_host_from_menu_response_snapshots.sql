-- RSVP completion counts represent responding guests, not the host.
-- Existing snapshots were recorded from the planning headcount, which included
-- the host, so normalize them before the application starts writing guest-only
-- snapshots.
update public.menus
set generated_guest_count = greatest(0, generated_guest_count - 1)
where generated_guest_count is not null;

comment on column public.menus.generated_guest_count is
  'Number of non-host guests with a going or maybe RSVP when the menu was generated.';
