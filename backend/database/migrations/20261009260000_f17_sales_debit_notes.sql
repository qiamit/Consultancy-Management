-- F17: sales debit note is an extra charge against one tax invoice.
-- Outstanding becomes grand total minus net receipts and credit notes, plus these debit notes.
-- A refund against a linked receipt reduces the amount collected.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE IF NOT EXISTS public.finance_sales_debit_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_debit_note_number text NOT NULL,
  sales_debit_note_date date NOT NULL DEFAULT ((CURRENT_DATE AT TIME ZONE 'utc'::text))::date,
  valid_until_date date NOT NULL,
  client_id uuid REFERENCES public.clients (id) ON DELETE SET NULL,
  invoice_type text NOT NULL DEFAULT 'service',
  sales_debit_note_status text NOT NULL DEFAULT 'pending',
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
  CONSTRAINT finance_sales_debit_notes_number_nonempty CHECK (btrim(sales_debit_note_number) <> ''),
  CONSTRAINT finance_sales_debit_notes_status_ck CHECK (sales_debit_note_status = ANY (ARRAY['pending'::text, 'accepted'::text, 'cancelled'::text]))
);

CREATE UNIQUE INDEX IF NOT EXISTS finance_sales_debit_notes_number_uidx
  ON public.finance_sales_debit_notes (sales_debit_note_number);

CREATE TABLE IF NOT EXISTS public.finance_sales_debit_note_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_debit_note_id uuid NOT NULL REFERENCES public.finance_sales_debit_notes (id) ON DELETE CASCADE,
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

DROP TRIGGER IF EXISTS trg_finance_sales_debit_notes_updated_at ON public.finance_sales_debit_notes;
CREATE TRIGGER trg_finance_sales_debit_notes_updated_at
  BEFORE UPDATE ON public.finance_sales_debit_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.finance_sales_debit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_sales_debit_note_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS finance_sales_debit_notes_select ON public.finance_sales_debit_notes;
CREATE POLICY finance_sales_debit_notes_select ON public.finance_sales_debit_notes
  FOR SELECT TO authenticated
  USING ((SELECT public.app_is_admin()) OR (SELECT public.app_can_view('/finance/sale/debit-note')));
DROP POLICY IF EXISTS finance_sales_debit_notes_write ON public.finance_sales_debit_notes;
CREATE POLICY finance_sales_debit_notes_write ON public.finance_sales_debit_notes
  FOR ALL TO authenticated
  USING ((SELECT public.app_is_admin()) OR (SELECT public.app_can_edit('/finance/sale/debit-note')))
  WITH CHECK ((SELECT public.app_is_admin()) OR (SELECT public.app_can_edit('/finance/sale/debit-note')));

DROP POLICY IF EXISTS finance_sales_debit_note_lines_all ON public.finance_sales_debit_note_lines;
CREATE POLICY finance_sales_debit_note_lines_all ON public.finance_sales_debit_note_lines
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.finance_sales_debit_notes b WHERE b.id = sales_debit_note_id))
  WITH CHECK (
    ((SELECT public.app_is_admin()) OR (SELECT public.app_can_edit('/finance/sale/debit-note')))
    AND EXISTS (SELECT 1 FROM public.finance_sales_debit_notes b WHERE b.id = sales_debit_note_id)
  );

REVOKE ALL ON public.finance_sales_debit_notes FROM PUBLIC, anon;
REVOKE ALL ON public.finance_sales_debit_note_lines FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_sales_debit_notes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_sales_debit_note_lines TO authenticated;

INSERT INTO public.document_series (doc_type, prefix, next_number, pad_width) VALUES
  ('SALES_DEBIT_NOTE', 'QE/26-27/SD/', 1, 4)
ON CONFLICT (doc_type) DO NOTHING;

