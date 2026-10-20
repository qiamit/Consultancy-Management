-- Stop Marking: the reason category picked when the licence is added (the detailed wording stays in bis_reason).
alter table public.bis_stop_marking_cases
  add column if not exists reason_type text not null default '';
