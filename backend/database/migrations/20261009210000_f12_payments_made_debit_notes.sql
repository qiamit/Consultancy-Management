-- F12: payments made and debit notes reduce one purchase bill.
-- TDS stays off purchase. Does not rewrite sale documents.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE IF NOT EXISTS public.finance_debit_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debit_note_number text NOT NULL,
  debit_note_date date NOT NULL DEFAULT ((CURRENT_DATE AT TIME ZONE 'utc'::text))::date,
  valid_until_date date NOT NULL,
  client_id uuid REFERENCES public.clients (id) ON DELETE SET NULL,
  invoice_type text NOT NULL DEFAULT 'service',
  debit_note_status text NOT NULL DEFAULT 'pending',
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
  CONSTRAINT finance_debit_notes_number_nonempty CHECK (btrim(debit_note_number) <> ''),
  CONSTRAINT finance_debit_notes_type_ck CHECK (invoice_type = ANY (ARRAY['service'::text, 'supply'::text])),
  CONSTRAINT finance_debit_notes_status_ck CHECK (debit_note_status = ANY (ARRAY['pending'::text, 'accepted'::text, 'cancelled'::text]))
);

CREATE UNIQUE INDEX IF NOT EXISTS finance_debit_notes_number_uidx
  ON public.finance_debit_notes (debit_note_number);

CREATE TABLE IF NOT EXISTS public.finance_debit_note_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debit_note_id uuid NOT NULL REFERENCES public.finance_debit_notes (id) ON DELETE CASCADE,
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

DROP TRIGGER IF EXISTS trg_finance_debit_notes_updated_at ON public.finance_debit_notes;
CREATE TRIGGER trg_finance_debit_notes_updated_at
  BEFORE UPDATE ON public.finance_debit_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_finance_debit_notes_vendor ON public.finance_debit_notes;
CREATE TRIGGER trg_finance_debit_notes_vendor
  BEFORE INSERT OR UPDATE OF client_id ON public.finance_debit_notes
  FOR EACH ROW EXECUTE FUNCTION public.purchase_bill_vendor_check();

ALTER TABLE public.finance_debit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_debit_note_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS finance_debit_notes_select ON public.finance_debit_notes;
CREATE POLICY finance_debit_notes_select ON public.finance_debit_notes
  FOR SELECT TO authenticated
  USING ((SELECT public.app_is_admin()) OR (SELECT public.app_can_view('/finance/purchase/debit-note')));
DROP POLICY IF EXISTS finance_debit_notes_write ON public.finance_debit_notes;
CREATE POLICY finance_debit_notes_write ON public.finance_debit_notes
  FOR ALL TO authenticated
  USING ((SELECT public.app_is_admin()) OR (SELECT public.app_can_edit('/finance/purchase/debit-note')))
  WITH CHECK ((SELECT public.app_is_admin()) OR (SELECT public.app_can_edit('/finance/purchase/debit-note')));

DROP POLICY IF EXISTS finance_debit_note_lines_all ON public.finance_debit_note_lines;
CREATE POLICY finance_debit_note_lines_all ON public.finance_debit_note_lines
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.finance_debit_notes b WHERE b.id = debit_note_id))
  WITH CHECK (
    ((SELECT public.app_is_admin()) OR (SELECT public.app_can_edit('/finance/purchase/debit-note')))
    AND EXISTS (SELECT 1 FROM public.finance_debit_notes b WHERE b.id = debit_note_id)
  );

REVOKE ALL ON public.finance_debit_notes FROM PUBLIC, anon;
REVOKE ALL ON public.finance_debit_note_lines FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_debit_notes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_debit_note_lines TO authenticated;

