-- Prefix, Part, Section, Revision Year, Amendment, and Reaffirmation
-- choices live in is_code_master_options. Copy each saved value once.
-- Apply when the app is idle.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

INSERT INTO public.is_code_master_options (category, label, value)
SELECT 'standard_prefix', src.label, src.label
FROM (
  SELECT DISTINCT btrim(standard_prefix) AS label
  FROM public.is_codes
  WHERE nullif(btrim(standard_prefix), '') IS NOT NULL
) src
WHERE NOT EXISTS (
  SELECT 1
  FROM public.is_code_master_options o
  WHERE o.category = 'standard_prefix'
    AND lower(o.label) = lower(src.label)
);

INSERT INTO public.is_code_master_options (category, label, value)
SELECT 'part_no', src.label, src.label
FROM (
  SELECT DISTINCT btrim(part_no) AS label
  FROM public.is_codes
  WHERE nullif(btrim(part_no), '') IS NOT NULL
) src
WHERE NOT EXISTS (
  SELECT 1
  FROM public.is_code_master_options o
  WHERE o.category = 'part_no'
    AND lower(o.label) = lower(src.label)
);

INSERT INTO public.is_code_master_options (category, label, value)
SELECT 'section_no', src.label, src.label
FROM (
  SELECT DISTINCT btrim(section_no) AS label
  FROM public.is_codes
  WHERE nullif(btrim(section_no), '') IS NOT NULL
) src
WHERE NOT EXISTS (
  SELECT 1
  FROM public.is_code_master_options o
  WHERE o.category = 'section_no'
    AND lower(o.label) = lower(src.label)
);

INSERT INTO public.is_code_master_options (category, label, value)
SELECT 'revision_year', src.label, src.label
FROM (
  SELECT DISTINCT revision_year::text AS label
  FROM public.is_codes
  WHERE revision_year IS NOT NULL
) src
WHERE NOT EXISTS (
  SELECT 1
  FROM public.is_code_master_options o
  WHERE o.category = 'revision_year'
    AND lower(o.label) = lower(src.label)
);

INSERT INTO public.is_code_master_options (category, label, value)
SELECT 'amendment_number', src.label, src.label
FROM (
  SELECT DISTINCT btrim(amendment_number) AS label
  FROM public.is_codes
  WHERE nullif(btrim(amendment_number), '') IS NOT NULL
) src
WHERE NOT EXISTS (
  SELECT 1
  FROM public.is_code_master_options o
  WHERE o.category = 'amendment_number'
    AND lower(o.label) = lower(src.label)
);

INSERT INTO public.is_code_master_options (category, label, value)
SELECT 'reaffirmation_year', src.label, src.label
FROM (
  SELECT DISTINCT ('RA-' || reaffirmation_year::text) AS label
  FROM public.is_codes
  WHERE reaffirmation_year IS NOT NULL
) src
WHERE NOT EXISTS (
  SELECT 1
  FROM public.is_code_master_options o
  WHERE o.category = 'reaffirmation_year'
    AND lower(o.label) = lower(src.label)
);

NOTIFY pgrst, 'reload schema';
