-- Seed Due Soon licenses module access from Expired Licenses grants.
INSERT INTO public.module_access_rules (
  subject_type, subject_key, subject_label, module_key, access_level, updated_at
)
SELECT
  r.subject_type,
  r.subject_key,
  r.subject_label,
  '/bis/due-soon',
  r.access_level,
  now()
FROM public.module_access_rules r
WHERE r.module_key = '/bis/expired-licenses'
  AND lower(r.access_level) IN ('view', 'edit')
  AND NOT EXISTS (
    SELECT 1
    FROM public.module_access_rules x
    WHERE x.subject_type = r.subject_type
      AND x.subject_key = r.subject_key
      AND x.module_key = '/bis/due-soon'
  );
