-- Four-agent pipeline, Lead/Principal plans, Claude token tracking and custom quote requests. Safe to re-run.

-- Plans: add lead ($100/h) and principal ($150/h).
alter table runs drop constraint if exists runs_plan_check;
alter table runs add constraint runs_plan_check check (plan in ('junior', 'senior', 'lead', 'principal'));

-- The agent currently working a shift, shown on the live page.
alter table runs add column if not exists agent text;
alter table runs drop constraint if exists runs_agent_check;
alter table runs add constraint runs_agent_check check (agent in ('dev', 'staging', 'uat', 'prod'));

-- Every test belongs to one agent; the agent defines its test type (unit, integration, end-to-end, smoke).
alter table test_cases add column if not exists agent text not null default 'uat';
alter table test_cases drop constraint if exists test_cases_agent_check;
alter table test_cases add constraint test_cases_agent_check check (agent in ('dev', 'staging', 'uat', 'prod'));
alter table test_cases drop constraint if exists test_cases_category_check;
alter table test_cases add constraint test_cases_category_check
  check (category in ('smoke', 'functional', 'e2e', 'negative', 'ui', 'accessibility', 'performance', 'security'));
create index if not exists test_cases_run_agent_idx on test_cases (run_id, agent, status);

-- One row per Claude response: what each shift actually cost. Append-only.
create table if not exists ai_usage (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references runs (id) on delete set null,
  agent text check (agent in ('dev', 'staging', 'uat', 'prod')),
  purpose text not null check (purpose in ('plan', 'execute', 'report')),
  model text not null,
  input_tokens int not null check (input_tokens >= 0),
  output_tokens int not null check (output_tokens >= 0),
  cache_read_tokens int not null default 0 check (cache_read_tokens >= 0),
  cache_write_tokens int not null default 0 check (cache_write_tokens >= 0),
  cost_usd numeric(12, 6) not null check (cost_usd >= 0),
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_created_idx on ai_usage (created_at);
create index if not exists ai_usage_run_idx on ai_usage (run_id);

-- "Custom pricing" quote requests from the pricing section.
create table if not exists custom_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  email text not null check (length(email) between 3 and 254),
  company text not null default '' check (length(company) <= 120),
  website text not null default '' check (length(website) <= 300),
  message text not null check (length(message) between 10 and 3000),
  status text not null default 'new' check (status in ('new', 'contacted', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists custom_requests_created_idx on custom_requests (created_at desc);
create or replace trigger custom_requests_updated_at before update on custom_requests
  for each row execute function set_updated_at();

alter table ai_usage enable row level security;
alter table custom_requests enable row level security;
