-- API latency: p95 per operation, and a site-wide summary across every sample. Safe to re-run.
alter table api_checks add column if not exists latency_p95_ms int check (latency_p95_ms is null or latency_p95_ms >= 0);
alter table runs add column if not exists api_latency jsonb;
