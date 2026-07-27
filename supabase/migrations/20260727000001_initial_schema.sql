-- Sofra initial schema
--
-- RLS assumption: public.users.id is expected to equal auth.users.id (i.e. on
-- signup, insert the profile row with id = auth.uid()). If you'd rather have
-- Postgres enforce that, change the users.id definition to:
--   id uuid primary key references auth.users(id) on delete cascade
-- and drop the gen_random_uuid() default. All policies below compare against
-- auth.uid() on that basis.

create extension if not exists "pgcrypto";

-- =========================================================================
-- Enums
-- =========================================================================

create type rsvp_status as enum ('going', 'maybe', 'cant');

-- =========================================================================
-- Tables
-- =========================================================================

create table public.users (
  id         uuid primary key default gen_random_uuid(),
  phone      text unique not null,
  name       text not null,
  photo_url  text,
  created_at timestamptz not null default now()
);

create table public.events (
  id         uuid primary key default gen_random_uuid(),
  host_id    uuid not null references public.users(id) on delete cascade,
  chef_id    uuid references public.users(id) on delete set null,
  title      text not null,
  tagline    text,
  event_date timestamptz not null,
  venue      text,
  address    text,
  dress_code text,
  theme      text default 'ember',
  cover_url  text,
  created_at timestamptz not null default now()
);
create index events_host_id_idx on public.events(host_id);
create index events_chef_id_idx on public.events(chef_id);

create table public.rsvps (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events(id) on delete cascade,
  user_id    uuid not null references public.users(id) on delete cascade,
  status     rsvp_status not null,
  created_at timestamptz not null default now(),
  unique (event_id, user_id)
);
create index rsvps_user_id_idx on public.rsvps(user_id);

create table public.taste_profiles (
  user_id         uuid primary key references public.users(id) on delete cascade,
  dietary         text[] not null default '{}',
  avoid           text[] not null default '{}',
  drinks          text[] not null default '{}',
  adventurousness int not null default 50 check (adventurousness between 0 and 100),
  updated_at      timestamptz not null default now()
);

create table public.signatures (
  id                 uuid primary key default gen_random_uuid(),
  chef_id            uuid not null references public.users(id) on delete cascade,
  name               text not null,
  tags               text[] not null default '{}',
  contains_allergens text[] not null default '{}',
  created_at         timestamptz not null default now()
);
create index signatures_chef_id_idx on public.signatures(chef_id);

create table public.pantry_items (
  id         uuid primary key default gen_random_uuid(),
  chef_id    uuid not null references public.users(id) on delete cascade,
  name       text not null,
  week_of    date not null,
  created_at timestamptz not null default now()
);
create index pantry_items_chef_week_idx on public.pantry_items(chef_id, week_of);

create table public.menus (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events(id) on delete cascade,
  generated_at timestamptz not null default now()
);
create index menus_event_id_idx on public.menus(event_id);

create table public.menu_courses (
  id          uuid primary key default gen_random_uuid(),
  menu_id     uuid not null references public.menus(id) on delete cascade,
  slot        text not null,
  dish_name   text not null,
  dish_origin text,
  locked      boolean not null default false,
  source      text,
  sort_order  int not null default 0
);
create index menu_courses_menu_id_idx on public.menu_courses(menu_id);

-- =========================================================================
-- Row Level Security
-- =========================================================================

alter table public.users          enable row level security;
alter table public.events         enable row level security;
alter table public.rsvps          enable row level security;
alter table public.taste_profiles enable row level security;
alter table public.signatures     enable row level security;
alter table public.pantry_items   enable row level security;
alter table public.menus          enable row level security;
alter table public.menu_courses   enable row level security;

-- ---- users --------------------------------------------------------------
-- Read: any authenticated user (need to see hosts / chefs / other guests).
-- Write: only your own row.

create policy users_select_authenticated on public.users
  for select to authenticated using (true);

create policy users_insert_self on public.users
  for insert to authenticated
  with check (id = auth.uid());

create policy users_update_self on public.users
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---- events -------------------------------------------------------------
-- Read: any authenticated user.
-- Write: only the host.

create policy events_select_authenticated on public.events
  for select to authenticated using (true);

create policy events_insert_host on public.events
  for insert to authenticated
  with check (host_id = auth.uid());

