-- License Non-Conformity step 2: sample / report details read from the test report, and observations checked against the Indian Standard.
alter table public.bis_stop_marking_cases
  add column if not exists report_details jsonb not null default '{}'::jsonb,
  add column if not exists report_observations text not null default '';
