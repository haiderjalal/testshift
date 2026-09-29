-- TestShift initial schema. Safe to re-run.

create table if not exists runs (
  id uuid primary key default gen_random_uuid(),
  url text not null check (url ~ '^https?://'),
  email text not null,
  plan text not null check (plan in ('junior', 'senior')),
  hours int not null check (hours between 1 and 8),
  notes text not null default '' check (length(notes) <= 2000),
  status text not null default 'pending_payment'
    check (status in ('pending_payment', 'queued', 'running', 'completed', 'failed')),
  activity text,                 -- what the tester is doing right now, shown on the live page
  stripe_session_id text unique,
  site_map jsonb,                -- pages found while exploring; lets a restarted worker resume
  report jsonb,                  -- score, summary, strengths, recommendations
  error text,
  started_at timestamptz,
  deadline_at timestamptz,       -- started_at + booked hours; the worker stops testing here
  heartbeat_at timestamptz,      -- stale heartbeat = crashed worker, run gets re-claimed
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists runs_status_created_idx on runs (status, created_at);

create table if not exists test_cases (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs (id) on delete cascade,
  seq int not null,
  title text not null,
  category text not null
    check (category in ('smoke', 'functional', 'e2e', 'negative', 'ui', 'accessibility', 'performance')),
  priority text not null check (priority in ('high', 'medium', 'low')),
  viewport text not null default 'desktop' check (viewport in ('desktop', 'mobile')),
  start_url text not null,
  steps jsonb not null,          -- planned steps, plain language
  expected text not null,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'passed', 'failed', 'blocked')),
  actual text,
  severity text check (severity in ('critical', 'major', 'minor')),
  actions jsonb not null default '[]',  -- browser actions actually performed; exported as Playwright code
  screenshot bytea,              -- JPEG captured when a test fails
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, seq)
);

create or replace function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create or replace trigger runs_updated_at before update on runs
  for each row execute function set_updated_at();
create or replace trigger test_cases_updated_at before update on test_cases
  for each row execute function set_updated_at();

-- Only the server (DATABASE_URL, table owner) touches these tables. RLS with no policies
-- keeps Supabase's public anon key from reading customer data.
alter table runs enable row level security;
alter table test_cases enable row level security;
