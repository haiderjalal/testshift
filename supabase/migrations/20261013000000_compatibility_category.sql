-- Cross-browser results are stored as test cases in their own category. Safe to re-run.
alter table test_cases drop constraint if exists test_cases_category_check;
alter table test_cases add constraint test_cases_category_check
  check (category in ('smoke', 'functional', 'e2e', 'negative', 'ui', 'accessibility', 'performance', 'security', 'compatibility'));
