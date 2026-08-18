-- Preserve the whole-dish scoring inputs used to validate an AI-composed
-- course. component_ids alone cannot reconstruct dietary classifications.
alter table public.menu_courses
  add column if not exists scoring_metadata jsonb;
