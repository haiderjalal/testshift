-- Apply through the owner's reviewed migration process before enabling generation.
create table if not exists github_generations (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references github_connections(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','processing','review_ready','failed','blocked')),
  stage text not null default 'inventory',
  consent_version text not null check (consent_version = 'source-ai-pr-v1'),
  lease_id uuid,
  lease_until timestamptz,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  model_started_at timestamptz,
  base_sha text check (base_sha ~ '^[a-f0-9]{40}$'),
  artifact jsonb,
  inventory jsonb,
  input_tokens integer,
  output_tokens integer,
  cost_usd numeric(12,6),
  pull_number bigint,
  failure_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create unique index if not exists github_generation_active on github_generations(connection_id) where status in ('queued','processing');
create index if not exists github_generation_queue on github_generations(created_at) where status in ('queued','processing');
create table if not exists github_generation_daily (
  day date primary key default current_date,
  requests integer not null default 0 check (requests >= 0)
);
-- Reservations survive disconnect/report deletion so a customer cannot reset the spending limit.
create table if not exists github_generation_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id bigint not null references github_users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists github_generation_reservations_user on github_generation_reservations(user_id,created_at);
alter table github_generations enable row level security;
alter table github_generation_daily enable row level security;
alter table github_generation_reservations enable row level security;
