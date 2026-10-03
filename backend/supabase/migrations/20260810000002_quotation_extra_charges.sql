-- Header-level quotation charges

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS transportation_charges numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS packaging_charges numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.quotations.transportation_charges IS
  'Optional transportation charges added on quotation totals.';
COMMENT ON COLUMN public.quotations.packaging_charges IS
  'Optional packaging charges added on quotation totals.';
