-- Testing laboratories store GST, opening balance, and payment terms like Client Master.
-- Apply when the app is idle.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public.laboratories
  ADD COLUMN IF NOT EXISTS gst_number text,
  ADD COLUMN IF NOT EXISTS opening_balance numeric(14, 2),
  ADD COLUMN IF NOT EXISTS balance_type text,
  ADD COLUMN IF NOT EXISTS payment_term text,
  ADD COLUMN IF NOT EXISTS remark text;

ALTER TABLE public.laboratories DROP CONSTRAINT IF EXISTS laboratories_balance_type_chk;
ALTER TABLE public.laboratories
  ADD CONSTRAINT laboratories_balance_type_chk
  CHECK (balance_type IS NULL OR balance_type IN ('Cr', 'Dr'));

UPDATE public.laboratories
SET balance_type = 'Dr'
WHERE balance_type IS NULL OR btrim(balance_type) = '';

NOTIFY pgrst, 'reload schema';
