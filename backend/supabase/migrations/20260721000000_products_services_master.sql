-- Product & Services master (commercial catalog for Calibration / Testing)
CREATE TABLE IF NOT EXISTS public.products_services_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type text NOT NULL CHECK (item_type = ANY (ARRAY['Product'::text, 'Service'::text])),
  item_code text NOT NULL,
  item_category text NOT NULL CHECK (item_category = ANY (ARRAY['Calibration'::text, 'Testing'::text])),
  item_name text NOT NULL,
  item_description text,
  hsn_code text,
  sale_price numeric(14, 2) NOT NULL DEFAULT 0,
  purchase_price numeric(14, 2) NOT NULL DEFAULT 0,
  gst_percent numeric(6, 2) NOT NULL DEFAULT 0,
  discount numeric(14, 2) NOT NULL DEFAULT 0,
  unit_of_measurement text,
  opening_stock numeric(14, 3) NOT NULL DEFAULT 0,
  low_stock_alert numeric(14, 3) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT products_services_master_item_code_key UNIQUE (item_code)
);

CREATE INDEX IF NOT EXISTS idx_products_services_master_type
  ON public.products_services_master USING btree (item_type);

CREATE INDEX IF NOT EXISTS idx_products_services_master_category
  ON public.products_services_master USING btree (item_category);

CREATE INDEX IF NOT EXISTS idx_products_services_master_name
  ON public.products_services_master USING btree (item_name);

DROP TRIGGER IF EXISTS trg_products_services_master_updated_at ON public.products_services_master;
CREATE TRIGGER trg_products_services_master_updated_at
  BEFORE UPDATE ON public.products_services_master
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

ALTER TABLE public.products_services_master ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lims_products_services_master_authenticated_all ON public.products_services_master;
CREATE POLICY lims_products_services_master_authenticated_all
  ON public.products_services_master
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
