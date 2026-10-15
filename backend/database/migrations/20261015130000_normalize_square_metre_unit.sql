-- Standardize the Unit of IS display name across unit options, IS Code records,
-- and saved BIS project production units. Existing option duplicates are merged.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

UPDATE public.is_code_master_options
SET
  label = regexp_replace(label, 'square[[:space:]]+metres?', 'Sq Meter', 'gi'),
  value = regexp_replace(COALESCE(value, label), 'square[[:space:]]+metres?', 'Sq Meter', 'gi')
WHERE category = 'unit_of_is'
  AND label ~* 'square[[:space:]]+metres?';

WITH ranked_options AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY category, lower(btrim(label))
      ORDER BY (label = btrim(label)) DESC, created_at NULLS LAST, id
    ) AS option_rank
  FROM public.is_code_master_options
  WHERE category = 'unit_of_is'
    AND label ~* '(^|[[:space:]])[0-9]*[[:space:]]*sq[[:space:]]+meter$'
)
DELETE FROM public.is_code_master_options option
USING ranked_options ranked
WHERE option.id = ranked.id
  AND ranked.option_rank > 1;

UPDATE public.is_codes
SET unit_of_is = regexp_replace(unit_of_is, 'square[[:space:]]+metres?', 'Sq Meter', 'gi')
WHERE unit_of_is ~* 'square[[:space:]]+metres?';

UPDATE public.bis_projects
SET production_unit = regexp_replace(production_unit, 'square[[:space:]]+metres?', 'Sq Meter', 'gi')
WHERE production_unit ~* 'square[[:space:]]+metres?';

NOTIFY pgrst, 'reload schema';