create policy events_update_host on public.events
  for update to authenticated
  using (host_id = auth.uid())
  with check (host_id = auth.uid());

create policy events_delete_host on public.events
  for delete to authenticated
  using (host_id = auth.uid());

-- ---- rsvps --------------------------------------------------------------
-- Read: your own rsvp, or any rsvp on an event you host.
-- Write: only your own rsvp.

create policy rsvps_select_self_or_host on public.rsvps
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.events e
      where e.id = rsvps.event_id and e.host_id = auth.uid()
    )
  );

create policy rsvps_insert_self on public.rsvps
  for insert to authenticated
  with check (user_id = auth.uid());

create policy rsvps_update_self on public.rsvps
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy rsvps_delete_self on public.rsvps
  for delete to authenticated
  using (user_id = auth.uid());

-- ---- taste_profiles -----------------------------------------------------
-- Read/write: only your own profile.

create policy taste_profiles_select_self on public.taste_profiles
  for select to authenticated
  using (user_id = auth.uid());

create policy taste_profiles_insert_self on public.taste_profiles
  for insert to authenticated
  with check (user_id = auth.uid());

create policy taste_profiles_update_self on public.taste_profiles
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy taste_profiles_delete_self on public.taste_profiles
  for delete to authenticated
  using (user_id = auth.uid());

-- ---- signatures ---------------------------------------------------------
-- Read: any authenticated user (chef portfolio).
-- Write: only the chef who owns the row.

create policy signatures_select_authenticated on public.signatures
  for select to authenticated using (true);

create policy signatures_insert_chef on public.signatures
  for insert to authenticated
  with check (chef_id = auth.uid());

create policy signatures_update_chef on public.signatures
  for update to authenticated
  using (chef_id = auth.uid())
  with check (chef_id = auth.uid());

create policy signatures_delete_chef on public.signatures
  for delete to authenticated
  using (chef_id = auth.uid());

-- ---- pantry_items -------------------------------------------------------
-- Read: any authenticated user.
-- Write: only the chef who owns the row.

create policy pantry_items_select_authenticated on public.pantry_items
  for select to authenticated using (true);

create policy pantry_items_insert_chef on public.pantry_items
  for insert to authenticated
  with check (chef_id = auth.uid());

create policy pantry_items_update_chef on public.pantry_items
  for update to authenticated
  using (chef_id = auth.uid())
  with check (chef_id = auth.uid());

create policy pantry_items_delete_chef on public.pantry_items
  for delete to authenticated
  using (chef_id = auth.uid());

-- ---- menus --------------------------------------------------------------
-- Read: any authenticated user.
-- Write: only the chef assigned to the parent event.

create policy menus_select_authenticated on public.menus
  for select to authenticated using (true);

create policy menus_insert_chef on public.menus
  for insert to authenticated
  with check (
    exists (
      select 1 from public.events e
      where e.id = menus.event_id and e.chef_id = auth.uid()
    )
  );

create policy menus_update_chef on public.menus
  for update to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = menus.event_id and e.chef_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.events e
      where e.id = menus.event_id and e.chef_id = auth.uid()
    )
  );

create policy menus_delete_chef on public.menus
  for delete to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = menus.event_id and e.chef_id = auth.uid()
    )
  );

-- ---- menu_courses -------------------------------------------------------
-- Read: any authenticated user.
-- Write: only the chef assigned to the event that owns this menu.

create policy menu_courses_select_authenticated on public.menu_courses
  for select to authenticated using (true);

create policy menu_courses_insert_chef on public.menu_courses
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.menus m
      join public.events e on e.id = m.event_id
      where m.id = menu_courses.menu_id and e.chef_id = auth.uid()
    )
  );

create policy menu_courses_update_chef on public.menu_courses
  for update to authenticated
  using (
    exists (
      select 1
      from public.menus m
      join public.events e on e.id = m.event_id
      where m.id = menu_courses.menu_id and e.chef_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.menus m
      join public.events e on e.id = m.event_id
      where m.id = menu_courses.menu_id and e.chef_id = auth.uid()
    )
  );

create policy menu_courses_delete_chef on public.menu_courses
  for delete to authenticated
  using (
    exists (
      select 1
      from public.menus m
      join public.events e on e.id = m.event_id
      where m.id = menu_courses.menu_id and e.chef_id = auth.uid()
    )
  );
