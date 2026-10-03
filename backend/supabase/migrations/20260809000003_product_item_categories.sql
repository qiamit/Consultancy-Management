-- Product / Service item categories (manageable master + free-text on catalog rows)

CREATE TABLE IF NOT EXISTS public.product_item_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_item_categories_name_key UNIQUE (name)
);

CREATE INDEX IF NOT EXISTS idx_product_item_categories_name
  ON public.product_item_categories USING btree (name);

ALTER TABLE public.product_item_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lims_product_item_categories_authenticated_all ON public.product_item_categories;
CREATE POLICY lims_product_item_categories_authenticated_all
  ON public.product_item_categories
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

INSERT INTO public.product_item_categories (name)
VALUES ('Calibration'), ('Testing')
ON CONFLICT (name) DO NOTHING;

-- Allow any category name on catalog rows (managed via product_item_categories UI)
ALTER TABLE public.products_services_master
  DROP CONSTRAINT IF EXISTS products_services_master_item_category_check;
