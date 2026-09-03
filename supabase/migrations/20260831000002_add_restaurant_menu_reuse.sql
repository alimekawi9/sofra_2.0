create extension if not exists pg_trgm;

alter table public.restaurant_menus drop constraint if exists restaurant_menus_source_type_check;
alter table public.restaurant_menus
  add constraint restaurant_menus_source_type_check
  check (source_type in ('text', 'image', 'pdf', 'reused'));

create or replace function public.search_similar_restaurant_menu(p_user_id uuid, p_restaurant_name text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  with normalized as (
    select m.id, m.restaurant_name,
      similarity(
        lower(regexp_replace(m.restaurant_name, '[^a-zA-Z0-9 ]', '', 'g')),
        lower(regexp_replace(p_restaurant_name, '[^a-zA-Z0-9 ]', '', 'g'))
      ) as score,
      m.created_at
    from public.restaurant_menus m
    where exists (
      select 1 from public.users u where u.id = p_user_id
    )
    and char_length(btrim(coalesce(p_restaurant_name, ''))) >= 3
    and exists (
      select 1 from public.restaurant_menu_dishes d
      where d.restaurant_menu_id = m.id and d.review_status in ('confirmed', 'auto_confirmed')
    )
  ),
  best as (
    select id, restaurant_name from normalized
    where score > 0.45
    order by score desc, created_at desc
    limit 1
  )
  select case when best.id is null then null else jsonb_build_object(
    'restaurant_name', best.restaurant_name,
    'dishes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', d.name, 'role', d.role, 'tags', d.tags, 'contains_allergens', d.contains_allergens
      ) order by d.source_order, d.id)
      from public.restaurant_menu_dishes d
      where d.restaurant_menu_id = best.id and d.review_status in ('confirmed', 'auto_confirmed')
    ), '[]'::jsonb)
  ) end
  from best
$$;

grant execute on function public.search_similar_restaurant_menu(uuid, text) to anon, authenticated;

create or replace function public.reuse_restaurant_menu(
  p_event_id uuid,
  p_user_id uuid,
  p_restaurant_name text,
  p_dishes jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  menu_id uuid;
  dish jsonb;
  dish_index integer := 0;
  dish_name text;
  dish_role text;
begin
  if not public.can_access_event_restaurant_menus(p_event_id, p_user_id) then return null; end if;
  if char_length(btrim(coalesce(p_restaurant_name, ''))) not between 1 and 160 then return null; end if;
  if jsonb_typeof(p_dishes) <> 'array' or jsonb_array_length(p_dishes) < 1 or jsonb_array_length(p_dishes) > 80 then
    return null;
  end if;

  insert into public.restaurant_menus(event_id, created_by, restaurant_name, source_type, status, confirmed_at)
  values (p_event_id, p_user_id, btrim(p_restaurant_name), 'reused', 'confirmed', now())
  returning id into menu_id;

  for dish in select value from jsonb_array_elements(p_dishes)
  loop
    dish_name := btrim(coalesce(dish->>'name', ''));
    dish_role := coalesce(dish->>'role', 'flex');
    if char_length(dish_name) not between 1 and 160 or dish_role not in ('starter','main','side','dessert','flex') then
      raise exception 'Invalid reused dish';
    end if;
    insert into public.restaurant_menu_dishes(
      restaurant_menu_id, source_order, source_text, name,
      ai_suggested_role, ai_suggested_tags, ai_suggested_allergens, ai_confidence,
      role, tags, contains_allergens, review_status, reviewed_by, reviewed_at
    ) values (
      menu_id, dish_index, dish_name, dish_name,
      dish_role,
      array(select jsonb_array_elements_text(coalesce(dish->'tags', '[]'::jsonb))),
      array(select jsonb_array_elements_text(coalesce(dish->'contains_allergens', '[]'::jsonb))), 1,
      dish_role,
      array(select jsonb_array_elements_text(coalesce(dish->'tags', '[]'::jsonb))),
      array(select jsonb_array_elements_text(coalesce(dish->'contains_allergens', '[]'::jsonb))),
      'confirmed', p_user_id, now()
    );
    dish_index := dish_index + 1;
  end loop;
  return menu_id;
end
$$;

grant execute on function public.reuse_restaurant_menu(uuid, uuid, text, jsonb) to anon, authenticated;
