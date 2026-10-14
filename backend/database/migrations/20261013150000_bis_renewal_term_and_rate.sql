-- Store the requested renewal validity period and basic unit rate entered during renewal preparation.
ALTER TABLE public.bis_renewal_applications
  ADD COLUMN IF NOT EXISTS renewal_period_from date,
  ADD COLUMN IF NOT EXISTS renewal_period_to date,
  ADD COLUMN IF NOT EXISTS renewal_term_years integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS basic_unit_rate numeric;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'bis_renewal_applications_renewal_term_years_check'
      AND conrelid = 'public.bis_renewal_applications'::regclass
  ) THEN
    ALTER TABLE public.bis_renewal_applications
      ADD CONSTRAINT bis_renewal_applications_renewal_term_years_check
      CHECK (renewal_term_years BETWEEN 1 AND 5);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
