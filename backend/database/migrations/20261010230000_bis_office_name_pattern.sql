-- BIS office names follow "Bureau of Indian Standards - Ahmedabad Branch Office 1".
-- Roman numerals at the end become 1, 2, 3, and 4. Apply when the app is idle.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

UPDATE public.bis_offices
SET
  name = 'Bureau of Indian Standards - ' || btrim(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              btrim(name),
              '^Bureau of Indian Standards[[:space:]]*[,–—-]+[[:space:]]*',
              '',
              'i'
            ),
            '[[:space:]]+IV$',
            ' 4'
          ),
          '[[:space:]]+III$',
          ' 3'
        ),
        '[[:space:]]+II$',
        ' 2'
      ),
      '[[:space:]]+I$',
      ' 1'
    )
  ),
  updated_at = now()
WHERE nullif(btrim(name), '') IS NOT NULL
  AND name !~ '^Bureau of Indian Standards - .+( [0-9])?$';

NOTIFY pgrst, 'reload schema';
