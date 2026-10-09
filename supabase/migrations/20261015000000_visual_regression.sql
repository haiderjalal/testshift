-- Visual regression: approved baselines per host, page and viewport, and one snapshot row per capture per run.
-- Images live in a private Storage bucket, never in table rows. Safe to re-run.
create table if not exists visual_baselines (
  id uuid primary key default gen_random_uuid(),
  host text not null check (length(host) between 1 and 253),
  path text not null check (length(path) between 1 and 500),
  viewport text not null check (viewport in ('desktop', 'mobile')),
  storage_key text not null check (length(storage_key) <= 500),
  width int not null check (width > 0),
  height int not null check (height > 0),
  approved_run_id uuid references runs (id) on delete set null,
  approved_at timestamptz not null default now(),
  unique (host, path, viewport)
);

create table if not exists visual_snapshots (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs (id) on delete cascade,
  host text not null check (length(host) between 1 and 253),
  path text not null check (length(path) between 1 and 500),
  viewport text not null check (viewport in ('desktop', 'mobile')),
  status text not null check (status in ('no_baseline', 'match', 'changed', 'size_changed')),
  storage_key text not null check (length(storage_key) <= 500),
  baseline_key text check (baseline_key is null or length(baseline_key) <= 500),
  diff_key text check (diff_key is null or length(diff_key) <= 500),
  changed_ratio double precision check (changed_ratio is null or changed_ratio between 0 and 1),
  width int not null check (width > 0),
  height int not null check (height > 0),
  created_at timestamptz not null default now()
);

create index if not exists visual_snapshots_run_idx on visual_snapshots (run_id, created_at);

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public) values ('visual-regression', 'visual-regression', false)
      on conflict (id) do nothing;
  end if;
end $$;
