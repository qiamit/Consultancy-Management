-- Management is the default division; it must always exist and cannot be edited/deleted in UI.

INSERT INTO public.lab_master_options (category, label, value)
SELECT v.category, v.label, v.value
FROM (VALUES
  ('division', 'Management', 'management')
) AS v(category, label, value)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.lab_master_options existing
  WHERE existing.category = v.category
    AND lower(existing.label) = lower(v.label)
);

NOTIFY pgrst, 'reload schema';
