alter table public.events
  add column if not exists estimated_guest_count integer,
  add column if not exists budget_amount numeric(12,2),
  add column if not exists budget_currency text not null default 'USD';

alter table public.events drop constraint if exists events_estimated_guest_count_positive;
alter table public.events add constraint events_estimated_guest_count_positive check (estimated_guest_count is null or estimated_guest_count > 0);
alter table public.events drop constraint if exists events_budget_amount_positive;
alter table public.events add constraint events_budget_amount_positive check (budget_amount is null or budget_amount > 0);

create table public.event_prep_items (
  event_id uuid not null references public.events(id) on delete cascade,
  item_key text not null,
  completed boolean not null default false,
  note text not null default '',
  completed_at timestamptz,
  updated_by uuid not null references public.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  primary key (event_id, item_key),
  constraint event_prep_item_key_check check (item_key in ('theme_concept','guest_budget','date_invites','signature_drink','decor','cameras','audio','dietary_review','timing_schedule','seating_finalized','photos_reminder','feedback'))
);

create table public.sofra_product_feedback (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null check (role in ('host','guest')),
  rating integer not null check (rating between 1 and 5),
  planning_ease integer check (planning_ease between 1 and 5),
  comment text not null default '',
  created_at timestamptz not null default now(),
  unique (event_id, user_id)
);

alter table public.event_prep_items enable row level security;
alter table public.sofra_product_feedback enable row level security;
revoke all on public.event_prep_items from anon, authenticated;
revoke all on public.sofra_product_feedback from anon, authenticated;

create or replace function public.get_event_prep_state(p_event_id uuid, p_manager_id uuid)
returns table (manual_items jsonb, menu_drafted boolean, feedback_submitted boolean)
language sql security definer set search_path = public stable as $$
  select
    coalesce((select jsonb_object_agg(i.item_key, jsonb_build_object('completed',i.completed,'note',i.note)) from public.event_prep_items i where i.event_id=p_event_id),'{}'::jsonb),
    exists(select 1 from public.menus m join public.menu_courses c on c.menu_id=m.id where m.event_id=p_event_id),
    exists(select 1 from public.sofra_product_feedback f where f.event_id=p_event_id and f.user_id=p_manager_id)
  where public.is_event_manager_user(p_event_id,p_manager_id)
$$;

create or replace function public.set_event_prep_item(p_event_id uuid, p_manager_id uuid, p_item_key text, p_completed boolean, p_note text default '')
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.is_event_manager_user(p_event_id,p_manager_id) then return false; end if;
  insert into public.event_prep_items(event_id,item_key,completed,note,completed_at,updated_by)
  values(p_event_id,p_item_key,p_completed,left(coalesce(p_note,''),500),case when p_completed then now() else null end,p_manager_id)
  on conflict(event_id,item_key) do update set completed=excluded.completed,note=excluded.note,completed_at=excluded.completed_at,updated_by=excluded.updated_by,updated_at=now();
  return true;
end $$;

create or replace function public.submit_sofra_feedback(p_event_id uuid,p_user_id uuid,p_rating integer,p_planning_ease integer,p_comment text)
returns boolean language plpgsql security definer set search_path = public as $$
declare user_role text;
begin
  if p_rating not between 1 and 5 or (p_planning_ease is not null and p_planning_ease not between 1 and 5) then return false; end if;
  if public.is_event_manager_user(p_event_id,p_user_id) then user_role := 'host';
  elsif exists(select 1 from public.rsvps r where r.event_id=p_event_id and r.user_id=p_user_id and r.status in ('going','maybe')) then user_role := 'guest';
  else return false; end if;
  insert into public.sofra_product_feedback(event_id,user_id,role,rating,planning_ease,comment)
  values(p_event_id,p_user_id,user_role,p_rating,p_planning_ease,left(coalesce(p_comment,''),2000))
  on conflict(event_id,user_id) do update set rating=excluded.rating,planning_ease=excluded.planning_ease,comment=excluded.comment;
  return true;
end $$;

create or replace function public.has_sofra_feedback(p_event_id uuid,p_user_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select case
    when public.is_event_manager_user(p_event_id,p_user_id)
      or exists(select 1 from public.rsvps r where r.event_id=p_event_id and r.user_id=p_user_id and r.status in ('going','maybe'))
    then exists(select 1 from public.sofra_product_feedback f where f.event_id=p_event_id and f.user_id=p_user_id)
    else false
  end
$$;

grant execute on function public.get_event_prep_state(uuid,uuid) to anon,authenticated;
grant execute on function public.set_event_prep_item(uuid,uuid,text,boolean,text) to anon,authenticated;
grant execute on function public.submit_sofra_feedback(uuid,uuid,integer,integer,text) to anon,authenticated;
grant execute on function public.has_sofra_feedback(uuid,uuid) to anon,authenticated;
