-- F11: purchase bills. Vendor is a client flagged Vendor or Both.
-- Outstanding is the bill total until payments made and debit notes exist (F12).
-- Does not rewrite sale documents. Apply when the app is idle.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE IF NOT EXISTS public.finance_purchase_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_bill_number text NOT NULL,
  purchase_date date NOT NULL DEFAULT ((CURRENT_DATE AT TIME ZONE 'utc'::text))::date,
  valid_until_date date NOT NULL,
  client_id uuid REFERENCES public.clients (id) ON DELETE SET NULL,
  invoice_type text NOT NULL DEFAULT 'service',
  purchase_status text NOT NULL DEFAULT 'pending',
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
  CONSTRAINT finance_purchase_bills_number_nonempty CHECK (btrim(purchase_bill_number) <> ''),
  CONSTRAINT finance_purchase_bills_type_ck CHECK (invoice_type = ANY (ARRAY['service'::text, 'supply'::text])),
  CONSTRAINT finance_purchase_bills_status_ck CHECK (purchase_status = ANY (ARRAY['pending'::text, 'accepted'::text, 'cancelled'::text]))
);

CREATE UNIQUE INDEX IF NOT EXISTS finance_purchase_bills_number_uidx
  ON public.finance_purchase_bills (purchase_bill_number);

CREATE INDEX IF NOT EXISTS finance_purchase_bills_client_date_idx
  ON public.finance_purchase_bills (client_id, purchase_date DESC);

DROP TRIGGER IF EXISTS trg_finance_purchase_bills_updated_at ON public.finance_purchase_bills;
CREATE TRIGGER trg_finance_purchase_bills_updated_at
  BEFORE UPDATE ON public.finance_purchase_bills
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.finance_purchase_bill_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_bill_id uuid NOT NULL REFERENCES public.finance_purchase_bills (id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS finance_purchase_bill_lines_parent_idx
  ON public.finance_purchase_bill_lines (purchase_bill_id, sort_order);

CREATE OR REPLACE FUNCTION public.purchase_bill_vendor_check()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_type text;
BEGIN
  IF NEW.client_id IS NULL THEN
    RAISE EXCEPTION 'A purchase bill needs a vendor';
  END IF;
  SELECT company_type INTO v_type
    FROM public.clients
   WHERE id = NEW.client_id;
  IF v_type IS DISTINCT FROM 'Vendor' AND v_type IS DISTINCT FROM 'Both' THEN
    RAISE EXCEPTION 'Purchase bill vendor must be Vendor or Both';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_finance_purchase_bills_vendor ON public.finance_purchase_bills;
CREATE TRIGGER trg_finance_purchase_bills_vendor
  BEFORE INSERT OR UPDATE OF client_id ON public.finance_purchase_bills
  FOR EACH ROW EXECUTE FUNCTION public.purchase_bill_vendor_check();

ALTER TABLE public.finance_purchase_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_purchase_bill_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS finance_purchase_bills_select ON public.finance_purchase_bills;
CREATE POLICY finance_purchase_bills_select ON public.finance_purchase_bills
  FOR SELECT TO authenticated
  USING (
    (SELECT public.app_is_admin())
    OR (SELECT public.app_can_view('/finance/purchase/bill'))
  );

DROP POLICY IF EXISTS finance_purchase_bills_insert ON public.finance_purchase_bills;
CREATE POLICY finance_purchase_bills_insert ON public.finance_purchase_bills
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.app_is_admin())
    OR (SELECT public.app_can_edit('/finance/purchase/bill'))
  );

DROP POLICY IF EXISTS finance_purchase_bills_update ON public.finance_purchase_bills;
CREATE POLICY finance_purchase_bills_update ON public.finance_purchase_bills
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.app_is_admin())
    OR (SELECT public.app_can_edit('/finance/purchase/bill'))
  )
  WITH CHECK (
    (SELECT public.app_is_admin())
    OR (SELECT public.app_can_edit('/finance/purchase/bill'))
  );

DROP POLICY IF EXISTS finance_purchase_bills_delete ON public.finance_purchase_bills;
CREATE POLICY finance_purchase_bills_delete ON public.finance_purchase_bills
  FOR DELETE TO authenticated
  USING (
    (SELECT public.app_is_admin())
    OR (SELECT public.app_can_edit('/finance/purchase/bill'))
  );

DROP POLICY IF EXISTS finance_purchase_bill_lines_select ON public.finance_purchase_bill_lines;
CREATE POLICY finance_purchase_bill_lines_select ON public.finance_purchase_bill_lines
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.finance_purchase_bills b
      WHERE b.id = purchase_bill_id
    )
  );

DROP POLICY IF EXISTS finance_purchase_bill_lines_insert ON public.finance_purchase_bill_lines;
CREATE POLICY finance_purchase_bill_lines_insert ON public.finance_purchase_bill_lines
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      (SELECT public.app_is_admin())
      OR (SELECT public.app_can_edit('/finance/purchase/bill'))
    )
    AND EXISTS (
      SELECT 1 FROM public.finance_purchase_bills b
      WHERE b.id = purchase_bill_id
    )
  );

