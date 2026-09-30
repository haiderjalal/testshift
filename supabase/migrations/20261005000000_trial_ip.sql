-- Free trials per visitor are counted from trials actually created (not attempts), by hashed IP. Safe to re-run.
alter table runs add column if not exists trial_ip text check (trial_ip is null or length(trial_ip) <= 64);
create index if not exists runs_trial_ip_idx on runs (trial_ip, created_at) where is_trial;
