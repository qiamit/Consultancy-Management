-- Proof documents for Startup / Women Entrepreneur are kept as Legal Documents rows in Client Master.
INSERT INTO public.client_master_options (category, label, value)
SELECT 'document_name', v.label, v.label
FROM (VALUES
  ('Startup Certificate'),
  ('Women Entrepreneur Certificate')
) AS v(label)
WHERE NOT EXISTS (
  SELECT 1 FROM public.client_master_options o
  WHERE o.category = 'document_name' AND lower(o.label) = lower(v.label)
);

NOTIFY pgrst, 'reload schema';