CREATE OR REPLACE FUNCTION public.invoice_settlement_totals(p_client_id uuid, p_invoice_number text)
RETURNS TABLE (received numeric, credited numeric, debited numeric)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    ROUND(GREATEST(0, COALESCE(r.received, 0) - COALESCE(rf.refunded, 0)), 2),
    ROUND(COALESCE(c.credited, 0), 2),
    ROUND(COALESCE(d.debited, 0), 2)
  FROM (SELECT 1) seed
  LEFT JOIN LATERAL (
    SELECT SUM(t.amount) AS received
    FROM public.transactions t
    WHERE t.payment_flow = 'in'
      AND t.client_id = p_client_id
      AND btrim(COALESCE(t.extra->>'invoice_reference_no', t.extra->>'against_invoice_no', ''))
        = btrim(COALESCE(p_invoice_number, ''))
  ) r ON true
  LEFT JOIN LATERAL (
    SELECT SUM(t.amount) AS refunded
    FROM public.transactions t
    WHERE t.payment_flow = 'out'
      AND COALESCE(t.extra->>'book', '') = 'refund'
      AND t.client_id = p_client_id
      AND btrim(COALESCE(t.extra->>'receipt_number', '')) IN (
        SELECT btrim(src.receipt_number)
        FROM public.transactions src
        WHERE src.payment_flow = 'in'
          AND src.client_id = p_client_id
          AND btrim(COALESCE(src.receipt_number, '')) <> ''
          AND btrim(COALESCE(src.extra->>'invoice_reference_no', src.extra->>'against_invoice_no', ''))
            = btrim(COALESCE(p_invoice_number, ''))
      )
  ) rf ON true
  LEFT JOIN LATERAL (
    SELECT SUM(cn.grand_total) AS credited
    FROM public.finance_credit_notes cn
    WHERE cn.client_id = p_client_id
      AND cn.credit_note_status IS DISTINCT FROM 'cancelled'
      AND btrim(COALESCE(cn.extra->>'reference_no', '')) = btrim(COALESCE(p_invoice_number, ''))
  ) c ON true
  LEFT JOIN LATERAL (
    SELECT SUM(sd.grand_total) AS debited
    FROM public.finance_sales_debit_notes sd
    WHERE sd.client_id = p_client_id
      AND sd.sales_debit_note_status IS DISTINCT FROM 'cancelled'
      AND btrim(COALESCE(sd.extra->>'reference_no', '')) = btrim(COALESCE(p_invoice_number, ''))
  ) d ON true;
$$;

