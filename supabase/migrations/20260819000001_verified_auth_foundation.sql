-- Phase 1 security foundation: bind legacy Sofra profiles to verified
-- Supabase Auth identities without changing existing public.users ids.

alter table public.users
  add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null;

create index if not exists users_auth_user_id_idx on public.users(auth_user_id);

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

create or replace function public.claim_current_user(p_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_auth_id uuid := auth.uid();
  v_phone text;
  v_user public.users%rowtype;
  v_name text := nullif(btrim(p_name), '');
begin
  if v_auth_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  select phone into v_phone from auth.users where id = v_auth_id;
  if v_phone is null then raise exception 'verified_phone_required' using errcode = '42501'; end if;

  select * into v_user from public.users where auth_user_id = v_auth_id limit 1;
  if found then
    return jsonb_build_object('userId', v_user.id, 'needsName', false);
  end if;

  -- Lock a matching legacy account so the same phone cannot be claimed twice.
  select * into v_user from public.users where phone = v_phone for update;
  if found then
    if v_user.auth_user_id is not null and v_user.auth_user_id <> v_auth_id then
      raise exception 'phone_already_claimed' using errcode = '23505';
    end if;
    update public.users set auth_user_id = v_auth_id where id = v_user.id;
    return jsonb_build_object('userId', v_user.id, 'needsName', false);
  end if;

  if v_name is null then return jsonb_build_object('userId', null, 'needsName', true); end if;
  insert into public.users (id, auth_user_id, phone, name)
  values (gen_random_uuid(), v_auth_id, v_phone, v_name)
  returning * into v_user;
  return jsonb_build_object('userId', v_user.id, 'needsName', false);
end
$$;

revoke all on function public.claim_current_user(text) from public, anon;
grant execute on function public.claim_current_user(text) to authenticated, service_role;

-- Durable per-account API throttling for paid/expensive server operations.
create table if not exists public.api_rate_limits (
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 1 check (request_count > 0),
  primary key (auth_user_id, action, window_started_at)
);
alter table public.api_rate_limits enable row level security;
revoke all on table public.api_rate_limits from public, anon, authenticated;

create or replace function public.consume_api_rate_limit(
  p_action text,
  p_limit integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_auth_id uuid := auth.uid();
  v_window timestamptz;
  v_count integer;
begin
  if v_auth_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if p_action !~ '^[a-z0-9_]{1,64}$' or p_limit < 1 or p_window_seconds < 1 then
    raise exception 'invalid_rate_limit';
  end if;
  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.api_rate_limits(auth_user_id, action, window_started_at, request_count)
  values (v_auth_id, p_action, v_window, 1)
  on conflict (auth_user_id, action, window_started_at)
  do update set request_count = public.api_rate_limits.request_count + 1
  returning request_count into v_count;
  return v_count <= p_limit;
end
$$;

revoke all on function public.consume_api_rate_limit(text, integer, integer) from public, anon;
grant execute on function public.consume_api_rate_limit(text, integer, integer) to authenticated, service_role;
