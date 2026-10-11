-- F18: stock is computed from the products master.
-- Tracking from the tax invoice is off until Lab Settings turns it on.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.lab_settings
  ADD COLUMN IF NOT EXISTS inventory_track_from text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS inventory_warn_low_stock boolean NOT NULL DEFAULT true;

ALTER TABLE public.lab_settings
  DROP CONSTRAINT IF EXISTS lab_settings_inventory_track_ck;
ALTER TABLE public.lab_settings
  ADD CONSTRAINT lab_settings_inventory_track_ck
  CHECK (inventory_track_from IN ('none', 'invoice'));

CREATE OR REPLACE FUNCTION public.product_stock()
RETURNS TABLE (
  product_id uuid,
  item_name text,
  item_category text,
  hsn_code text,
  sale_price numeric,
  purchase_price numeric,
  stock_on_hand numeric,
  low_stock_alert numeric,
  low_stock boolean
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH settings AS (
    SELECT
      COALESCE(inventory_track_from, 'none') AS track_from,
      COALESCE(inventory_warn_low_stock, true) AS warn
    FROM public.lab_settings
    WHERE id = '00000000-0000-0000-0000-000000000001'
  ),
  sold AS (
    SELECT
      btrim(COALESCE(l.extra->>'item_code', l.item_description, '')) AS key,
      SUM(COALESCE(l.qty, 0)) AS qty
    FROM public.finance_tax_invoice_lines l
    JOIN public.finance_tax_invoices i ON i.id = l.tax_invoice_id
    WHERE i.tax_status IS DISTINCT FROM 'cancelled'
      AND (SELECT track_from FROM settings) = 'invoice'
    GROUP BY 1
  )
  SELECT
    p.id,
    p.item_name,
    COALESCE(p.item_category, ''),
    COALESCE(p.hsn_code, ''),
    ROUND(COALESCE(p.sale_price, 0), 2),
    ROUND(COALESCE(p.purchase_price, 0), 2),
    ROUND(COALESCE(p.opening_stock, 0) - COALESCE(s.qty, 0), 2),
    ROUND(COALESCE(p.low_stock_alert, 0), 2),
    (SELECT warn FROM settings)
      AND ROUND(COALESCE(p.opening_stock, 0) - COALESCE(s.qty, 0), 2) <= ROUND(COALESCE(p.low_stock_alert, 0), 2)
  FROM public.products_services_master p
  LEFT JOIN sold s ON s.key <> '' AND (s.key = btrim(COALESCE(p.item_code, '')) OR s.key = btrim(COALESCE(p.item_name, '')))
  WHERE p.archived_at IS NULL
  ORDER BY p.item_name;
$$;

REVOKE ALL ON FUNCTION public.product_stock() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.product_stock() TO authenticated;

NOTIFY pgrst, 'reload schema';
