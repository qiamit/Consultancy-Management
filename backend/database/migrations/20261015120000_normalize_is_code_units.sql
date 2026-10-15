-- Remove the redundant leading "1" from Unit of IS labels and existing IS Code values.
-- Merge duplicate options created when both prefixed and normalized labels already exist.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

WITH normalized_options AS (
  SELECT
    id,
    btrim(regexp_replace(btrim(label), '^1[[:space:]]+', '')) AS target_label,
    btrim(label) ~ '^1[[:space:]]+' AS has_prefix,
    created_at
  FROM public.is_code_master_options
  WHERE category = 'unit_of_is'
),
affected_labels AS (
  SELECT lower(target_label) AS target_key
  FROM normalized_options
  GROUP BY lower(target_label)
  HAVING bool_or(has_prefix)
),
ranked_options AS (
  SELECT
    option.id,
    row_number() OVER (
      PARTITION BY lower(option.target_label)
      ORDER BY option.has_prefix, option.created_at NULLS LAST, option.id
    ) AS option_rank
  FROM normalized_options option
  JOIN affected_labels affected ON affected.target_key = lower(option.target_label)
)
DELETE FROM public.is_code_master_options option
USING ranked_options ranked
WHERE option.id = ranked.id
  AND ranked.option_rank > 1;

UPDATE public.is_code_master_options
SET
  label = btrim(regexp_replace(btrim(label), '^1[[:space:]]+', '')),
  value = btrim(regexp_replace(btrim(label), '^1[[:space:]]+', ''))
WHERE category = 'unit_of_is'
  AND btrim(label) ~ '^1[[:space:]]+';

UPDATE public.is_codes
SET unit_of_is = btrim(regexp_replace(btrim(unit_of_is), '^1[[:space:]]+', ''))
WHERE unit_of_is IS NOT NULL
  AND btrim(unit_of_is) ~ '^1[[:space:]]+';

NOTIFY pgrst, 'reload schema';
