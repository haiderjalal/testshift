-- Public leaderboard: customers opt in at booking; each site is ranked by its latest completed shift. Safe to re-run.
alter table runs add column if not exists company_name text check (company_name is null or length(company_name) between 1 and 80);
alter table runs add column if not exists leaderboard_opt_in boolean not null default false;
-- Registrable domain (siteKey), so www/app subdomains of one product share a single leaderboard entry.
alter table runs add column if not exists leaderboard_site text check (leaderboard_site is null or length(leaderboard_site) <= 253);

create index if not exists runs_leaderboard_idx on runs (leaderboard_site, completed_at desc)
  where leaderboard_opt_in and status = 'completed';
