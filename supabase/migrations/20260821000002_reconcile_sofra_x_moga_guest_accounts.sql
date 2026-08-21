-- Reconnect unphoned historical Sofra x Moga guests to the normalized phone
-- accounts they now use to sign in. These pairs were established by a manual
-- audit of names, creation times, event membership, and linked records.
--
-- The block is intentionally defensive and atomic: if a source/target changed,
-- gained an unexpected reference, or the target gained meaningful preferences
-- after the audit, the entire migration aborts without making a partial merge.

do $$
declare
  pair record;
  sofra_x_moga_id constant uuid := 'db2c9c4f-7e8c-4d86-8c4d-1e9abfbcfa81';
begin
  for pair in
    select * from (values
      ('461f2001-6f91-4685-b88e-d0111d5b2f4f'::uuid, '749adbf5-6414-49bc-917b-44882c5c91d2'::uuid, 'Seliem Shohdy', 'Seliem'),
      ('3f95f5eb-f237-4582-928d-0c4a056b17e9'::uuid, '5fd043e5-eb7e-4fb0-8755-6498db8f2b50'::uuid, 'Nour', 'Nour Ziwar'),
      ('44be72b5-7b54-46d8-b44f-2589a463e7ea'::uuid, '8f61e005-408b-4c04-a3a0-d58f48e452d4'::uuid, 'Mona', 'Mona'),
      ('d5f41c5d-52e0-4002-949d-f84241b832bb'::uuid, '81c074e0-3f9d-4e07-b257-2d5419350436'::uuid, 'Layla selim', 'Layla'),
      ('8f3f2073-e251-4e33-8b30-cf2821c69ee8'::uuid, 'cf6717b0-0a0d-4d54-87cb-0df6a7d63e43'::uuid, 'Hassan', 'Hassan Ellabban'),
      ('4d28f133-6ab1-45af-ab38-712ef854443a'::uuid, 'e13b2567-8b92-4652-8b39-ef2e959f88de'::uuid, 'Lujain Malash', 'Lujain Malash'),
      ('e9c5c561-7498-435f-8008-19199ee50bc8'::uuid, 'a9fb9c07-051f-4b1e-ba02-eb0fb19234b0'::uuid, 'Hussein Abdou', 'Hussein Abdou')
    ) as pairs(source_id, target_id, source_name, target_name)
  loop
    if not exists (
      select 1 from public.users
      where id = pair.source_id and name = pair.source_name and phone is null
    ) then
      raise exception 'Historical account % no longer matches the audited source', pair.source_id;
    end if;

    if not exists (
      select 1 from public.users
      where id = pair.target_id and name = pair.target_name and phone is not null
    ) then
      raise exception 'Phone account % no longer matches the audited target', pair.target_id;
    end if;

    if exists (select 1 from public.rsvps where user_id = pair.source_id and event_id <> sofra_x_moga_id)
      or exists (select 1 from public.event_cohosts where user_id = pair.source_id)
      or exists (select 1 from public.events where host_id = pair.source_id or chef_id = pair.source_id)
      or exists (select 1 from public.event_photos where uploaded_by = pair.source_id)
      or exists (select 1 from public.event_photo_comments where user_id = pair.source_id)
      or exists (select 1 from public.event_messages where user_id = pair.source_id)
      or exists (select 1 from public.event_question_responses where user_id = pair.source_id)
      or exists (select 1 from public.signatures where chef_id = pair.source_id)
      or exists (select 1 from public.pantry_items where chef_id = pair.source_id)
      or exists (select 1 from public.event_cohost_invites where accepted_by = pair.source_id)
      or exists (select 1 from public.event_kitchen_invites where accepted_by = pair.source_id)
    then
      raise exception 'Historical account % gained an unexpected reference; manual review required', pair.source_id;
    end if;

    if exists (
      select 1
      from public.taste_profiles
      where user_id = pair.target_id
        and (
          cardinality(coalesce(dietary, '{}'::text[])) > 0
          or cardinality(coalesce(avoid, '{}'::text[])) > 0
          or cardinality(coalesce(flavor_preference, '{}'::text[])) > 0
          or cardinality(coalesce(protein_preferences, '{}'::text[])) > 0
          or adventurousness <> 50
        )
    ) then
      raise exception 'Phone account % now has meaningful preferences; manual merge required', pair.target_id;
    end if;

    -- Keep the identity currently stored on the guest's device, while carrying
    -- over any historical presentation fields that the new account lacks.
    update public.users as target
    set photo_url = coalesce(target.photo_url, source.photo_url),
        caption = coalesce(target.caption, source.caption),
        email = coalesce(target.email, source.email)
    from public.users as source
    where target.id = pair.target_id and source.id = pair.source_id;

    -- If the new account RSVP'd again after following an update link, discard
    -- that duplicate and retain the original RSVP/status/timestamp.
    delete from public.rsvps as target_rsvp
    where target_rsvp.user_id = pair.target_id
      and exists (
        select 1 from public.rsvps as source_rsvp
        where source_rsvp.user_id = pair.source_id
          and source_rsvp.event_id = target_rsvp.event_id
      );

    update public.rsvps set user_id = pair.target_id where user_id = pair.source_id;

    -- Audited target profiles are absent or untouched defaults. Preserve the
    -- richer historical answers instead of allowing the empty retry to win.
    delete from public.taste_profiles where user_id = pair.target_id;
    update public.taste_profiles set user_id = pair.target_id where user_id = pair.source_id;

    delete from public.users where id = pair.source_id;
  end loop;
end
$$;
