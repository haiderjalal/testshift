-- Private GitHub control plane. Server DB role only; no browser/PostgREST policies.
create table if not exists github_users (
  id bigint primary key check (id > 0),
  login text not null check (length(login) between 1 and 100),
  created_at timestamptz not null default now()
);
create table if not exists github_sessions (
  token_hash text primary key check (length(token_hash) = 64),
  user_id bigint not null references github_users(id) on delete cascade,
  encrypted_token text not null,
  expires_at timestamptz not null
);
create index if not exists github_sessions_expiry on github_sessions(expires_at);
create table if not exists github_states (
  state_hash text primary key,
  browser_hash text not null,
  purpose text not null check (purpose in ('login','install')),
  verifier text not null,
  user_id bigint references github_users(id) on delete cascade,
  expires_at timestamptz not null
);
create table if not exists github_connections (
  id uuid primary key default gen_random_uuid(),
  user_id bigint not null references github_users(id) on delete cascade,
  installation_id bigint not null check (installation_id > 0),
  repository_id bigint not null check (repository_id > 0),
  full_name text not null check (length(full_name) between 3 and 201),
  workflow_path text not null default '.github/workflows/testshift.yml'
    check (workflow_path ~ '^\.github/workflows/[A-Za-z0-9_-]{1,80}\.ya?ml$'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, repository_id)
);
create index if not exists github_connections_installation on github_connections(installation_id, repository_id);
create table if not exists github_deliveries (
  id uuid primary key,
  event text not null check (length(event) <= 80),
  received_at timestamptz not null default now()
);
create table if not exists github_jobs (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references github_connections(id) on delete cascade,
  workflow_run_id bigint not null check (workflow_run_id > 0),
  run_attempt integer not null check (run_attempt between 1 and 10000),
  head_sha text not null check (head_sha ~ '^[a-f0-9]{40}$'),
  status text not null default 'queued' check (status in ('queued','processing','completed','failed','blocked')),
  conclusion text,
  report jsonb,
  check_id bigint,
  attempts integer not null default 0,
  lease_id uuid,
  lease_until timestamptz,
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (connection_id, workflow_run_id, run_attempt)
);
create index if not exists github_jobs_queue on github_jobs(next_attempt_at, created_at) where status in ('queued','processing');
alter table github_users enable row level security;
alter table github_sessions enable row level security;
alter table github_states enable row level security;
alter table github_connections enable row level security;
alter table github_deliveries enable row level security;
alter table github_jobs enable row level security;
