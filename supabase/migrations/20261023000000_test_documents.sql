-- Test case documents: a website URL in, a PDF and a Word file of test cases out. Safe to re-run.

-- One row per request. The files live in test_document_files so that status pages never load them.
create table if not exists test_documents (
  id uuid primary key default gen_random_uuid(),
  url text not null check (length(url) between 1 and 2000),
  host text not null check (length(host) between 1 and 253),
  site_key text not null check (length(site_key) between 1 and 253),
  email text not null check (length(email) between 3 and 254),
  notes text not null default '' check (length(notes) <= 1000),
  visitor text not null check (length(visitor) <= 128),
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed')),
  activity text check (activity is null or length(activity) <= 200),
  error text check (error is null or length(error) <= 500),
  page_count int check (page_count is null or page_count >= 0),
  case_count int check (case_count is null or case_count >= 0),
  ai_case_count int check (ai_case_count is null or ai_case_count >= 0),
  summary jsonb,
  claim_token uuid,
  heartbeat_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists test_documents_queue_idx on test_documents (status, created_at);
create index if not exists test_documents_site_idx on test_documents (site_key, created_at);
create index if not exists test_documents_visitor_idx on test_documents (visitor, created_at);
create index if not exists test_documents_created_idx on test_documents (created_at);

-- The cases of a document, in reading order. Steps are a JSON array of sentences.
create table if not exists test_document_cases (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references test_documents (id) on delete cascade,
  seq int not null check (seq >= 1),
  code text not null check (length(code) between 1 and 12),
  feature text not null check (length(feature) between 1 and 200),
  title text not null check (length(title) between 1 and 300),
  type text not null check (type in ('smoke', 'functional', 'navigation', 'negative', 'boundary', 'usability', 'accessibility', 'performance')),
  priority text not null check (priority in ('high', 'medium', 'low')),
  source text not null check (source in ('crawl', 'scan', 'ai')),
  page_url text not null check (length(page_url) <= 2000),
  preconditions text not null default '' check (length(preconditions) <= 500),
  test_data text not null default '' check (length(test_data) <= 500),
  steps jsonb not null check (jsonb_typeof(steps) = 'array'),
  expected text not null check (length(expected) <= 600),
  observed text not null default '' check (length(observed) <= 600),
  unique (document_id, seq)
);

-- The generated files, one row per format. Bytes are kept in the row, as screenshots are today.
create table if not exists test_document_files (
  document_id uuid not null references test_documents (id) on delete cascade,
  format text not null check (format in ('pdf', 'docx')),
  content bytea not null,
  bytes int not null check (bytes >= 0),
  created_at timestamptz not null default now(),
  primary key (document_id, format)
);

-- Model usage for documents is billed like every other call, and attributed to its document.
alter table ai_usage add column if not exists document_id uuid references test_documents (id) on delete set null;
alter table ai_usage drop constraint if exists ai_usage_purpose_check;
alter table ai_usage add constraint ai_usage_purpose_check check (purpose in ('plan', 'execute', 'report', 'explore', 'document'));
create index if not exists ai_usage_document_idx on ai_usage (document_id);

alter table test_documents enable row level security;
alter table test_document_cases enable row level security;
alter table test_document_files enable row level security;
