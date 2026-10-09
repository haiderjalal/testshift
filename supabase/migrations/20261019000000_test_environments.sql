-- Approved test environments: the only places load tests and (later) write tests may run. A record is created
-- by the operator after the customer has verified the domain. Safe to re-run.
create table if not exists test_environments (
  host text primary key check (length(host) between 1 and 253),
  label text not null check (length(label) between 1 and 120),
  load_allowed boolean not null default false,
  writes_allowed boolean not null default false,
  max_requests int not null default 300 check (max_requests between 1 and 2000),
  max_rps int not null default 5 check (max_rps between 1 and 20),
  max_concurrency int not null default 3 check (max_concurrency between 1 and 10),
  approved_by text not null check (length(approved_by) between 1 and 200),
  approved_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days'
);

alter table runs add column if not exists load_summary jsonb;
