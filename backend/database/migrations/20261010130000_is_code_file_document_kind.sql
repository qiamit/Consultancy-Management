-- Each IS Code file stores a document type label.
-- The choices live in is_code_master_options (category document_kind),
-- so a later Add from the + button is allowed. There is no fixed check list.
-- Apply when the app is idle.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public.is_code_files
  ADD COLUMN IF NOT EXISTS document_kind text;

ALTER TABLE public.is_code_files DROP CONSTRAINT IF EXISTS is_code_files_document_kind_chk;

INSERT INTO public.is_code_master_options (category, label, value)
SELECT 'document_kind', v.label, v.label
FROM (VALUES
  ('Specification'),
  ('Product Manual'),
  ('Test Method'),
  ('Amendment'),
  ('Code of Practice'),
  ('Other')
) AS v(label)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.is_code_master_options o
  WHERE o.category = 'document_kind'
    AND lower(o.label) = lower(v.label)
);

NOTIFY pgrst, 'reload schema';
