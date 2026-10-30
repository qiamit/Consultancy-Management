-- Sale documents: per-document choice to charge GST on transportation / packaging charges
-- (at the highest line GST rate). Quotations keep it in this column; proforma / tax invoice /
-- credit note keep it in extra.charges_gst like their other charge fields. Default off, so
-- existing documents keep their totals.
-- Idempotent. Apply with npm run db:migrate. Do not edit after it is applied.

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS charges_gst boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.quotations.charges_gst IS
  'True when GST is charged on transportation_charges + packaging_charges, at the highest line GST rate.';
