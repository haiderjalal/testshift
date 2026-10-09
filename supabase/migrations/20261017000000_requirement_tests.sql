-- AI test generation from requirements: the customer's plain-text requirements, the proposed tests generated
-- from them, and the operator's review. Generated tests only run once approved. Safe to re-run.
alter table runs add column if not exists requirements text check (requirements is null or length(requirements) <= 8000);
alter table runs add column if not exists requirements_requested_at timestamptz;

create table if not exists requirement_tests (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs (id) on delete cascade,
  requirement text not null check (length(requirement) between 1 and 500),
  title text not null check (length(title) between 1 and 200),
  priority text not null check (priority in ('high', 'medium', 'low')),
  viewport text not null check (viewport in ('desktop', 'mobile')),
  start_url text not null check (length(start_url) <= 2000),
  steps jsonb not null,
  expected text not null check (length(expected) <= 1500),
  script jsonb not null default '[]',
  status text not null default 'proposed' check (status in ('proposed', 'approved', 'rejected')),
  test_case_id uuid references test_cases (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists requirement_tests_run_idx on requirement_tests (run_id, created_at);

alter table test_cases add column if not exists requirement text check (requirement is null or length(requirement) <= 500);
