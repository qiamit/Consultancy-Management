-- License Non-Conformity: the lab test report BIS sent (reviewed in step 2) and the supporting documents uploaded for submission.
alter table public.bis_stop_marking_cases
  add column if not exists test_report_path text,
  add column if not exists test_report_name text,
  add column if not exists report_review text not null default '',
  add column if not exists documents jsonb not null default '[]'::jsonb;
