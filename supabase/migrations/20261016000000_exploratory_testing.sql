-- AI exploratory testing: a new test category, a usage purpose for exploration calls, and a per-run summary.
-- Safe to re-run.
alter table test_cases drop constraint if exists test_cases_category_check;
alter table test_cases add constraint test_cases_category_check
  check (category in ('smoke', 'functional', 'e2e', 'negative', 'ui', 'accessibility', 'performance', 'security', 'compatibility', 'exploratory'));

alter table ai_usage drop constraint if exists ai_usage_purpose_check;
alter table ai_usage add constraint ai_usage_purpose_check check (purpose in ('plan', 'execute', 'report', 'explore'));

alter table runs add column if not exists exploration jsonb;
