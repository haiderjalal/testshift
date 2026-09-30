-- Wise beta orders: payment confirmation and start authorization are separate, auditable events.
create table if not exists beta_plan_prices (
  plan text primary key check (plan in ('junior','senior','lead','principal')),
  estimated_token_hour_cents int not null check (estimated_token_hour_cents between 1 and 100000),
  updated_at timestamptz not null default now()
);
alter table beta_plan_prices enable row level security;
-- No invented hourly benchmarks are seeded. The owner publishes estimates in /admin.

alter table runs add column if not exists payment_method text not null default 'legacy';
alter table runs add column if not exists estimated_token_hour_cents int;
alter table runs add column if not exists quoted_hourly_cents int;
alter table runs add column if not exists quoted_total_cents int;
alter table runs add column if not exists quoted_at timestamptz;
alter table runs add column if not exists payment_confirmed_at timestamptz;
alter table runs add column if not exists amount_received_cents int;
alter table runs add column if not exists payment_reference text;
alter table runs add column if not exists start_authorized_at timestamptz;

alter table runs drop constraint if exists runs_status_check;
alter table runs add constraint runs_status_check check (status in ('pending_payment','paid','queued','running','completed','failed'));
alter table runs drop constraint if exists runs_beta_quote_check;
alter table runs add constraint runs_beta_quote_check check (
  payment_method <> 'wise' or (
    not is_trial and (
      (estimated_token_hour_cents is null and quoted_hourly_cents is null and quoted_total_cents is null and quoted_at is null)
      or (estimated_token_hour_cents is not null and estimated_token_hour_cents between 1 and 100000
        and quoted_hourly_cents is not null and quoted_hourly_cents = estimated_token_hour_cents * 10
        and quoted_total_cents is not null and quoted_total_cents = quoted_hourly_cents * minutes / 60
        and quoted_at is not null)
    )
  )
);
alter table runs drop constraint if exists runs_beta_payment_check;
alter table runs add constraint runs_beta_payment_check check (
  payment_method <> 'wise' or status = 'pending_payment' or (
    quoted_total_cents is not null and payment_confirmed_at is not null
    and amount_received_cents is not null and amount_received_cents = quoted_total_cents
    and payment_reference is not null and length(payment_reference) between 3 and 120
    and (status = 'paid' or start_authorized_at is not null)
  )
);
create unique index if not exists runs_wise_receipt_unique on runs (lower(payment_reference))
  where payment_method = 'wise' and payment_reference is not null;
create index if not exists runs_beta_pending_idx on runs (created_at) where payment_method = 'wise' and status in ('pending_payment','paid');
