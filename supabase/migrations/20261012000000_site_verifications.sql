-- Domain ownership: a customer proves control of a site's hostname before active tests run against it. Safe to re-run.
create table if not exists site_verifications (
  host text primary key check (length(host) between 1 and 253),
  -- Random secret the customer publishes in DNS or on their site. Never shown to anyone else.
  token text not null check (length(token) >= 32),
  verified_at timestamptz,
  verified_method text check (verified_method is null or verified_method in ('dns', 'file')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace trigger site_verifications_updated_at before update on site_verifications
  for each row execute function set_updated_at();
