-- Client Master stores factory/office map coordinates on the client row.
-- Apply when the app is idle.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS longitude text,
  ADD COLUMN IF NOT EXISTS latitude text;

NOTIFY pgrst, 'reload schema';
