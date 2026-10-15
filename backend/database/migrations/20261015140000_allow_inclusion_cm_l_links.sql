-- Keep CM/L unique for source BIS license/application records, while allowing
-- multiple Inclusion records to link to the same license CM/L number.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.bis_projects'::regclass
      AND conname = 'bis_projects_cm_l_digits_uidx'
  ) THEN
    ALTER TABLE public.bis_projects
      DROP CONSTRAINT bis_projects_cm_l_digits_uidx;
  END IF;
END $$;

DROP INDEX IF EXISTS public.bis_projects_cm_l_digits_uidx;

CREATE UNIQUE INDEX bis_projects_cm_l_digits_uidx
  ON public.bis_projects (cm_l_digits)
  WHERE cm_l_digits IS NOT NULL
    AND lower(coalesce(project_kind, '')) <> 'inclusion';

NOTIFY pgrst, 'reload schema';