DROP POLICY IF EXISTS finance_purchase_bill_lines_update ON public.finance_purchase_bill_lines;
CREATE POLICY finance_purchase_bill_lines_update ON public.finance_purchase_bill_lines
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.app_is_admin())
    OR (SELECT public.app_can_edit('/finance/purchase/bill'))
  )
  WITH CHECK (
    (SELECT public.app_is_admin())
    OR (SELECT public.app_can_edit('/finance/purchase/bill'))
  );

DROP POLICY IF EXISTS finance_purchase_bill_lines_delete ON public.finance_purchase_bill_lines;
CREATE POLICY finance_purchase_bill_lines_delete ON public.finance_purchase_bill_lines
  FOR DELETE TO authenticated
  USING (
    (SELECT public.app_is_admin())
    OR (SELECT public.app_can_edit('/finance/purchase/bill'))
  );

REVOKE ALL ON public.finance_purchase_bills FROM PUBLIC, anon;
REVOKE ALL ON public.finance_purchase_bill_lines FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_purchase_bills TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_purchase_bill_lines TO authenticated;

REVOKE ALL ON FUNCTION public.purchase_bill_vendor_check() FROM PUBLIC, anon;

INSERT INTO public.document_series (doc_type, prefix, next_number, pad_width) VALUES
  ('PURCHASE', 'QE/26-27/PU/', 1, 4)
ON CONFLICT (doc_type) DO NOTHING;

CREATE OR REPLACE FUNCTION public.next_document_number(p_doc_type text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_type text := upper(btrim(COALESCE(p_doc_type, '')));
  v_path text;
  v_prefix text;
  v_next integer;
  v_pad integer;
  v_number text;
BEGIN
  v_path := CASE v_type
    WHEN 'QUOTATION' THEN '/finance/sale/quotation'
    WHEN 'PROFORMA' THEN '/finance/sale/proforma-invoice'
    WHEN 'TAX_INVOICE' THEN '/finance/sale/invoice'
    WHEN 'CREDIT_NOTE' THEN '/finance/sale/credit-note'
    WHEN 'PAYMENT_RECEIPT' THEN '/finance/sale/payment-receipt'
    WHEN 'PURCHASE' THEN '/finance/purchase/bill'
    ELSE NULL
  END;
  IF v_path IS NULL OR NOT public.app_can_edit(v_path) THEN
    RAISE EXCEPTION 'No edit access for this document series';
  END IF;

  SELECT prefix, next_number, pad_width
    INTO v_prefix, v_next, v_pad
    FROM public.document_series
   WHERE doc_type = v_type
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document series is not configured';
  END IF;

  v_number := v_prefix || lpad(v_next::text, v_pad, '0');
  UPDATE public.document_series
     SET next_number = v_next + 1
   WHERE doc_type = v_type;
  RETURN v_number;
END;
$$;

REVOKE ALL ON FUNCTION public.next_document_number(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_document_number(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.purchase_outstanding_for(p_bill_ids uuid[])
RETURNS TABLE (bill_id uuid, outstanding numeric)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    b.id,
    ROUND(COALESCE(b.grand_total, 0), 2)
  FROM public.finance_purchase_bills b
  WHERE p_bill_ids IS NOT NULL
    AND cardinality(p_bill_ids) BETWEEN 1 AND 200
    AND b.id = ANY (p_bill_ids);
$$;

REVOKE ALL ON FUNCTION public.purchase_outstanding_for(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purchase_outstanding_for(uuid[]) TO authenticated;

ALTER TABLE public.quotation_terms_conditions
  DROP CONSTRAINT IF EXISTS quotation_terms_conditions_document_kind_chk;
ALTER TABLE public.quotation_terms_conditions
  ADD CONSTRAINT quotation_terms_conditions_document_kind_chk
  CHECK (
    document_kind IN (
      'quotation',
      'proformaInvoice',
      'invoice',
      'creditNote',
      'paymentReceipt',
      'purchase'
    )
  );

ALTER TABLE public.quotation_notes
  DROP CONSTRAINT IF EXISTS quotation_notes_document_kind_chk;
ALTER TABLE public.quotation_notes
  ADD CONSTRAINT quotation_notes_document_kind_chk
  CHECK (
    document_kind IN (
      'quotation',
      'proformaInvoice',
      'invoice',
      'creditNote',
      'paymentReceipt',
      'purchase'
    )
  );

ALTER TABLE public.sale_document_signature_defaults
  DROP CONSTRAINT IF EXISTS sale_document_signature_defaults_kind_chk;
ALTER TABLE public.sale_document_signature_defaults
  ADD CONSTRAINT sale_document_signature_defaults_kind_chk
  CHECK (
    document_kind IN (
      'quotation',
      'proformaInvoice',
      'invoice',
      'creditNote',
      'paymentReceipt',
      'purchase'
    )
  );

NOTIFY pgrst, 'reload schema';
