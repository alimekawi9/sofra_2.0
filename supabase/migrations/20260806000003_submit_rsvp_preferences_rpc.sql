-- Atomically persist an RSVP and its user's reusable taste profile.
-- Both tables already have the unique keys used by these upserts.
create or replace function public.submit_rsvp_preferences(
  p_event_id uuid,
  p_user_id uuid,
  p_status public.rsvp_status,
  p_dietary text[],
  p_avoid text[],
  p_protein_anchor text,
  p_flavor_preference text[],
  p_adventurousness integer
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not exists (select 1 from public.users where id = p_user_id) then
    raise exception using errcode = 'P0002', message = 'user_not_found';
  end if;

  if not exists (select 1 from public.events where id = p_event_id) then
    raise exception using errcode = 'P0002', message = 'event_not_found';
  end if;

  insert into public.taste_profiles (
    user_id, dietary, avoid, protein_anchor, flavor_preference,
    adventurousness, updated_at
  ) values (
    p_user_id, p_dietary, p_avoid, p_protein_anchor, p_flavor_preference,
    p_adventurousness, now()
  )
  on conflict (user_id) do update set
    dietary = excluded.dietary,
    avoid = excluded.avoid,
    protein_anchor = excluded.protein_anchor,
    flavor_preference = excluded.flavor_preference,
    adventurousness = excluded.adventurousness,
    updated_at = excluded.updated_at;

  insert into public.rsvps (event_id, user_id, status)
  values (p_event_id, p_user_id, p_status)
  on conflict (event_id, user_id) do update set status = excluded.status;

  return jsonb_build_object(
    'success', true,
    'eventId', p_event_id,
    'userId', p_user_id,
    'nextPath', '/events/' || p_event_id::text
  );
end;
$$;
