-- Stop Marking becomes "License Non-Conformity": one module for every BIS notice to a licensee
-- (sample failure, show cause, suspension, stop marking, cancellation …). Existing cases are stop-marking notices.
alter table public.bis_stop_marking_cases
  add column if not exists case_type text not null default 'stop_marking',
  add column if not exists sample_code text not null default '',
  add column if not exists sample_qr_code text not null default '';

create index if not exists bis_stop_marking_cases_case_type_idx on public.bis_stop_marking_cases(case_type);
