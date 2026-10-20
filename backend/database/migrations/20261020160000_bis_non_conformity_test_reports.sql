-- License Non-Conformity: several test report files per case (step 2). Existing single report is carried over.
alter table public.bis_stop_marking_cases
  add column if not exists test_reports jsonb not null default '[]'::jsonb;

update public.bis_stop_marking_cases
set test_reports = jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'label', test_report_name, 'name', test_report_name, 'path', test_report_path))
where test_report_path is not null and test_report_path <> '' and test_reports = '[]'::jsonb;
