-- Stop Marking: samples for which a Factory Test Report is prepared in the case (reply / FTR / submission module).
alter table public.bis_stop_marking_cases
  add column if not exists ftr_samples jsonb not null default '[]'::jsonb;
