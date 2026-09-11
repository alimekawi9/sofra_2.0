-- One-time verified identity repair for Ali H. Mekawi.
-- Bind the exact Supabase Auth email to the existing phone-based Sofra profile.
-- Abort rather than guess if either identity is missing, duplicated, already
-- claimed by somebody else, or the newly-created duplicate has acquired data.

do $$
declare
  v_auth_id uuid;
  v_auth_count integer;
  v_legacy_id uuid;
  v_legacy_count integer;
  v_bound_auth_id uuid;
  v_duplicate_id uuid;
  v_duplicate_photo text;
  v_reference record;
  v_reference_count bigint;
begin
  select count(*)
    into v_auth_count
  from auth.users
  where lower(email) = 'alihmekawi@gmail.com';

  if v_auth_count <> 1 then
    raise exception 'Expected exactly one verified auth user for alihmekawi@gmail.com; found %', v_auth_count;
  end if;

  select id into v_auth_id
  from auth.users
  where lower(email) = 'alihmekawi@gmail.com';

  if not exists (
    select 1 from auth.users
    where id = v_auth_id and email_confirmed_at is not null
  ) then
    raise exception 'The auth email alihmekawi@gmail.com has not been verified';
  end if;

  select count(*)
    into v_legacy_count
  from public.users
  where regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') = '201271199929';

  if v_legacy_count <> 1 then
    raise exception 'Expected exactly one legacy profile for +201271199929; found %', v_legacy_count;
  end if;

  select id into v_legacy_id
  from public.users
  where regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') = '201271199929';

  select auth_user_id into v_bound_auth_id
  from public.users
  where id = v_legacy_id
  for update;

  if v_bound_auth_id is not null and v_bound_auth_id <> v_auth_id then
    raise exception 'The legacy profile is already bound to a different auth user';
  end if;

  select id, photo_url
    into v_duplicate_id, v_duplicate_photo
  from public.users
  where auth_user_id = v_auth_id
    and id <> v_legacy_id
  for update;

  if v_duplicate_id is not null then
    for v_reference in
      select source_ns.nspname as schema_name,
             source_table.relname as table_name,
             source_column.attname as column_name
      from pg_constraint constraint_row
      join pg_class source_table on source_table.oid = constraint_row.conrelid
      join pg_namespace source_ns on source_ns.oid = source_table.relnamespace
      join unnest(constraint_row.conkey) with ordinality source_key(attnum, position) on true
      join unnest(constraint_row.confkey) with ordinality target_key(attnum, position)
        on target_key.position = source_key.position
      join pg_attribute source_column
        on source_column.attrelid = source_table.oid and source_column.attnum = source_key.attnum
      join pg_attribute target_column
        on target_column.attrelid = constraint_row.confrelid and target_column.attnum = target_key.attnum
      where constraint_row.contype = 'f'
        and constraint_row.confrelid = 'public.users'::regclass
        and target_column.attname = 'id'
    loop
      execute format(
        'select count(*) from %I.%I where %I = $1',
        v_reference.schema_name,
        v_reference.table_name,
        v_reference.column_name
      ) into v_reference_count using v_duplicate_id;

      if v_reference_count > 0 then
        raise exception 'Duplicate profile % already has % reference(s) in %.%; merge manually',
          v_duplicate_id,
          v_reference_count,
          v_reference.schema_name,
          v_reference.table_name;
      end if;
    end loop;

    delete from public.users where id = v_duplicate_id;
  end if;

  update public.users
  set auth_user_id = v_auth_id,
      email = 'alihmekawi@gmail.com',
      photo_url = coalesce(photo_url, v_duplicate_photo)
  where id = v_legacy_id;

  raise notice 'Linked auth user % to legacy Sofra profile %', v_auth_id, v_legacy_id;
end
$$;
