with menu_stats as (
  select
    m.id,
    m.event_id,
    m.generated_at,
    count(mc.id) as course_count,
    count(mc.id) filter (where mc.locked) as locked_count
  from public.menus m
  left join public.menu_courses mc on mc.menu_id = m.id
  group by m.id, m.event_id, m.generated_at
), ranked as (
  select id, row_number() over (
    partition by event_id
    order by locked_count desc, course_count desc, generated_at desc, id
  ) as position
  from menu_stats
)
delete from public.menus m
using ranked r
where m.id = r.id and r.position > 1;

create unique index if not exists menus_event_id_unique_idx
  on public.menus (event_id);