REVOKE ALL ON FUNCTION public.invoice_settlement_totals(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invoice_settlement_totals(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.client_invoice_balances(p_client_id uuid)
RETURNS TABLE (
  invoice_id uuid,
  invoice_number text,
  grand_total numeric,
  received numeric,
  credited numeric,
  outstanding numeric
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    i.id,
    i.tax_invoice_number,
    ROUND(COALESCE(i.grand_total, 0), 2),
    t.received,
    t.credited,
    ROUND(GREATEST(0, COALESCE(i.grand_total, 0) - t.received - t.credited + t.debited), 2)
  FROM public.finance_tax_invoices i
  CROSS JOIN LATERAL public.invoice_settlement_totals(i.client_id, i.tax_invoice_number) t
  WHERE p_client_id IS NOT NULL
    AND i.client_id = p_client_id
    AND i.tax_status IS DISTINCT FROM 'cancelled'
    AND btrim(COALESCE(i.tax_invoice_number, '')) <> ''
  ORDER BY i.tax_date DESC, i.tax_invoice_number DESC;
$$;

CREATE OR REPLACE FUNCTION public.invoice_outstanding_for(p_invoice_ids uuid[])
RETURNS TABLE (
  invoice_id uuid,
  invoice_number text,
  grand_total numeric,
  received numeric,
  credited numeric,
  outstanding numeric
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    i.id,
    i.tax_invoice_number,
    ROUND(COALESCE(i.grand_total, 0), 2),
    t.received,
    t.credited,
    ROUND(GREATEST(0, COALESCE(i.grand_total, 0) - t.received - t.credited + t.debited), 2)
  FROM public.finance_tax_invoices i
  CROSS JOIN LATERAL public.invoice_settlement_totals(i.client_id, i.tax_invoice_number) t
  WHERE p_invoice_ids IS NOT NULL
    AND cardinality(p_invoice_ids) BETWEEN 1 AND 200
    AND i.id = ANY (p_invoice_ids)
    AND i.tax_status IS DISTINCT FROM 'cancelled';
$$;

CREATE OR REPLACE FUNCTION public.invoice_ageing_summary(p_as_of date DEFAULT CURRENT_DATE)
RETURNS TABLE (
  bucket text,
  invoice_count integer,
  outstanding numeric
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH as_of AS (
    SELECT COALESCE(p_as_of, CURRENT_DATE) AS d
  ),
  open_rows AS (
    SELECT
      public.invoice_age_bucket(i.tax_date, (SELECT d FROM as_of)) AS bucket,
      ROUND(GREATEST(0, COALESCE(i.grand_total, 0) - t.received - t.credited + t.debited), 2) AS outstanding
    FROM public.finance_tax_invoices i
    CROSS JOIN LATERAL public.invoice_settlement_totals(i.client_id, i.tax_invoice_number) t
    WHERE i.tax_status IS DISTINCT FROM 'cancelled'
      AND btrim(COALESCE(i.tax_invoice_number, '')) <> ''
  ),
  summed AS (
    SELECT bucket, COUNT(*)::integer AS invoice_count, ROUND(COALESCE(SUM(outstanding), 0), 2) AS outstanding
    FROM open_rows
    WHERE outstanding > 0.009
    GROUP BY bucket
  )
  SELECT b.bucket, COALESCE(s.invoice_count, 0), COALESCE(s.outstanding, 0)
  FROM (VALUES ('current'), ('d31_60'), ('d61_90'), ('over_90')) AS b(bucket)
  LEFT JOIN summed s ON s.bucket = b.bucket
  ORDER BY CASE b.bucket WHEN 'current' THEN 1 WHEN 'd31_60' THEN 2 WHEN 'd61_90' THEN 3 ELSE 4 END;
$$;

CREATE OR REPLACE FUNCTION public.invoice_ids_for_age_bucket(
  p_bucket text,
  p_as_of date DEFAULT CURRENT_DATE,
  p_search text DEFAULT '',
  p_limit integer DEFAULT 10,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (invoice_id uuid, total_count bigint)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH as_of AS (SELECT COALESCE(p_as_of, CURRENT_DATE) AS d),
  needle AS (SELECT NULLIF(btrim(COALESCE(p_search, '')), '') AS q),
  open_rows AS (
    SELECT
      i.id,
      i.tax_date,
      i.created_at,
      public.invoice_age_bucket(i.tax_date, (SELECT d FROM as_of)) AS bucket,
      ROUND(GREATEST(0, COALESCE(i.grand_total, 0) - t.received - t.credited + t.debited), 2) AS outstanding
    FROM public.finance_tax_invoices i
    CROSS JOIN LATERAL public.invoice_settlement_totals(i.client_id, i.tax_invoice_number) t
    WHERE p_bucket IN ('current', 'd31_60', 'd61_90', 'over_90')
      AND i.tax_status IS DISTINCT FROM 'cancelled'
      AND btrim(COALESCE(i.tax_invoice_number, '')) <> ''
      AND (
        (SELECT q FROM needle) IS NULL
        OR i.tax_invoice_number ILIKE '%' || (SELECT q FROM needle) || '%'
        OR EXISTS (
          SELECT 1 FROM public.clients cl
          WHERE cl.id = i.client_id
            AND cl.company_name ILIKE '%' || (SELECT q FROM needle) || '%'
        )
      )
  ),
  matched AS (
    SELECT id, tax_date, created_at
    FROM open_rows
    WHERE outstanding > 0.009 AND bucket = p_bucket
  )
  SELECT m.id, COUNT(*) OVER ()
  FROM matched m
  ORDER BY m.tax_date DESC NULLS LAST, m.created_at DESC NULLS LAST, m.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

CREATE OR REPLACE FUNCTION public.invoice_settlements(p_client_id uuid, p_invoice_number text)
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
    SELECT 'receipt'::text AS kind, t.id, btrim(t.receipt_number), t.txn_date, ROUND(COALESCE(t.amount, 0), 2)
    FROM public.transactions t
    WHERE p_client_id IS NOT NULL
      AND btrim(COALESCE(p_invoice_number, '')) <> ''
      AND t.payment_flow = 'in'
      AND t.client_id = p_client_id
      AND btrim(COALESCE(t.extra->>'invoice_reference_no', t.extra->>'against_invoice_no', '')) = btrim(p_invoice_number)
      AND btrim(COALESCE(t.receipt_number, '')) <> ''
    UNION ALL
    SELECT 'credit_note'::text, cn.id, btrim(cn.credit_note_number), cn.credit_note_date, ROUND(COALESCE(cn.grand_total, 0), 2)
    FROM public.finance_credit_notes cn
    WHERE p_client_id IS NOT NULL
      AND btrim(COALESCE(p_invoice_number, '')) <> ''
      AND cn.client_id = p_client_id
      AND cn.credit_note_status IS DISTINCT FROM 'cancelled'
      AND btrim(COALESCE(cn.extra->>'reference_no', '')) = btrim(p_invoice_number)
    UNION ALL
    SELECT 'sales_debit_note'::text, sd.id, btrim(sd.sales_debit_note_number), sd.sales_debit_note_date, ROUND(COALESCE(sd.grand_total, 0), 2)
    FROM public.finance_sales_debit_notes sd
    WHERE p_client_id IS NOT NULL
      AND btrim(COALESCE(p_invoice_number, '')) <> ''
      AND sd.client_id = p_client_id
      AND sd.sales_debit_note_status IS DISTINCT FROM 'cancelled'
      AND btrim(COALESCE(sd.extra->>'reference_no', '')) = btrim(p_invoice_number)
  ) s(kind, document_id, document_number, document_date, amount)
  ORDER BY s.document_date DESC NULLS LAST, s.document_number DESC
  LIMIT 50;
$$;

ALTER TABLE public.quotation_terms_conditions
  DROP CONSTRAINT IF EXISTS quotation_terms_conditions_document_kind_chk;
ALTER TABLE public.quotation_terms_conditions
  ADD CONSTRAINT quotation_terms_conditions_document_kind_chk
  CHECK (document_kind IN (
    'quotation', 'proformaInvoice', 'invoice', 'creditNote', 'paymentReceipt',
    'purchase', 'paymentMade', 'debitNote', 'purchaseOrder', 'refund', 'salesDebitNote'
  ));

ALTER TABLE public.quotation_notes
  DROP CONSTRAINT IF EXISTS quotation_notes_document_kind_chk;
ALTER TABLE public.quotation_notes
  ADD CONSTRAINT quotation_notes_document_kind_chk
  CHECK (document_kind IN (
    'quotation', 'proformaInvoice', 'invoice', 'creditNote', 'paymentReceipt',
    'purchase', 'paymentMade', 'debitNote', 'purchaseOrder', 'refund', 'salesDebitNote'
  ));

ALTER TABLE public.sale_document_signature_defaults
  DROP CONSTRAINT IF EXISTS sale_document_signature_defaults_kind_chk;
ALTER TABLE public.sale_document_signature_defaults
  ADD CONSTRAINT sale_document_signature_defaults_kind_chk
  CHECK (document_kind IN (
    'quotation', 'proformaInvoice', 'invoice', 'creditNote', 'paymentReceipt',
    'purchase', 'paymentMade', 'debitNote', 'purchaseOrder', 'refund', 'salesDebitNote'
  ));

NOTIFY pgrst, 'reload schema';
