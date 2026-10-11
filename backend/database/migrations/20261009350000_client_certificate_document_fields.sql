-- Client document register: issue date and document number on each certificate file.
-- Apply when the app is idle.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public.client_certificate_files
  ADD COLUMN IF NOT EXISTS document_number text,
  ADD COLUMN IF NOT EXISTS issued_on date;

NOTIFY pgrst, 'reload schema';
