-- API testing engine: one row per OpenAPI operation the worker tested or deliberately skipped. Safe to re-run.
alter table runs add column if not exists api_spec_url text check (api_spec_url is null or length(api_spec_url) <= 2000);

create table if not exists api_checks (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs (id) on delete cascade,
  method text not null check (method in ('GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE')),
  path text not null check (length(path) <= 500),
  status_code int check (status_code is null or status_code between 100 and 599),
  latency_ms int check (latency_ms is null or latency_ms >= 0),
  -- Set when the operation was not sent: why it was skipped. A skipped row is never a pass.
  skipped_reason text check (skipped_reason is null or length(skipped_reason) <= 300),
  passed boolean,
  severity text check (severity is null or severity in ('critical', 'major', 'minor')),
  checks jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create index if not exists api_checks_run_idx on api_checks (run_id, created_at);
