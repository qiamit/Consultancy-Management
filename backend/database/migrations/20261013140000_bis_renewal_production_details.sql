-- Persist period-wise production, covered quantity/value and marking-fee rows
-- entered in the BIS renewal workflow.
ALTER TABLE public.bis_renewal_applications
  ADD COLUMN IF NOT EXISTS production_details jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.bis_renewal_applications.production_details IS
  'Period-wise production and marking-fee details maintained for renewal preparation.';

NOTIFY pgrst, 'reload schema';
