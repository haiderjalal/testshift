-- Atomic abuse limits. UPSERT locks the bucket row so simultaneous requests cannot all see the same count.
create table if not exists rate_limit_windows (
  bucket text primary key check (length(bucket) <= 120),
  window_started_at timestamptz not null default now(),
  hits int not null check (hits > 0)
);
alter table rate_limit_windows enable row level security;

create or replace function consume_rate_limit(p_bucket text, p_limit int, p_seconds int)
returns boolean language plpgsql set search_path = public, pg_temp as $$
declare n int;
begin
  if p_limit < 1 or p_seconds < 1 then raise exception 'Invalid rate limit'; end if;
  insert into rate_limit_windows (bucket, hits) values (p_bucket, 1)
  on conflict (bucket) do update set
    hits = case when rate_limit_windows.window_started_at <= clock_timestamp() - make_interval(secs => p_seconds)
      then 1 else least(rate_limit_windows.hits + 1, p_limit + 1) end,
    window_started_at = case when rate_limit_windows.window_started_at <= clock_timestamp() - make_interval(secs => p_seconds)
      then clock_timestamp() else rate_limit_windows.window_started_at end
  returning hits into n;
  return n <= p_limit;
end $$;

-- Serialize only free-trial reservations, then count and insert in the same transaction.
-- A failed insert rolls back; duplicate emails/sites do not consume an allowance.
create or replace function create_trial(
  p_url text, p_email text, p_plan text, p_minutes int, p_notes text,
  p_mailbox text, p_site text, p_visitor text, p_global_limit int, p_ip_limit int
) returns uuid language plpgsql set search_path = public, pg_temp as $$
declare total int; visitor_total int; new_id uuid;
begin
  if p_global_limit < 1 or p_ip_limit < 1 then raise exception 'Invalid trial limit'; end if;
  perform pg_advisory_xact_lock(817312, 1);
  select count(*), count(*) filter (where trial_ip = p_visitor) into total, visitor_total
    from runs where is_trial and created_at > clock_timestamp() - interval '1 day';
  if visitor_total >= p_ip_limit then raise exception 'trial_ip_limit'; end if;
  if total >= p_global_limit then raise exception 'trial_global_limit'; end if;
  insert into runs (url, email, plan, minutes, is_trial, notes, status, trial_email, trial_site, trial_ip)
    values (p_url, p_email, p_plan, p_minutes, true, p_notes, 'queued', p_mailbox, p_site, p_visitor)
    returning id into new_id;
  return new_id;
end $$;
create index if not exists runs_trial_created_idx on runs (created_at) where is_trial;

-- A failed assertion is distinct from a guessed diagnosis or infrastructure failure.
alter table test_cases add column if not exists failure_assertion jsonb;
alter table test_cases add column if not exists scripted boolean not null default false;
alter table runs add column if not exists testing_started_at timestamptz;
