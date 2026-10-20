-- License Non-Conformity step 3: the Sample Offer Letter and Factory Test Reports of the case itself (not linked to the application / licence modules).
alter table public.bis_stop_marking_cases
  add column if not exists test_report_module jsonb not null default '{}'::jsonb;
