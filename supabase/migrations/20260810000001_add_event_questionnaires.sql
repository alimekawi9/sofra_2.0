-- Per-event questionnaire customization. Canonical preference questions
-- (dietary, avoid, protein, flavor, adventurousness) keep writing to
-- public.taste_profiles exactly as today -- this table only stores display
-- customization (question/option wording) and event-specific custom
-- questions, never a second copy of canonical preference values.
create table public.event_questionnaires (
  event_id   uuid primary key references public.events(id) on delete cascade,
  config     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Responses to custom (non-canonical) questions only. Canonical answers
-- continue to live in taste_profiles, never duplicated here.
create table public.event_question_responses (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete cascade,
  user_id     uuid not null references public.users(id) on delete cascade,
  question_id text not null,
  response    jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (event_id, user_id, question_id)
);

create index event_question_responses_event_idx
  on public.event_question_responses(event_id, question_id);

-- Same MVP posture as every other application table (20260728000005_disable_rls_mvp):
-- local user id rather than Supabase Auth, RLS disabled.
alter table public.event_questionnaires disable row level security;
alter table public.event_question_responses disable row level security;
