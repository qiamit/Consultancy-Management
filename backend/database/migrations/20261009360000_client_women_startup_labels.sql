-- Women Entrepreneur and Startup store the selected dropdown label.
-- Booleans stay in sync: true only when the label is Yes.
-- Apply when the app is idle.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS women_entrepreneur text,
  ADD COLUMN IF NOT EXISTS startup_status text;

UPDATE public.clients
SET women_entrepreneur = CASE WHEN is_women_entrepreneur IS TRUE THEN 'Yes' ELSE 'No' END
WHERE women_entrepreneur IS NULL;

UPDATE public.clients
SET startup_status = CASE WHEN is_startup IS TRUE THEN 'Yes' ELSE 'No' END
WHERE startup_status IS NULL;

INSERT INTO public.client_master_options (category, label, value)
SELECT v.category, v.label, v.label
FROM (VALUES
  ('women_entrepreneur', 'Yes'),
  ('women_entrepreneur', 'No'),
  ('startup', 'Yes'),
  ('startup', 'No')
) AS v(category, label)
WHERE NOT EXISTS (
  SELECT 1 FROM public.client_master_options o
  WHERE o.category = v.category AND lower(o.label) = lower(v.label)
);

NOTIFY pgrst, 'reload schema';
