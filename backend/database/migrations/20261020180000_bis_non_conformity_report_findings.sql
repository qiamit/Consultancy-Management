-- License Non-Conformity step 2: test report findings as a table (parameter, specified value, observed value, remark).
alter table public.bis_stop_marking_cases
  add column if not exists report_findings jsonb not null default '[]'::jsonb;
