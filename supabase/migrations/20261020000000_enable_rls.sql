-- Defense in depth: enable row-level security on the tables added since the four-agent work, matching every
-- earlier table. The app and worker connect as the database owner, which bypasses RLS, so they are unaffected.
-- With RLS on and no policy, the Supabase anon/publishable role has no access through the Data API. Safe to re-run.
alter table if exists api_checks enable row level security;
alter table if exists requirement_tests enable row level security;
alter table if exists site_verifications enable row level security;
alter table if exists test_environments enable row level security;
alter table if exists visual_baselines enable row level security;
alter table if exists visual_snapshots enable row level security;
