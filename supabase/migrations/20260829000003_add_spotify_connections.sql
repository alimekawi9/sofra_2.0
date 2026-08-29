create table if not exists public.spotify_connections (
  user_id uuid primary key references public.users(id) on delete cascade,
  spotify_user_id text not null,
  access_token_ciphertext text not null,
  refresh_token_ciphertext text not null,
  token_expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- OAuth credentials are never exposed through the anonymous MVP data model.
-- Only server routes using the Supabase service role may read this table.
alter table public.spotify_connections enable row level security;
revoke all on table public.spotify_connections from anon, authenticated;
grant all on table public.spotify_connections to service_role;

comment on table public.spotify_connections is
  'Server-only encrypted Spotify OAuth credentials. No browser-facing RLS policies by design.';
