-- Customer Portal records service: the price list as amounts per billing frequency, e.g.
-- [{"frequency": "monthly", "amount": 2500}, {"frequency": "yearly", "amount": 25000}].
-- portal_records_yearly_rate stays as the Yearly amount for older code.
ALTER TABLE public.lab_settings ADD COLUMN IF NOT EXISTS portal_records_rates jsonb;
