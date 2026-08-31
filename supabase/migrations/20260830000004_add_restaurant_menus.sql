create table if not exists public.restaurant_menus (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  created_by uuid not null references public.users(id) on delete restrict,
  restaurant_name text not null check (char_length(btrim(restaurant_name)) between 1 and 160),
  source_type text not null check (source_type in ('text','image')),
  raw_menu_text text,
  status text not null default 'review' check (status in ('review','confirmed','failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz
);

create table if not exists public.restaurant_menu_dishes (
  id uuid primary key default gen_random_uuid(),
  restaurant_menu_id uuid not null references public.restaurant_menus(id) on delete cascade,
  source_order integer not null default 0,
  source_text text not null default '',
  name text not null check (char_length(btrim(name)) between 1 and 160),
  ai_suggested_role text not null check (ai_suggested_role in ('starter','main','side','dessert','flex')),
  ai_suggested_tags text[] not null default '{}',
  ai_suggested_allergens text[] not null default '{}',
  role text not null check (role in ('starter','main','side','dessert','flex')),
  tags text[] not null default '{}',
  contains_allergens text[] not null default '{}',
  review_status text not null default 'unconfirmed' check (review_status in ('unconfirmed','confirmed','excluded')),
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists restaurant_menus_event_created_idx on public.restaurant_menus(event_id, created_at desc);
create index if not exists restaurant_menu_dishes_menu_order_idx on public.restaurant_menu_dishes(restaurant_menu_id, source_order, id);

alter table public.restaurant_menus enable row level security;
alter table public.restaurant_menu_dishes enable row level security;
revoke all on public.restaurant_menus from anon, authenticated;
revoke all on public.restaurant_menu_dishes from anon, authenticated;

create or replace function public.can_access_event_restaurant_menus(p_event_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.events e
    where e.id = p_event_id
      and (public.is_event_manager_user(e.id, p_user_id) or e.chef_id = p_user_id)
  )
$$;

create or replace function public.get_event_restaurant_menus(p_event_id uuid, p_user_id uuid)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select case when public.can_access_event_restaurant_menus(p_event_id, p_user_id) then
    coalesce((
      select jsonb_agg(
        to_jsonb(m) || jsonb_build_object('dishes', coalesce((
          select jsonb_agg(to_jsonb(d) order by d.source_order, d.id)
          from public.restaurant_menu_dishes d where d.restaurant_menu_id = m.id
        ), '[]'::jsonb))
        order by m.created_at desc
      )
      from public.restaurant_menus m where m.event_id = p_event_id
    ), '[]'::jsonb)
  else null end
$$;

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
begin
  if not public.can_access_event_restaurant_menus(p_event_id, p_user_id) then return null; end if;
  if p_source_type not in ('text','image') or jsonb_typeof(p_dishes) <> 'array' then return null; end if;
  if char_length(btrim(coalesce(p_restaurant_name,''))) not between 1 and 160 then return null; end if;
  if jsonb_array_length(p_dishes) < 1 or jsonb_array_length(p_dishes) > 80 then return null; end if;

  insert into public.restaurant_menus(event_id,created_by,restaurant_name,source_type,raw_menu_text)
  values(p_event_id,p_user_id,btrim(p_restaurant_name),p_source_type,nullif(p_raw_menu_text,'')) returning id into menu_id;

  for dish in select value from jsonb_array_elements(p_dishes)
  loop
    dish_name := btrim(coalesce(dish->>'name',''));
    dish_role := coalesce(dish->>'suggestedRole','flex');
    if char_length(dish_name) not between 1 and 160 or dish_role not in ('starter','main','side','dessert','flex') then
      raise exception 'Invalid extracted dish';
    end if;
    insert into public.restaurant_menu_dishes(
      restaurant_menu_id,source_order,source_text,name,
      ai_suggested_role,ai_suggested_tags,ai_suggested_allergens,
      role,tags,contains_allergens
    ) values (
      menu_id,dish_index,left(coalesce(dish->>'sourceText',dish_name),500),dish_name,
      dish_role,array(select jsonb_array_elements_text(coalesce(dish->'suggestedTags','[]'::jsonb))),
      array(select jsonb_array_elements_text(coalesce(dish->'suggestedAllergens','[]'::jsonb))),
      dish_role,array(select jsonb_array_elements_text(coalesce(dish->'suggestedTags','[]'::jsonb))),
      array(select jsonb_array_elements_text(coalesce(dish->'suggestedAllergens','[]'::jsonb)))
    );
    dish_index := dish_index + 1;
  end loop;
  return menu_id;
end
$$;

create or replace function public.review_restaurant_menu_dish(
  p_dish_id uuid,
  p_user_id uuid,
  p_name text,
  p_role text,
  p_tags text[],
  p_allergens text[],
  p_review_status text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  menu_id uuid;
  event_id uuid;
begin
  select d.restaurant_menu_id,m.event_id into menu_id,event_id
  from public.restaurant_menu_dishes d join public.restaurant_menus m on m.id=d.restaurant_menu_id
  where d.id=p_dish_id;
  if menu_id is null or not public.can_access_event_restaurant_menus(event_id,p_user_id) then return false; end if;
  if char_length(btrim(coalesce(p_name,''))) not between 1 and 160
    or p_role not in ('starter','main','side','dessert','flex')
    or p_review_status not in ('confirmed','excluded') then return false; end if;

  update public.restaurant_menu_dishes set
    name=btrim(p_name), role=p_role, tags=coalesce(p_tags,'{}'), contains_allergens=coalesce(p_allergens,'{}'),
    review_status=p_review_status, reviewed_by=p_user_id, reviewed_at=now(), updated_at=now()
  where id=p_dish_id;

  update public.restaurant_menus set
    status=case when exists(select 1 from public.restaurant_menu_dishes where restaurant_menu_id=menu_id and review_status='unconfirmed') then 'review' else 'confirmed' end,
    confirmed_at=case when exists(select 1 from public.restaurant_menu_dishes where restaurant_menu_id=menu_id and review_status='unconfirmed') then null else now() end,
    updated_at=now()
  where id=menu_id;
  return true;
end
$$;

grant execute on function public.can_access_event_restaurant_menus(uuid,uuid) to anon,authenticated;
grant execute on function public.get_event_restaurant_menus(uuid,uuid) to anon,authenticated;
grant execute on function public.save_restaurant_menu_extraction(uuid,uuid,text,text,text,jsonb) to anon,authenticated;
grant execute on function public.review_restaurant_menu_dish(uuid,uuid,text,text,text[],text[],text) to anon,authenticated;
