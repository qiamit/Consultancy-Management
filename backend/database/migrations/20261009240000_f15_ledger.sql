-- F15: ledger tabs from sale outstanding, purchase outstanding, and cash movement.
-- Other accounts stay empty until the chart of accounts exists.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.finance_ledger(p_tab text)
RETURNS TABLE (
  party_id uuid,
  party_name text,
  balance numeric,
  balance_side text,
  detail text
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH sale AS (
    SELECT
      i.client_id,
      SUM(COALESCE(i.grand_total, 0)) AS invoiced
    FROM public.finance_tax_invoices i
    WHERE i.tax_status IS DISTINCT FROM 'cancelled'
    GROUP BY i.client_id
  ),
  credits AS (
    SELECT cn.client_id, SUM(COALESCE(cn.grand_total, 0)) AS credited
    FROM public.finance_credit_notes cn
    WHERE cn.credit_note_status IS DISTINCT FROM 'cancelled'
    GROUP BY cn.client_id
  ),
  receipts AS (
    SELECT t.client_id, SUM(COALESCE(t.amount, 0)) AS received
    FROM public.transactions t
    WHERE t.payment_flow = 'in'
    GROUP BY t.client_id
  ),
  sale_due AS (
    SELECT
      c.id,
      c.company_name,
      c.company_type,
      ROUND(GREATEST(
        0,
        COALESCE(s.invoiced, 0) - COALESCE(cr.credited, 0) - COALESCE(r.received, 0)
      ), 2) AS balance
    FROM public.clients c
    LEFT JOIN sale s ON s.client_id = c.id
    LEFT JOIN credits cr ON cr.client_id = c.id
    LEFT JOIN receipts r ON r.client_id = c.id
    WHERE c.archived_at IS NULL
  ),
  bills AS (
    SELECT b.client_id, SUM(COALESCE(b.grand_total, 0)) AS billed
    FROM public.finance_purchase_bills b
    WHERE b.purchase_status IS DISTINCT FROM 'cancelled'
    GROUP BY b.client_id
  ),
  paid AS (
    SELECT t.client_id, SUM(COALESCE(t.amount, 0)) AS amount
    FROM public.transactions t
    WHERE t.payment_flow = 'out'
      AND COALESCE(t.extra->>'book', '') = 'payment_made'
    GROUP BY t.client_id
  ),
  debited AS (
    SELECT dn.client_id, SUM(COALESCE(dn.grand_total, 0)) AS amount
    FROM public.finance_debit_notes dn
    WHERE dn.debit_note_status IS DISTINCT FROM 'cancelled'
    GROUP BY dn.client_id
  ),
  purchase_due AS (
    SELECT
      c.id,
      c.company_name,
      c.company_type,
      ROUND(GREATEST(
        0,
        COALESCE(b.billed, 0) - COALESCE(p.amount, 0) - COALESCE(d.amount, 0)
      ), 2) AS balance
    FROM public.clients c
    LEFT JOIN bills b ON b.client_id = c.id
    LEFT JOIN paid p ON p.client_id = c.id
    LEFT JOIN debited d ON d.client_id = c.id
    WHERE c.archived_at IS NULL
  )
  SELECT s.id, s.company_name, s.balance, 'Dr'::text, 'Sale outstanding'::text
  FROM sale_due s
  WHERE p_tab = 'debtors' AND s.balance > 0.009
  UNION ALL
  SELECT p.id, p.company_name, p.balance, 'Cr'::text, 'Purchase outstanding'::text
  FROM purchase_due p
  WHERE p_tab = 'creditors' AND p.balance > 0.009
  UNION ALL
  SELECT s.id, s.company_name, s.balance, 'Dr'::text, 'Buyer and vendor'::text
  FROM sale_due s
  WHERE p_tab = 'both' AND s.company_type = 'Both' AND s.balance > 0.009
  UNION ALL
  SELECT p.id, p.company_name, p.balance, 'Cr'::text, 'Buyer and vendor'::text
  FROM purchase_due p
  WHERE p_tab = 'both' AND p.company_type = 'Both' AND p.balance > 0.009
  UNION ALL
  SELECT
    NULL::uuid,
    CASE COALESCE(t.mode_of_payment, 'other')
      WHEN 'cash' THEN 'Cash'
      WHEN 'bank' THEN 'Bank'
      WHEN 'neft_rtgs' THEN 'Bank'
      WHEN 'upi' THEN 'UPI'
      WHEN 'cheque' THEN 'Cheque'
      ELSE 'Other'
    END,
    ROUND(SUM(CASE WHEN t.payment_flow = 'in' THEN t.amount ELSE -t.amount END), 2),
    'Dr'::text,
    'Cash and bank'::text
  FROM public.transactions t
  WHERE p_tab = 'cash_bank'
  GROUP BY 2
  HAVING ABS(SUM(CASE WHEN t.payment_flow = 'in' THEN t.amount ELSE -t.amount END)) > 0.009
  ORDER BY 2;
$$;

REVOKE ALL ON FUNCTION public.finance_ledger(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_ledger(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
