alter table public.restaurant_menu_dishes
  add column if not exists ai_confidence numeric not null default 0 check (ai_confidence between 0 and 1),
  add column if not exists ai_uncertainties text[] not null default '{}';

alter table public.restaurant_menu_dishes
  drop constraint if exists restaurant_menu_dishes_review_status_check;

alter table public.restaurant_menu_dishes
  add constraint restaurant_menu_dishes_review_status_check
  check (review_status in ('unconfirmed','auto_confirmed','confirmed','excluded'));

create or replace function public.save_restaurant_menu_extraction(
  p_event_id uuid,
  p_user_id uuid,
  p_restaurant_name text,
  p_source_type text,
  p_raw_menu_text text,
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
  dish_role text;
  dish_name text;
  dish_confidence numeric;
  dish_uncertainties text[];
  dish_review_status text;
begin
  if not public.can_access_event_restaurant_menus(p_event_id, p_user_id) then return null; end if;
  if p_source_type not in ('text','image','pdf') or jsonb_typeof(p_dishes) <> 'array' then return null; end if;
  if char_length(btrim(coalesce(p_restaurant_name,''))) not between 1 and 160 then return null; end if;
  if jsonb_array_length(p_dishes) < 1 or jsonb_array_length(p_dishes) > 80 then return null; end if;

  insert into public.restaurant_menus(event_id,created_by,restaurant_name,source_type,raw_menu_text)
  values(p_event_id,p_user_id,btrim(p_restaurant_name),p_source_type,nullif(p_raw_menu_text,'')) returning id into menu_id;

  for dish in select value from jsonb_array_elements(p_dishes)
  loop
    dish_name := btrim(coalesce(dish->>'name',''));
    dish_role := coalesce(dish->>'suggestedRole','flex');
    dish_confidence := greatest(0, least(1, coalesce((dish->>'confidence')::numeric, 0)));
    dish_uncertainties := array(select left(value,180) from jsonb_array_elements_text(coalesce(dish->'uncertainties','[]'::jsonb)) limit 5);
    dish_review_status := case when dish_confidence >= 0.9 and cardinality(dish_uncertainties) = 0 then 'auto_confirmed' else 'unconfirmed' end;
    if char_length(dish_name) not between 1 and 160 or dish_role not in ('starter','main','side','dessert','flex') then
      raise exception 'Invalid extracted dish';
    end if;
    insert into public.restaurant_menu_dishes(
      restaurant_menu_id,source_order,source_text,name,
      ai_suggested_role,ai_suggested_tags,ai_suggested_allergens,ai_confidence,ai_uncertainties,
      role,tags,contains_allergens,review_status
    ) values (
      menu_id,dish_index,left(coalesce(dish->>'sourceText',dish_name),500),dish_name,
      dish_role,array(select jsonb_array_elements_text(coalesce(dish->'suggestedTags','[]'::jsonb))),
      array(select jsonb_array_elements_text(coalesce(dish->'suggestedAllergens','[]'::jsonb))),
      dish_confidence,dish_uncertainties,
      dish_role,array(select jsonb_array_elements_text(coalesce(dish->'suggestedTags','[]'::jsonb))),
      array(select jsonb_array_elements_text(coalesce(dish->'suggestedAllergens','[]'::jsonb))),dish_review_status
    );
    dish_index := dish_index + 1;
  end loop;

  update public.restaurant_menus set
    status=case when exists(select 1 from public.restaurant_menu_dishes where restaurant_menu_id=menu_id and review_status='unconfirmed') then 'review' else 'confirmed' end,
    confirmed_at=case when exists(select 1 from public.restaurant_menu_dishes where restaurant_menu_id=menu_id and review_status='unconfirmed') then null else now() end
  where id=menu_id;
  return menu_id;
end
$$;

grant execute on function public.save_restaurant_menu_extraction(uuid,uuid,text,text,text,jsonb) to anon,authenticated;
