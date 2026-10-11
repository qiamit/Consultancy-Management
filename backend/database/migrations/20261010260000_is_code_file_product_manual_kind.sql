-- Product manual files were uploaded as `PM ….pdf` before document_kind existed,
-- so the files list fell back to Specification. Store the real type.
-- Apply when the app is idle.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

UPDATE public.is_code_files
SET document_kind = 'Product Manual'
WHERE COALESCE(btrim(document_kind), '') IN ('', 'Specification')
  AND (
    btrim(file_name) ~* '^PM([\s._-]|$)'
    OR btrim(file_name) ~* 'product[[:space:]]+manual'
  );

UPDATE public.is_code_files
SET document_kind = 'Specification'
WHERE COALESCE(btrim(document_kind), '') = '';

NOTIFY pgrst, 'reload schema';
