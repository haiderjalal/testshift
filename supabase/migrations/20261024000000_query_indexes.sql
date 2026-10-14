-- Indexes for the hot read paths found in the query review. Plain `create index if not exists` matches the other
-- migrations and is safe to re-run.

-- The leaderboard keeps each site's newest completed shift before it filters on opt-in. runs_leaderboard_idx only
-- holds opted-in rows, so that scan cannot use it. This index matches the query's own predicate.
create index if not exists runs_completed_site_idx on runs (leaderboard_site, completed_at desc)
  where status = 'completed' and leaderboard_site is not null;

-- The repositories page reads the newest jobs and generations of each connection, one lateral lookup per connection.
create index if not exists github_jobs_connection_created_idx on github_jobs (connection_id, created_at desc);
create index if not exists github_generations_connection_created_idx on github_generations (connection_id, created_at desc);

-- The rate limiter's clean-up deletes by window age, so it should not scan the whole bucket table.
create index if not exists rate_limit_windows_started_idx on rate_limit_windows (window_started_at);
