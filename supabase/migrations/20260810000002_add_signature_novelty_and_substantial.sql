-- Complete-dish scoring metadata that cannot be represented faithfully by
-- the existing canonical tags array. All other dimensions remain in tags[].
alter table public.signatures
  add column if not exists novelty_score numeric null,
  add column if not exists is_substantial boolean null;

alter table public.signatures
  drop constraint if exists signatures_novelty_score_check,
  add constraint signatures_novelty_score_check
    check (novelty_score is null or novelty_score in (0.10, 0.25, 0.50, 0.75, 0.95));

-- Backfill the three audited presets with deliberately curated canonical
-- metadata. The application preset catalog supplies the same values for new
-- selections. Custom dishes are intentionally left NULL until chef-confirmed
-- or enriched once through the custom-dish flow.
update public.signatures
set tags=(select array_agg(distinct tag) from unnest(tags||array['vegetable','grain','fresh','acidic','herbal','savory','chewy','raw','cold']) tag),
    novelty_score=0.25,
    is_substantial=false
where lower(name)='tabbouleh';

update public.signatures
set tags=(select array_agg(distinct tag) from unnest(tags||array['dairy','fresh','acidic','herbal','creamy','raw','chilled']) tag),
    novelty_score=0.25,
    is_substantial=false
where lower(name)='tzatziki';

update public.signatures
set tags=(select array_agg(distinct tag) from unnest(tags||array['lamb','rich','spicy','earthy','umami','tender','juicy','braised','stewed','hot']) tag),
    novelty_score=0.75,
    is_substantial=true
where lower(name)='lamb rogan josh';
