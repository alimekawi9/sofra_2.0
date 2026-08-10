alter table public.signatures
  add column if not exists preset_key text;

create index if not exists signatures_chef_preset_key_idx
  on public.signatures (chef_id, preset_key)
  where preset_key is not null;
