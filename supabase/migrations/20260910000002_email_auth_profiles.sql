-- Bind Sofra's stable legacy profile ids to genuine Supabase Auth users.
-- Exact verified-email matches are the only automatic legacy merge.

alter table public.users
  add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null;

create index if not exists users_auth_user_id_idx on public.users(auth_user_id);

-- Retire the earlier phone-only prototype overload completely.
drop function if exists public.claim_current_user(text);

create or replace function public.current_app_user_id()
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select id from public.users where auth_user_id = auth.uid() limit 1
$$;

revoke all on function public.current_app_user_id() from public;
grant execute on function public.current_app_user_id() to authenticated, service_role;

create or replace function public.claim_current_user(
  p_name text default null,
  p_photo_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_auth_id uuid := auth.uid();
  v_email text;
  v_name text := nullif(btrim(p_name), '');
  v_photo text := nullif(btrim(p_photo_url), '');
  v_user public.users%rowtype;
  v_email_match_count integer;
begin
  if v_auth_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select lower(email) into v_email
  from auth.users
  where id = v_auth_id and email_confirmed_at is not null;

  if v_email is null then
    raise exception 'verified_email_required' using errcode = '42501';
  end if;

  select * into v_user from public.users where auth_user_id = v_auth_id limit 1;
  if found then
    update public.users
      set email = coalesce(email, v_email),
          name = coalesce(v_name, name),
          photo_url = coalesce(photo_url, v_photo)
      where id = v_user.id;
    return jsonb_build_object('userId', v_user.id, 'needsName', false);
  end if;

  select count(*) into v_email_match_count
  from public.users
  where lower(email) = v_email;

  if v_email_match_count > 1 then
    raise exception 'ambiguous_legacy_email' using errcode = '23505';
  end if;

  select * into v_user
  from public.users
  where lower(email) = v_email
  for update;

  if found then
    if v_user.auth_user_id is not null and v_user.auth_user_id <> v_auth_id then
      raise exception 'email_already_claimed' using errcode = '23505';
    end if;
    update public.users
      set auth_user_id = v_auth_id,
          name = coalesce(v_name, name),
          photo_url = coalesce(photo_url, v_photo)
      where id = v_user.id;
    return jsonb_build_object('userId', v_user.id, 'needsName', false);
  end if;

  if v_name is null then
    return jsonb_build_object('userId', null, 'needsName', true);
  end if;

  insert into public.users (id, auth_user_id, email, phone, name, photo_url)
  values (gen_random_uuid(), v_auth_id, v_email, null, v_name, v_photo)
  returning * into v_user;

  return jsonb_build_object('userId', v_user.id, 'needsName', false);
end
$$;

revoke all on function public.claim_current_user(text, text) from public, anon;
grant execute on function public.claim_current_user(text, text) to authenticated, service_role;
