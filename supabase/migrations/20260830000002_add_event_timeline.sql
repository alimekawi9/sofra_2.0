create table public.event_timeline_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 120),
  time_of_day time without time zone not null,
  position integer not null default 0,
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index event_timeline_items_event_time_idx
  on public.event_timeline_items(event_id, time_of_day, position, id);

alter table public.event_timeline_items enable row level security;
revoke all on public.event_timeline_items from anon, authenticated;

create or replace function public.get_event_timeline(p_event_id uuid, p_manager_id uuid)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select case when public.is_event_manager_user(p_event_id, p_manager_id) then
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'title', i.title,
        'time', to_char(i.time_of_day, 'HH24:MI'),
        'position', i.position
      ) order by i.time_of_day, i.position, i.id)
      from public.event_timeline_items i where i.event_id = p_event_id
    ), '[]'::jsonb)
  else null end
$$;

create or replace function public.save_event_timeline(p_event_id uuid, p_manager_id uuid, p_items jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  item_count integer;
  item_position integer := 0;
  parsed_time time;
  parsed_title text;
begin
  if not public.is_event_manager_user(p_event_id, p_manager_id) then return false; end if;
  if jsonb_typeof(p_items) <> 'array' then return false; end if;
  item_count := jsonb_array_length(p_items);
  if item_count < 1 or item_count > 30 then return false; end if;

  delete from public.event_timeline_items where event_id = p_event_id;
  for item in select value from jsonb_array_elements(p_items)
  loop
    parsed_title := trim(coalesce(item->>'title', ''));
    if char_length(parsed_title) < 1 or char_length(parsed_title) > 120 then raise exception 'Invalid timeline title'; end if;
    begin parsed_time := (item->>'time')::time; exception when others then raise exception 'Invalid timeline time'; end;
    insert into public.event_timeline_items(event_id, title, time_of_day, position, created_by)
    values (p_event_id, parsed_title, parsed_time, item_position, p_manager_id);
    item_position := item_position + 1;
  end loop;

  insert into public.event_prep_items(event_id,item_key,completed,note,completed_at,updated_by)
  values(p_event_id,'timing_schedule',true,'',now(),p_manager_id)
  on conflict(event_id,item_key) do update set completed=true,completed_at=now(),updated_by=excluded.updated_by,updated_at=now();
  return true;
end
$$;

grant execute on function public.get_event_timeline(uuid,uuid) to anon,authenticated;
grant execute on function public.save_event_timeline(uuid,uuid,jsonb) to anon,authenticated;
