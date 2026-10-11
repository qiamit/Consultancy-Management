-- F21: reports for the books that exist. One date range, this financial year by default in the app.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.finance_report(p_report text, p_from date, p_to date)
RETURNS TABLE (
  label text,
  party_name text,
  document_number text,
  amount numeric,
  tax_amount numeric
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH bounds AS (
    SELECT COALESCE(p_from, CURRENT_DATE) AS d1, COALESCE(p_to, CURRENT_DATE) AS d2
  )
  SELECT 'GST sales'::text, c.company_name, i.tax_invoice_number,
    ROUND(COALESCE(i.grand_total, 0), 2), ROUND(COALESCE(i.tax_total, 0), 2)
  FROM public.finance_tax_invoices i
  LEFT JOIN public.clients c ON c.id = i.client_id
  CROSS JOIN bounds
  WHERE p_report = 'gst_sales'
    AND i.tax_status IS DISTINCT FROM 'cancelled'
    AND i.tax_date BETWEEN bounds.d1 AND bounds.d2
  UNION ALL
  SELECT 'GST purchase', c.company_name, b.purchase_bill_number,
    ROUND(COALESCE(b.grand_total, 0), 2), ROUND(COALESCE(b.tax_total, 0), 2)
  FROM public.finance_purchase_bills b
  LEFT JOIN public.clients c ON c.id = b.client_id
  CROSS JOIN bounds
  WHERE p_report = 'gst_purchase'
    AND b.purchase_status IS DISTINCT FROM 'cancelled'
    AND b.purchase_date BETWEEN bounds.d1 AND bounds.d2
  UNION ALL
  SELECT 'Party sales', c.company_name, '',
    ROUND(SUM(COALESCE(i.grand_total, 0)), 2), ROUND(SUM(COALESCE(i.tax_total, 0)), 2)
  FROM public.finance_tax_invoices i
  JOIN public.clients c ON c.id = i.client_id
  CROSS JOIN bounds
  WHERE p_report = 'party_sales'
    AND i.tax_status IS DISTINCT FROM 'cancelled'
    AND i.tax_date BETWEEN bounds.d1 AND bounds.d2
  GROUP BY c.company_name
  UNION ALL
  SELECT 'Party purchase', c.company_name, '',
    ROUND(SUM(COALESCE(b.grand_total, 0)), 2), ROUND(SUM(COALESCE(b.tax_total, 0)), 2)
  FROM public.finance_purchase_bills b
  JOIN public.clients c ON c.id = b.client_id
  CROSS JOIN bounds
  WHERE p_report = 'party_purchase'
    AND b.purchase_status IS DISTINCT FROM 'cancelled'
    AND b.purchase_date BETWEEN bounds.d1 AND bounds.d2
  GROUP BY c.company_name
  UNION ALL
  SELECT 'SAC / HSN sales', '', COALESCE(NULLIF(btrim(l.extra->>'hsn_sac'), ''), 'No SAC'),
    ROUND(SUM(COALESCE(l.line_total, 0)), 2), ROUND(SUM(COALESCE(l.line_tax, 0)), 2)
  FROM public.finance_tax_invoice_lines l
  JOIN public.finance_tax_invoices i ON i.id = l.tax_invoice_id
  CROSS JOIN bounds
  WHERE p_report = 'hsn_sales'
    AND i.tax_status IS DISTINCT FROM 'cancelled'
    AND i.tax_date BETWEEN bounds.d1 AND bounds.d2
  GROUP BY 3
  UNION ALL
  SELECT 'TDS receivable', c.company_name, t.receipt_number,
    ROUND(COALESCE(t.amount, 0), 2),
    ROUND(COALESCE(t.amount, 0) * COALESCE(t.tds_percent, 0) / 100, 2)
  FROM public.transactions t
  LEFT JOIN public.clients c ON c.id = t.client_id
  CROSS JOIN bounds
  WHERE p_report = 'tds_receivable'
    AND t.payment_flow = 'in'
    AND t.tds_percent IN (2, 10)
    AND t.txn_date BETWEEN bounds.d1 AND bounds.d2
  ORDER BY 1, 2, 3;
$$;

REVOKE ALL ON FUNCTION public.finance_report(text, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_report(text, date, date) TO authenticated;

NOTIFY pgrst, 'reload schema';