INSERT INTO public.document_series (doc_type, prefix, next_number, pad_width) VALUES
  ('PAYMENT_MADE', 'QE/26-27/PM/', 1, 4),
  ('DEBIT_NOTE', 'QE/26-27/DN/', 1, 4)
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
    WHEN 'PAYMENT_MADE' THEN '/finance/purchase/payment'
    WHEN 'DEBIT_NOTE' THEN '/finance/purchase/debit-note'
    WHEN 'PURCHASE_ORDER' THEN '/finance/purchase/order'
    WHEN 'EXPENSE' THEN '/finance/expense'
    WHEN 'REFUND' THEN '/finance/sale/refund'
    WHEN 'SALES_DEBIT_NOTE' THEN '/finance/sale/debit-note'
    WHEN 'JOURNAL' THEN '/finance/journal'
    ELSE NULL
  END;
  IF v_path IS NULL OR NOT public.app_can_edit(v_path) THEN
    RAISE EXCEPTION 'No edit access for this document series';
  END IF;
  SELECT prefix, next_number, pad_width INTO v_prefix, v_next, v_pad
    FROM public.document_series WHERE doc_type = v_type FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document series is not configured';
  END IF;
  v_number := v_prefix || lpad(v_next::text, v_pad, '0');
  UPDATE public.document_series SET next_number = v_next + 1 WHERE doc_type = v_type;
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
    ROUND(GREATEST(
      0,
      COALESCE(b.grand_total, 0) - COALESCE(p.paid, 0) - COALESCE(d.debited, 0)
    ), 2)
  FROM public.finance_purchase_bills b
  LEFT JOIN LATERAL (
    SELECT SUM(t.amount) AS paid
    FROM public.transactions t
    WHERE t.payment_flow = 'out'
      AND COALESCE(t.extra->>'book', '') = 'payment_made'
      AND t.client_id = b.client_id
      AND btrim(COALESCE(t.extra->>'purchase_bill_number', '')) = btrim(b.purchase_bill_number)
  ) p ON true
  LEFT JOIN LATERAL (
    SELECT SUM(dn.grand_total) AS debited
    FROM public.finance_debit_notes dn
    WHERE dn.client_id = b.client_id
      AND dn.debit_note_status IS DISTINCT FROM 'cancelled'
      AND btrim(COALESCE(dn.extra->>'reference_no', '')) = btrim(b.purchase_bill_number)
  ) d ON true
  WHERE p_bill_ids IS NOT NULL
    AND cardinality(p_bill_ids) BETWEEN 1 AND 200
    AND b.id = ANY (p_bill_ids);
$$;

REVOKE ALL ON FUNCTION public.purchase_outstanding_for(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purchase_outstanding_for(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.purchase_settlements(p_client_id uuid, p_bill_number text)
RETURNS TABLE (
  kind text,
  document_id uuid,
  document_number text,
  document_date date,
  amount numeric
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT s.kind, s.document_id, s.document_number, s.document_date, s.amount
  FROM (
    SELECT
      'payment_made'::text AS kind,
      t.id AS document_id,
      btrim(t.receipt_number) AS document_number,
      t.txn_date AS document_date,
      ROUND(COALESCE(t.amount, 0), 2) AS amount
    FROM public.transactions t
    WHERE p_client_id IS NOT NULL
      AND btrim(COALESCE(p_bill_number, '')) <> ''
      AND t.payment_flow = 'out'
      AND COALESCE(t.extra->>'book', '') = 'payment_made'
      AND t.client_id = p_client_id
      AND btrim(COALESCE(t.extra->>'purchase_bill_number', '')) = btrim(p_bill_number)
      AND btrim(COALESCE(t.receipt_number, '')) <> ''
    UNION ALL
    SELECT
      'debit_note'::text,
      dn.id,
      btrim(dn.debit_note_number),
      dn.debit_note_date,
      ROUND(COALESCE(dn.grand_total, 0), 2)
    FROM public.finance_debit_notes dn
    WHERE p_client_id IS NOT NULL
      AND btrim(COALESCE(p_bill_number, '')) <> ''
      AND dn.client_id = p_client_id
      AND dn.debit_note_status IS DISTINCT FROM 'cancelled'
      AND btrim(COALESCE(dn.extra->>'reference_no', '')) = btrim(p_bill_number)
      AND btrim(COALESCE(dn.debit_note_number, '')) <> ''
  ) s
  ORDER BY s.document_date DESC NULLS LAST, s.document_number DESC
  LIMIT 50;
$$;

REVOKE ALL ON FUNCTION public.purchase_settlements(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purchase_settlements(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.payment_made_vendor_check()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_type text;
BEGIN
  IF COALESCE(NEW.extra->>'book', '') IS DISTINCT FROM 'payment_made' THEN
    RETURN NEW;
  END IF;
  IF NEW.client_id IS NULL THEN
    RAISE EXCEPTION 'A payment made needs a vendor';
  END IF;
  SELECT company_type INTO v_type FROM public.clients WHERE id = NEW.client_id;
  IF v_type IS DISTINCT FROM 'Vendor' AND v_type IS DISTINCT FROM 'Both' THEN
    RAISE EXCEPTION 'Payment made vendor must be Vendor or Both';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.payment_made_vendor_check() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_transactions_payment_made_vendor ON public.transactions;
CREATE TRIGGER trg_transactions_payment_made_vendor
  BEFORE INSERT OR UPDATE OF client_id, extra ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.payment_made_vendor_check();

NOTIFY pgrst, 'reload schema';
