-- Revision Year choices: every year from 1950 through 2026.
-- Skip a year that is already stored. Apply when the app is idle.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

INSERT INTO public.is_code_master_options (category, label, value)
SELECT 'revision_year', y::text, y::text
FROM generate_series(1950, 2026) AS y
WHERE NOT EXISTS (
  SELECT 1
  FROM public.is_code_master_options o
  WHERE o.category = 'revision_year'
    AND o.label = y::text
);

NOTIFY pgrst, 'reload schema';
