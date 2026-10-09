-- F10: receipts and credit notes that name one tax invoice.
-- Same match as client_invoice_balances. Gross receipt amount, credit-note grand total.
-- Does not rewrite saved documents.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

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
  SELECT
    s.kind,
    s.document_id,
    s.document_number,
    s.document_date,
    s.amount
  FROM (
    SELECT
      'receipt'::text AS kind,
      t.id AS document_id,
      btrim(t.receipt_number) AS document_number,
      t.txn_date AS document_date,
      ROUND(COALESCE(t.amount, 0), 2) AS amount
    FROM public.transactions t
    WHERE p_client_id IS NOT NULL
      AND btrim(COALESCE(p_invoice_number, '')) <> ''
      AND t.payment_flow = 'in'
      AND t.client_id = p_client_id
      AND btrim(COALESCE(t.extra->>'invoice_reference_no', t.extra->>'against_invoice_no', ''))
        = btrim(p_invoice_number)
      AND btrim(COALESCE(t.receipt_number, '')) <> ''
    UNION ALL
    SELECT
      'credit_note'::text,
      cn.id,
      btrim(cn.credit_note_number),
      cn.credit_note_date,
      ROUND(COALESCE(cn.grand_total, 0), 2)
    FROM public.finance_credit_notes cn
    WHERE p_client_id IS NOT NULL
      AND btrim(COALESCE(p_invoice_number, '')) <> ''
      AND cn.client_id = p_client_id
      AND cn.credit_note_status IS DISTINCT FROM 'cancelled'
      AND btrim(COALESCE(cn.extra->>'reference_no', '')) = btrim(p_invoice_number)
      AND btrim(COALESCE(cn.credit_note_number, '')) <> ''
  ) s
  ORDER BY s.document_date DESC NULLS LAST, s.document_number DESC
  LIMIT 50;
$$;

REVOKE ALL ON FUNCTION public.invoice_settlements(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invoice_settlements(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
