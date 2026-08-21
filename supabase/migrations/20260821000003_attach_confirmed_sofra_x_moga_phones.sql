-- Attach host-confirmed international numbers to the remaining historical
-- Sofra x Moga guests. Unknown numbers are intentionally left unchanged.

do $$
declare
  assignment record;
  sofra_x_moga_id constant uuid := 'db2c9c4f-7e8c-4d86-8c4d-1e9abfbcfa81';
  osama_id constant uuid := '109f941c-ac4a-48b6-9884-70b60006e41f';
  el_os_id constant uuid := 'd8125ad0-c835-48cf-ae8a-f7d8a6ec363c';
  os_duplicate_id constant uuid := '80d915e9-dd14-46e8-81f8-ca179f23e3d4';
  hassan_id constant uuid := 'cf6717b0-0a0d-4d54-87cb-0df6a7d63e43';
  ellabban_duplicate_id constant uuid := 'c29fcb84-bae8-4ff9-ac49-ab7be5b60432';
begin
  -- These numbers have no existing account, so retain each historical user ID
  -- and all of its relationships by normalizing the account in place.
  for assignment in
    select * from (values
      ('003677a8-51e2-417d-9ebe-803113d83ada'::uuid, 'Ibrahim Mahlab', '+201285625232'),
      ('7454a92a-6155-4c3a-b281-0505bde71754'::uuid, 'Andre Salib', '+201006555339'),
      ('0830da43-dd00-48a7-bd1e-b58244452ce6'::uuid, 'heddy', '+201233311111'),
      ('da452313-33fa-4dff-a38d-0e529cefcdf7'::uuid, 'Faysal Abukishk', '+201206960695'),
      ('697ed255-1878-4b4c-93f4-1e9fcbdd4289'::uuid, 'Tamara', '+201228883726'),
      ('1eac9ec6-fa9b-48eb-9445-b4189703c0c0'::uuid, 'Youssef Mekawi', '+201285444741')
    ) as assignments(user_id, expected_name, confirmed_phone)
  loop
    if not exists (
      select 1 from public.users
      where id = assignment.user_id
        and name = assignment.expected_name
        and phone is null
    ) then
      raise exception 'Historical account % no longer matches the confirmed assignment', assignment.user_id;
    end if;

    if exists (
      select 1 from public.users
      where phone = assignment.confirmed_phone and id <> assignment.user_id
    ) then
      raise exception 'Confirmed phone % is now held by another account', assignment.confirmed_phone;
    end if;

    update public.users
    set phone = assignment.confirmed_phone
    where id = assignment.user_id;
  end loop;

  -- +201110133132 was confirmed for both "El Os" and "Os". It already owns
  -- the newer Osama Soliman login account. Keep the richer going RSVP/profile
  -- from El Os and discard the later empty/maybe duplicate.
  if not exists (
    select 1 from public.users
    where id = osama_id and name = 'Osama Soliman' and phone = '+201110133132'
  ) or not exists (
    select 1 from public.users where id = el_os_id and name = 'El Os' and phone is null
  ) or not exists (
    select 1 from public.users where id = os_duplicate_id and name = 'Os' and phone is null
  ) then
    raise exception 'Osama/El Os/Os identities no longer match the confirmed audit';
  end if;

  if exists (select 1 from public.rsvps where user_id in (el_os_id, os_duplicate_id) and event_id <> sofra_x_moga_id)
    or exists (select 1 from public.event_cohosts where user_id in (el_os_id, os_duplicate_id))
    or exists (select 1 from public.events where host_id in (el_os_id, os_duplicate_id) or chef_id in (el_os_id, os_duplicate_id))
    or exists (select 1 from public.event_photos where uploaded_by in (el_os_id, os_duplicate_id))
    or exists (select 1 from public.event_photo_comments where user_id in (el_os_id, os_duplicate_id))
    or exists (select 1 from public.event_messages where user_id in (el_os_id, os_duplicate_id))
    or exists (select 1 from public.event_question_responses where user_id in (el_os_id, os_duplicate_id))
    or exists (select 1 from public.signatures where chef_id in (el_os_id, os_duplicate_id))
    or exists (select 1 from public.pantry_items where chef_id in (el_os_id, os_duplicate_id))
    or exists (select 1 from public.event_cohost_invites where accepted_by in (el_os_id, os_duplicate_id))
    or exists (select 1 from public.event_kitchen_invites where accepted_by in (el_os_id, os_duplicate_id))
  then
    raise exception 'Osama duplicate sources gained an unexpected reference';
  end if;

  if exists (select 1 from public.rsvps where user_id = osama_id)
    or exists (select 1 from public.taste_profiles where user_id = osama_id)
  then
    raise exception 'Osama target gained RSVP/preferences after the audit';
  end if;

  delete from public.rsvps where user_id = os_duplicate_id;
  delete from public.taste_profiles where user_id = os_duplicate_id;
  delete from public.users where id = os_duplicate_id;

  update public.rsvps set user_id = osama_id where user_id = el_os_id;
  update public.taste_profiles set user_id = osama_id where user_id = el_os_id;
  delete from public.users where id = el_os_id;

  -- +201096522112 confirms "Ellabban" was a duplicate of Hassan. Hassan's
  -- already-reconciled account has the later coherent profile and going RSVP,
  -- so retain those and remove only the duplicate source records.
  if not exists (
    select 1 from public.users
    where id = hassan_id and name = 'Hassan Ellabban' and phone = '+201096522112'
  ) or not exists (
    select 1 from public.users
    where id = ellabban_duplicate_id and name = 'Ellabban' and phone is null
  ) then
    raise exception 'Hassan/Ellabban identities no longer match the confirmed audit';
  end if;

  if exists (select 1 from public.rsvps where user_id = ellabban_duplicate_id and event_id <> sofra_x_moga_id)
    or exists (select 1 from public.event_cohosts where user_id = ellabban_duplicate_id)
    or exists (select 1 from public.events where host_id = ellabban_duplicate_id or chef_id = ellabban_duplicate_id)
    or exists (select 1 from public.event_photos where uploaded_by = ellabban_duplicate_id)
    or exists (select 1 from public.event_photo_comments where user_id = ellabban_duplicate_id)
    or exists (select 1 from public.event_messages where user_id = ellabban_duplicate_id)
    or exists (select 1 from public.event_question_responses where user_id = ellabban_duplicate_id)
    or exists (select 1 from public.signatures where chef_id = ellabban_duplicate_id)
    or exists (select 1 from public.pantry_items where chef_id = ellabban_duplicate_id)
    or exists (select 1 from public.event_cohost_invites where accepted_by = ellabban_duplicate_id)
    or exists (select 1 from public.event_kitchen_invites where accepted_by = ellabban_duplicate_id)
  then
    raise exception 'Ellabban duplicate gained an unexpected reference';
  end if;

  delete from public.rsvps where user_id = ellabban_duplicate_id;
  delete from public.taste_profiles where user_id = ellabban_duplicate_id;
  delete from public.users where id = ellabban_duplicate_id;
end
$$;
