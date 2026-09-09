-- Backfill kitchen_type for events that completed kitchen setup before that column existed, so the
-- /kitchen-setup choice screen's redirect-skip logic (added in 20260909000001_add_event_kitchen_type.sql)
-- doesn't ask a chef who already finished setup to choose again.
--
-- Both signals below are unambiguous, not heuristic:
-- - Having at least one restaurant_menus row is only possible via the 'restaurant' path.
-- - kitchen_status is set to 'complete' in exactly one place in the whole codebase
--   (app/(chef)/kitchen/page.tsx's handlePantryDone, the finish step of the 'independent'
--   pantry/signatures flow) -- the restaurant path never sets it.

update public.events
set kitchen_type = 'restaurant'
where kitchen_type is null
  and id in (select distinct event_id from public.restaurant_menus);

update public.events
set kitchen_type = 'independent'
where kitchen_type is null
  and kitchen_status = 'complete';
