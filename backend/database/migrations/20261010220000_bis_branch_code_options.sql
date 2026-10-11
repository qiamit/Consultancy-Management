-- Branch Code suggestions for BIS Branch Offices.
-- Every saved office code becomes a plus-button option.
-- Apply when the app is idle.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

INSERT INTO public.client_master_options (category, label, value)
SELECT DISTINCT 'bis_branch_code', btrim(office.code), btrim(office.code)
FROM public.bis_offices office
WHERE nullif(btrim(office.code), '') IS NOT NULL
  AND office.archived_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.client_master_options existing
    WHERE existing.category = 'bis_branch_code'
      AND existing.label = btrim(office.code)
  );

NOTIFY pgrst, 'reload schema';
