-- Free trial: shift length moves from whole hours to minutes so a 20-minute trial fits,
-- and each email address and each website gets one trial. Safe to re-run.

do $$
begin
  if exists (select 1 from information_schema.columns where table_name = 'runs' and column_name = 'hours') then
    alter table runs add column if not exists minutes int;
    update runs set minutes = hours * 60;
    alter table runs drop column hours;
  end if;
end $$;

alter table runs alter column minutes set not null;
alter table runs drop constraint if exists runs_minutes_check;
alter table runs add constraint runs_minutes_check check (minutes between 1 and 480);

alter table runs add column if not exists is_trial boolean not null default false;
alter table runs drop constraint if exists runs_trial_length_check;
alter table runs add constraint runs_trial_length_check check (not is_trial or minutes <= 20);

-- One trial per email and per site (www. ignored). Enforced here so parallel sign-ups can't slip through.
create unique index if not exists runs_one_trial_per_email on runs (lower(email)) where is_trial;
create unique index if not exists runs_one_trial_per_site
  on runs (lower(substring(url from '^https?://(?:www\.)?([^/:?#]+)'))) where is_trial;
