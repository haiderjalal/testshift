-- API spec review and browser comparison: what the description itself lacks, and calls the page made that it does not
-- document. Stored once per run as a JSON array. Safe to re-run.
alter table runs add column if not exists api_findings jsonb check (api_findings is null or jsonb_typeof(api_findings) = 'array');
