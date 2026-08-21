-- One-off host-confirmed addition to Sofra x Moga.
-- Reuse Zein's account if the same Egyptian number already exists in a
-- legacy display format; otherwise create the normalized account.

do $$
declare
  sofra_x_moga_id constant uuid := 'db2c9c4f-7e8c-4d86-8c4d-1e9abfbcfa81';
  canonical_phone constant text := '+201094646969';
  expected_name constant text := 'Zein Abdelaziz';
  zein_id uuid;
  existing_name text;
  matching_accounts integer;
begin
  if not exists (select 1 from public.events where id = sofra_x_moga_id) then
    raise exception 'Sofra x Moga event no longer exists';
  end if;

  select count(*) into matching_accounts
  from public.users
  where regexp_replace(coalesce(phone, ''), '\D', '', 'g') in (
    '201094646969',
    '01094646969',
    '1094646969'
  );

  if matching_accounts > 1 then
    raise exception 'More than one account matches Zein phone %', canonical_phone;
  elsif matching_accounts = 1 then
    select id, name into zein_id, existing_name
    from public.users
    where regexp_replace(coalesce(phone, ''), '\D', '', 'g') in (
      '201094646969',
      '01094646969',
      '1094646969'
    );

    if lower(trim(existing_name)) <> lower(expected_name) then
      raise exception 'Phone % belongs to %, not %', canonical_phone, existing_name, expected_name;
    end if;

    update public.users set phone = canonical_phone where id = zein_id;
  else
    insert into public.users (phone, name)
    values (canonical_phone, expected_name)
    returning id into zein_id;
  end if;

  insert into public.rsvps (event_id, user_id, status)
  values (sofra_x_moga_id, zein_id, 'going')
  on conflict (event_id, user_id) do update set status = excluded.status;

  if not exists (
    select 1 from public.rsvps
    where event_id = sofra_x_moga_id and user_id = zein_id and status = 'going'
  ) then
    raise exception 'Zein RSVP was not attached to Sofra x Moga';
  end if;
end
$$;
