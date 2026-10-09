-- Cross-customer isolation: a verified domain, and the screenshots approved as its baseline, belong to the
-- customer who proved control, not to anyone who later books the same host. Bind both to the booker's email key.
-- Safe to re-run. Existing rows get an empty key and so must be re-verified / re-approved, which fails closed.

alter table site_verifications add column if not exists verified_email_key text;

-- One approved baseline per customer, page and viewport, instead of one shared per host.
alter table visual_baselines add column if not exists email_key text not null default '';
alter table visual_baselines drop constraint if exists visual_baselines_host_path_viewport_key;
alter table visual_baselines drop constraint if exists visual_baselines_owner_key;
alter table visual_baselines add constraint visual_baselines_owner_key unique (host, path, viewport, email_key);
