-- Product / Service makes (manageable master + optional text on catalog rows)

CREATE TABLE IF NOT EXISTS public.product_makes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_makes_name_key UNIQUE (name)
);

CREATE INDEX IF NOT EXISTS idx_product_makes_name
  ON public.product_makes USING btree (name);

ALTER TABLE public.product_makes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lims_product_makes_authenticated_all ON public.product_makes;
CREATE POLICY lims_product_makes_authenticated_all
  ON public.product_makes
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

ALTER TABLE public.products_services_master
  ADD COLUMN IF NOT EXISTS make text;

CREATE INDEX IF NOT EXISTS idx_products_services_master_make
  ON public.products_services_master USING btree (make);
