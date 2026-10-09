-- API engine: the sanitised Postman endpoints a customer pasted (method and path only), and the list response a
-- read-only chained call took its value from. Safe to re-run.
alter table runs add column if not exists api_collection jsonb check (api_collection is null or jsonb_typeof(api_collection) = 'array');
alter table api_checks add column if not exists chained_from text check (chained_from is null or length(chained_from) <= 200);
