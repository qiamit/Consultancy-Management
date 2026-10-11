-- Reaffirmation choices: RA-2000 through RA-2026.
-- Skip a year that is already stored. Apply when the app is idle.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

INSERT INTO public.is_code_master_options (category, label, value)
SELECT 'reaffirmation_year', 'RA-' || y::text, 'RA-' || y::text
FROM generate_series(2000, 2026) AS y
WHERE NOT EXISTS (
  SELECT 1
  FROM public.is_code_master_options o
  WHERE o.category = 'reaffirmation_year'
    AND lower(o.label) = lower('RA-' || y::text)
);

NOTIFY pgrst, 'reload schema';
