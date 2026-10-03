-- User Management: Division (Calibration / Testing / PT / etc.)
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS division text;

COMMENT ON COLUMN public.user_profiles.division IS
  'Lab division e.g. Calibration Division, Testing Division, PT Division';

-- Seed default division options for User Management (+ Add New Division)
INSERT INTO public.lab_master_options (category, label, value)
SELECT v.category, v.label, v.value
FROM (VALUES
  ('division', 'Calibration Division', 'calibration-division'),
  ('division', 'Testing Division', 'testing-division'),
  ('division', 'PT Division', 'pt-division')
) AS v(category, label, value)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.lab_master_options existing
  WHERE existing.category = v.category
    AND lower(existing.label) = lower(v.label)
);
