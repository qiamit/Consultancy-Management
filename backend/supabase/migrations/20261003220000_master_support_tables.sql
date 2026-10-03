-- Missing LIMS support tables/columns required by Masters + Finance UI.

-- ── Accreditation bodies ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.accreditation_bodies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);

INSERT INTO public.accreditation_bodies (name) VALUES
  ('NABL'),
  ('BIS'),
  ('Other')
ON CONFLICT (name) DO NOTHING;

-- ── GST rates (Product/Quotation dropdowns) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gst_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rate numeric NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS gst_rates_rate_uq ON public.gst_rates (rate);

INSERT INTO public.gst_rates (rate) VALUES (0), (5), (12), (18), (28)
ON CONFLICT (rate) DO NOTHING;

-- ── Test parameter units ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.test_parameter_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);

INSERT INTO public.test_parameter_units (name) VALUES
  ('%'), ('mm'), ('mm2'), ('MPa'), ('N'), ('Nos'), ('kg'), ('g'), ('°C'), ('—')
ON CONFLICT (name) DO NOTHING;

-- ── test_parameters LIMS columns ──────────────────────────────────────────────
ALTER TABLE public.test_parameters
  ADD COLUMN IF NOT EXISTS under_accreditation_ids uuid[] DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS designation text,
  ADD COLUMN IF NOT EXISTS uncertainty_calculation_data jsonb,
  ADD COLUMN IF NOT EXISTS uncertainty_mu_history jsonb;

-- Backfill IS Code labels used by the table UI
UPDATE public.test_parameters tp
SET is_code_label = COALESCE(
  NULLIF(tp.is_code_label, ''),
  NULLIF(
    trim(
      both FROM (
        COALESCE(ic.is_number, '') ||
        CASE
          WHEN ic.revision_year IS NOT NULL AND btrim(ic.revision_year::text) <> ''
            THEN ': ' || btrim(ic.revision_year::text)
          ELSE ''
        END
      )
    ),
    ''
  ),
  NULLIF(tp.test_method, '')
)
FROM public.is_codes ic
WHERE tp.is_code_id = ic.id
  AND (tp.is_code_label IS NULL OR btrim(tp.is_code_label) = '');

UPDATE public.test_parameters
SET is_code_label = COALESCE(NULLIF(is_code_label, ''), NULLIF(test_method, ''))
WHERE is_code_label IS NULL OR btrim(is_code_label) = '';

-- ── Seed client_master_options (empty → form dropdowns look broken) ───────────
INSERT INTO public.client_master_options (category, label, value)
SELECT v.category, v.label, v.value
FROM (VALUES
  ('company_type', 'Manufacturer', 'Manufacturer'),
  ('company_type', 'Trader', 'Trader'),
  ('company_type', 'Service Provider', 'Service Provider'),
  ('company_scale', 'Micro', 'Micro'),
  ('company_scale', 'Small', 'Small'),
  ('company_scale', 'Medium', 'Medium'),
  ('company_scale', 'Large', 'Large'),
  ('payment_term', '100 % Advance', '100 % Advance'),
  ('payment_term', '50 % Advance', '50 % Advance'),
  ('payment_term', 'Net 30', 'Net 30'),
  ('country', 'India', 'India'),
  ('state', 'Chhattisgarh', 'Chhattisgarh'),
  ('state', 'Maharashtra', 'Maharashtra'),
  ('state', 'Gujarat', 'Gujarat'),
  ('state', 'Uttar Pradesh', 'Uttar Pradesh'),
  ('state', 'Delhi', 'Delhi'),
  ('country_code', '+91 (IN)', '+91')
) AS v(category, label, value)
WHERE NOT EXISTS (
  SELECT 1 FROM public.client_master_options c
  WHERE c.category = v.category AND c.label = v.label
);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.accreditation_bodies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gst_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_parameter_units ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['accreditation_bodies', 'gst_rates', 'test_parameter_units']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS consultancy_%s_all ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY consultancy_%s_all ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      t, t
    );
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;

NOTIFY pgrst, 'reload schema';
