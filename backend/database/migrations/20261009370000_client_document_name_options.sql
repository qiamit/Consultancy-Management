-- Legal Document names live in client_master_options, not in the app.
-- Apply when the app is idle.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

INSERT INTO public.client_master_options (category, label, value)
SELECT 'document_name', v.label, v.label
FROM (VALUES
  ('GST Certificate'),
  ('PAN Card'),
  ('MSME Certificate'),
  ('Udyam Certificate'),
  ('Certificate of Incorporation'),
  ('Cancelled Cheque'),
  ('Address Proof')
) AS v(label)
WHERE NOT EXISTS (
  SELECT 1 FROM public.client_master_options o
  WHERE o.category = 'document_name' AND lower(o.label) = lower(v.label)
);

NOTIFY pgrst, 'reload schema';
