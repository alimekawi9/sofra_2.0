alter table public.users
  add column email text unique not null;
