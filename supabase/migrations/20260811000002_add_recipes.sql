create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  menu_course_id uuid not null references public.menu_courses(id) on delete cascade,
  source text not null check (source in ('host_provided', 'ai_generated')),
  base_servings integer not null check (base_servings > 0),
  instructions text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (menu_course_id)
);

create table if not exists public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  pantry_item_id uuid references public.pantry_items(id) on delete set null,
  ingredient_name text not null,
  quantity_amount numeric not null check (quantity_amount >= 0),
  quantity_unit text not null,
  tags text[] not null default '{}',
  contains_allergens text[] not null default '{}',
  sort_order integer not null default 0
);

create index if not exists recipe_ingredients_recipe_id_idx on public.recipe_ingredients(recipe_id);

-- MVP auth remains application-enforced, matching the existing local tables.
alter table public.recipes disable row level security;
alter table public.recipe_ingredients disable row level security;
