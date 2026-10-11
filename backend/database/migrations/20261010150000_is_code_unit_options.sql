-- Unit of IS choices live in is_code_master_options (category unit_of_is).
-- Copy each saved unit once, then seed the six names the form used to hard-code.
-- Apply when the app is idle.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

INSERT INTO public.is_code_master_options (category, label, value)
SELECT 'unit_of_is', src.label, src.label
FROM (
  SELECT DISTINCT btrim(unit_of_is) AS label
  FROM public.is_codes
  WHERE nullif(btrim(unit_of_is), '') IS NOT NULL
) src
WHERE NOT EXISTS (
  SELECT 1
  FROM public.is_code_master_options o
  WHERE o.category = 'unit_of_is'
    AND lower(o.label) = lower(src.label)
);

INSERT INTO public.is_code_master_options (category, label, value)
SELECT 'unit_of_is', v.label, v.label
FROM (VALUES
  ('Tonne'),
  ('Pcs'),
  ('Nos'),
  ('Kilo Litre'),
  ('Litre'),
  ('Kg')
) AS v(label)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.is_code_master_options o
  WHERE o.category = 'unit_of_is'
    AND lower(o.label) = lower(v.label)
);

NOTIFY pgrst, 'reload schema';
