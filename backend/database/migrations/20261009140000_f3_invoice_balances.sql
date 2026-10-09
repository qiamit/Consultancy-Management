-- F3: outstanding on one client's tax invoices.
-- Received is the gross receipt amount linked by invoice number. Credit notes linked the same way reduce the balance.
-- A missing client id returns no rows. Does not rewrite saved documents.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

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
  WHERE p_client_id IS NOT NULL
    AND i.client_id = p_client_id
    AND i.tax_status IS DISTINCT FROM 'cancelled'
    AND btrim(COALESCE(i.tax_invoice_number, '')) <> ''
  ORDER BY i.tax_date DESC, i.tax_invoice_number DESC;
$$;

REVOKE ALL ON FUNCTION public.client_invoice_balances(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.client_invoice_balances(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
