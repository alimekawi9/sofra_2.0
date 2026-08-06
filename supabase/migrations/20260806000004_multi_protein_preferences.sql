alter table public.taste_profiles
  add column if not exists protein_preferences text[] not null default '{}';

update public.taste_profiles
set protein_preferences = case lower(trim(protein_anchor))
  when 'beef' then array['beef_lamb']
  when 'lamb' then array['beef_lamb']
  when 'red_meat' then array['beef_lamb']
  when 'chicken' then array['chicken']
  when 'fish' then array['fish']
  when 'shellfish' then array['shellfish']
  when 'seafood' then array['fish', 'shellfish']
  when 'vegetarian' then array['vegetable']
  when 'plant_based' then array['vegetable']
  when 'vegetable' then array['vegetable']
  when 'grain' then array['grain_pasta']
  when 'pasta' then array['grain_pasta']
  when 'no preference' then array['no_preference']
  when 'no_preference' then array['no_preference']
  else protein_preferences
end
where cardinality(protein_preferences) = 0 and protein_anchor is not null;

alter table public.taste_profiles
  add constraint taste_profiles_protein_preferences_valid check (
    cardinality(protein_preferences) <= 2
    and protein_preferences <@ array[
      'beef_lamb', 'chicken', 'fish', 'shellfish', 'vegetable',
      'grain_pasta', 'no_preference'
    ]::text[]
    and not (
      'no_preference' = any(protein_preferences)
      and cardinality(protein_preferences) > 1
    )
  );

drop function if exists public.submit_rsvp_preferences(
  uuid, uuid, public.rsvp_status, text[], text[], text, text[], integer
);

create function public.submit_rsvp_preferences(
  p_event_id uuid,
  p_user_id uuid,
  p_status public.rsvp_status,
  p_dietary text[],
  p_avoid text[],
  p_protein_preferences text[],
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
    user_id, dietary, avoid, protein_preferences, flavor_preference,
    adventurousness, updated_at
  ) values (
    p_user_id, p_dietary, p_avoid, p_protein_preferences,
    p_flavor_preference, p_adventurousness, now()
  )
  on conflict (user_id) do update set
    dietary = excluded.dietary,
    avoid = excluded.avoid,
    protein_preferences = excluded.protein_preferences,
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
