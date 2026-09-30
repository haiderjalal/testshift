-- Security and reliability hardening. Safe to re-run.

-- Rate limiting: one row per hit, keyed by a bucket such as "trial:<hashed ip>". Rows older than 2 days are pruned.
create table if not exists rate_limit_hits (
  id bigint generated always as identity primary key,
  bucket text not null check (length(bucket) <= 120),
  created_at timestamptz not null default now()
);
create index if not exists rate_limit_hits_bucket_created_idx on rate_limit_hits (bucket, created_at);
alter table rate_limit_hits enable row level security;

-- One free trial per mailbox and per registrable domain, computed by the app (src/lib/net.ts):
-- "a+1@gmail.com" and "a.b@gmail.com" count as the same mailbox; shop.example.com and example.com as one site.
alter table runs add column if not exists trial_email text;
alter table runs add column if not exists trial_site text;
update runs set
  trial_email = lower(email),
  trial_site = regexp_replace(lower(substring(url from '^https?://(?:[^@/]*@)?([^/:?#]+)')), '^.*\.([^.]+\.[^.]+)$', '\1')
where is_trial and trial_email is null;
drop index if exists runs_one_trial_per_email;
drop index if exists runs_one_trial_per_site;
create unique index if not exists runs_one_trial_per_mailbox on runs (trial_email) where is_trial;
create unique index if not exists runs_one_trial_per_domain on runs (trial_site) where is_trial;

-- The URL is stored normalised by the app (lowercase scheme, no credentials).
alter table runs drop constraint if exists runs_url_check;
alter table runs add constraint runs_url_check check (url ~ '^https?://' and length(url) <= 2000 and url !~ '^https?://[^/]*@');

-- Ownership of a running shift: set when a worker claims it, checked by every write, so a worker that
-- lost its claim (paused past the heartbeat timeout) can't keep writing after another worker took over.
alter table runs add column if not exists claim_token uuid;
