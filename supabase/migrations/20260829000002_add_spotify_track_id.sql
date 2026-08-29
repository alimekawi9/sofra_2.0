alter table public.playlist_suggestions
  add column if not exists spotify_track_id text;

comment on column public.playlist_suggestions.spotify_track_id is
  'Nullable Spotify track identifier. Manual playlist suggestions intentionally leave this null.';
