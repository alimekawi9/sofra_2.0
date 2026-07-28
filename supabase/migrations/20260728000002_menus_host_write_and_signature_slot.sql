-- supabase/migrations/20260728000002_menus_host_write_and_signature_slot.sql

-- 1. Widen menus write policies: chef-or-host
drop policy if exists menus_insert_chef on public.menus;
drop policy if exists menus_update_chef on public.menus;
drop policy if exists menus_delete_chef on public.menus;

create policy menus_insert_chef on public.menus
  for insert to authenticated
  with check (
    exists (
      select 1 from public.events e
      where e.id = event_id
        and (e.host_id = auth.uid() or e.chef_id = auth.uid())
    )
  );

create policy menus_update_chef on public.menus
  for update to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = event_id
        and (e.host_id = auth.uid() or e.chef_id = auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.events e
      where e.id = event_id
        and (e.host_id = auth.uid() or e.chef_id = auth.uid())
    )
  );

create policy menus_delete_chef on public.menus
  for delete to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = event_id
        and (e.host_id = auth.uid() or e.chef_id = auth.uid())
    )
  );

-- 2. Widen menu_courses write policies: chef-or-host
drop policy if exists menu_courses_insert_chef on public.menu_courses;
drop policy if exists menu_courses_update_chef on public.menu_courses;
drop policy if exists menu_courses_delete_chef on public.menu_courses;

create policy menu_courses_insert_chef on public.menu_courses
  for insert to authenticated
  with check (
    exists (
      select 1 from public.menus m
      join public.events e on e.id = m.event_id
      where m.id = menu_id
        and (e.host_id = auth.uid() or e.chef_id = auth.uid())
    )
  );

create policy menu_courses_update_chef on public.menu_courses
  for update to authenticated
  using (
    exists (
      select 1 from public.menus m
      join public.events e on e.id = m.event_id
      where m.id = menu_id
        and (e.host_id = auth.uid() or e.chef_id = auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.menus m
      join public.events e on e.id = m.event_id
      where m.id = menu_id
        and (e.host_id = auth.uid() or e.chef_id = auth.uid())
    )
  );

create policy menu_courses_delete_chef on public.menu_courses
  for delete to authenticated
  using (
    exists (
      select 1 from public.menus m
      join public.events e on e.id = m.event_id
      where m.id = menu_id
        and (e.host_id = auth.uid() or e.chef_id = auth.uid())
    )
  );

-- 3. Add slot column to signatures
alter table public.signatures
  add column if not exists slot text
    check (slot in ('start','sea','land','green','finish'));
