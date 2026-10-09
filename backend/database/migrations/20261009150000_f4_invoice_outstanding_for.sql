-- F4: outstanding for the invoices on the current list page.
-- Same rule as client_invoice_balances: grand total minus linked gross receipts and linked credit notes.
-- More than 200 ids returns no rows. Does not rewrite saved documents.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

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
    ROUND(COALESCE(r.received, 0), 2),
    ROUND(COALESCE(c.credited, 0), 2),
    ROUND(GREATEST(
      0,
      COALESCE(i.grand_total, 0) - COALESCE(r.received, 0) - COALESCE(c.credited, 0)
    ), 2)
  FROM public.finance_tax_invoices i
  LEFT JOIN LATERAL (
    SELECT SUM(t.amount) AS received
    FROM public.transactions t
    WHERE t.payment_flow = 'in'
      AND t.client_id = i.client_id
      AND btrim(COALESCE(t.extra->>'invoice_reference_no', t.extra->>'against_invoice_no', ''))
        = btrim(i.tax_invoice_number)
  ) r ON true
  LEFT JOIN LATERAL (
    SELECT SUM(cn.grand_total) AS credited
    FROM public.finance_credit_notes cn
    WHERE cn.client_id = i.client_id
      AND cn.credit_note_status IS DISTINCT FROM 'cancelled'
      AND btrim(COALESCE(cn.extra->>'reference_no', '')) = btrim(i.tax_invoice_number)
  ) c ON true
  WHERE p_invoice_ids IS NOT NULL
    AND cardinality(p_invoice_ids) BETWEEN 1 AND 200
    AND i.id = ANY (p_invoice_ids)
    AND i.tax_status IS DISTINCT FROM 'cancelled';
$$;

REVOKE ALL ON FUNCTION public.invoice_outstanding_for(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invoice_outstanding_for(uuid[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
