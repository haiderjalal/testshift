-- Smarter, cheaper agents: a shared test strategy per shift, feature coverage per test, and scripted tests
-- that run without the model. Safe to re-run.

alter table runs add column if not exists strategy jsonb;

alter table test_cases add column if not exists feature text check (feature is null or length(feature) <= 20);
alter table test_cases add column if not exists script jsonb not null default '[]';
