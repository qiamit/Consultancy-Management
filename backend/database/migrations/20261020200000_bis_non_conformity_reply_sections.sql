-- License Non-Conformity step 4: the reply to BIS as a structured letter (references, subject, general paragraph, root cause,
-- corrective / preventive action, effectiveness, new samples, stock, payments, request, signatory).
alter table public.bis_stop_marking_cases
  add column if not exists reply_sections jsonb not null default '{}'::jsonb;
