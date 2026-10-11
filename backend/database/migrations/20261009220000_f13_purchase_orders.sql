-- F13: purchase orders. No GST and no stock. Convert copies lines onto a purchase bill.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE IF NOT EXISTS public.finance_purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_number text NOT NULL,
  purchase_order_date date NOT NULL DEFAULT ((CURRENT_DATE AT TIME ZONE 'utc'::text))::date,
  valid_until_date date NOT NULL,
  client_id uuid REFERENCES public.clients (id) ON DELETE SET NULL,
  invoice_type text NOT NULL DEFAULT 'service',
  purchase_order_status text NOT NULL DEFAULT 'pending',
  notes text,
  terms_and_conditions text,
  scope_of_work text,
  bank_details text,
  seal_and_sign text,
  subtotal numeric NOT NULL DEFAULT 0,
  tax_total numeric NOT NULL DEFAULT 0,
  grand_total numeric NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT finance_purchase_orders_number_nonempty CHECK (btrim(purchase_order_number) <> ''),
  CONSTRAINT finance_purchase_orders_status_ck CHECK (purchase_order_status = ANY (ARRAY['pending'::text, 'accepted'::text, 'cancelled'::text]))
);

CREATE UNIQUE INDEX IF NOT EXISTS finance_purchase_orders_number_uidx
  ON public.finance_purchase_orders (purchase_order_number);

CREATE TABLE IF NOT EXISTS public.finance_purchase_order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES public.finance_purchase_orders (id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  product_master_item_id uuid,
  item_description text,
  unit_of_item text,
  qty numeric NOT NULL DEFAULT 1,
  unit_rate numeric NOT NULL DEFAULT 0,
  line_discount text,
  gst_rate text,
  line_subtotal numeric NOT NULL DEFAULT 0,
  line_tax numeric NOT NULL DEFAULT 0,
  line_total numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  extra jsonb NOT NULL DEFAULT '{}'::jsonb
);

DROP TRIGGER IF EXISTS trg_finance_purchase_orders_updated_at ON public.finance_purchase_orders;
CREATE TRIGGER trg_finance_purchase_orders_updated_at
  BEFORE UPDATE ON public.finance_purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_finance_purchase_orders_vendor ON public.finance_purchase_orders;
CREATE TRIGGER trg_finance_purchase_orders_vendor
  BEFORE INSERT OR UPDATE OF client_id ON public.finance_purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.purchase_bill_vendor_check();

ALTER TABLE public.finance_purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_purchase_order_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS finance_purchase_orders_select ON public.finance_purchase_orders;
CREATE POLICY finance_purchase_orders_select ON public.finance_purchase_orders
  FOR SELECT TO authenticated
  USING ((SELECT public.app_is_admin()) OR (SELECT public.app_can_view('/finance/purchase/order')));
DROP POLICY IF EXISTS finance_purchase_orders_write ON public.finance_purchase_orders;
CREATE POLICY finance_purchase_orders_write ON public.finance_purchase_orders
  FOR ALL TO authenticated
  USING ((SELECT public.app_is_admin()) OR (SELECT public.app_can_edit('/finance/purchase/order')))
  WITH CHECK ((SELECT public.app_is_admin()) OR (SELECT public.app_can_edit('/finance/purchase/order')));

DROP POLICY IF EXISTS finance_purchase_order_lines_all ON public.finance_purchase_order_lines;
CREATE POLICY finance_purchase_order_lines_all ON public.finance_purchase_order_lines
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.finance_purchase_orders b WHERE b.id = purchase_order_id))
  WITH CHECK (
    ((SELECT public.app_is_admin()) OR (SELECT public.app_can_edit('/finance/purchase/order')))
    AND EXISTS (SELECT 1 FROM public.finance_purchase_orders b WHERE b.id = purchase_order_id)
  );

REVOKE ALL ON public.finance_purchase_orders FROM PUBLIC, anon;
REVOKE ALL ON public.finance_purchase_order_lines FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_purchase_orders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_purchase_order_lines TO authenticated;

INSERT INTO public.document_series (doc_type, prefix, next_number, pad_width) VALUES
  ('PURCHASE_ORDER', 'QE/26-27/PO/', 1, 4)
ON CONFLICT (doc_type) DO NOTHING;

NOTIFY pgrst, 'reload schema';
