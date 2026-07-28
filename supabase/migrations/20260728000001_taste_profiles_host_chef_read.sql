-- supabase/migrations/20260728000001_taste_profiles_host_chef_read.sql
create policy taste_profiles_select_host_or_chef on public.taste_profiles
  for select to authenticated
  using (
    exists (
      select 1
      from public.rsvps r
      join public.events e on e.id = r.event_id
      where r.user_id = taste_profiles.user_id
        and r.status in ('going', 'maybe')
        and (e.host_id = auth.uid() or e.chef_id = auth.uid())
    )
  );
