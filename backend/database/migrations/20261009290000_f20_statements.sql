-- F20: balance sheet and profit and loss from posted documents plus journals.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.finance_statement(p_kind text, p_from date, p_to date)
RETURNS TABLE (section text, label text, amount numeric)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH bounds AS (
    SELECT
      COALESCE(p_from, date_trunc('year', CURRENT_DATE)::date) AS d1,
      COALESCE(p_to, CURRENT_DATE) AS d2
  ),
  docs AS (
    SELECT 'income'::text AS section, 'Tax invoices'::text AS label,
      COALESCE(SUM(grand_total), 0) AS amount
    FROM public.finance_tax_invoices, bounds
    WHERE tax_status IS DISTINCT FROM 'cancelled' AND tax_date BETWEEN bounds.d1 AND bounds.d2
    UNION ALL
    SELECT 'income', 'Less credit notes', -COALESCE(SUM(grand_total), 0)
    FROM public.finance_credit_notes, bounds
    WHERE credit_note_status IS DISTINCT FROM 'cancelled' AND credit_note_date BETWEEN bounds.d1 AND bounds.d2
    UNION ALL
    SELECT 'income', 'Sales debit notes', COALESCE(SUM(grand_total), 0)
    FROM public.finance_sales_debit_notes, bounds
    WHERE sales_debit_note_status IS DISTINCT FROM 'cancelled' AND sales_debit_note_date BETWEEN bounds.d1 AND bounds.d2
    UNION ALL
    SELECT 'expense', 'Purchase bills', COALESCE(SUM(grand_total), 0)
    FROM public.finance_purchase_bills, bounds
    WHERE purchase_status IS DISTINCT FROM 'cancelled' AND purchase_date BETWEEN bounds.d1 AND bounds.d2
    UNION ALL
    SELECT 'expense', 'Less debit notes', -COALESCE(SUM(grand_total), 0)
    FROM public.finance_debit_notes, bounds
    WHERE debit_note_status IS DISTINCT FROM 'cancelled' AND debit_note_date BETWEEN bounds.d1 AND bounds.d2
    UNION ALL
    SELECT 'expense', 'Expenses', COALESCE(SUM(amount), 0)
    FROM public.finance_expenses, bounds
    WHERE expense_status IS DISTINCT FROM 'cancelled' AND expense_date BETWEEN bounds.d1 AND bounds.d2
    UNION ALL
    SELECT 'asset', 'Receipts collected', COALESCE(SUM(amount), 0)
    FROM public.transactions, bounds
    WHERE payment_flow = 'in' AND txn_date <= bounds.d2
    UNION ALL
    SELECT 'asset', 'Less payments made', -COALESCE(SUM(amount), 0)
    FROM public.transactions, bounds
    WHERE payment_flow = 'out' AND COALESCE(extra->>'book', '') = 'payment_made' AND txn_date <= bounds.d2
    UNION ALL
    SELECT 'asset', 'Less refunds', -COALESCE(SUM(amount), 0)
    FROM public.transactions, bounds
    WHERE payment_flow = 'out' AND COALESCE(extra->>'book', '') = 'refund' AND txn_date <= bounds.d2
  ),
  journals AS (
    SELECT
      a.account_type AS section,
      a.account_name AS label,
      ROUND(SUM(l.debit - l.credit), 2) AS amount
    FROM public.finance_journal_lines l
    JOIN public.finance_journals j ON j.id = l.journal_id
    JOIN public.finance_accounts a ON a.id = l.account_id
    CROSS JOIN bounds
    WHERE (
      a.account_type IN ('income', 'expense') AND j.journal_date BETWEEN bounds.d1 AND bounds.d2
      OR a.account_type IN ('asset', 'liability', 'equity') AND j.journal_date <= bounds.d2
    )
    GROUP BY a.account_type, a.account_name
  )
  SELECT section, label, ROUND(amount, 2)
  FROM (
    SELECT * FROM docs
    UNION ALL
    SELECT section, 'Journal · ' || label, amount FROM journals
  ) rows
  WHERE p_kind = 'profit_loss' AND section IN ('income', 'expense')
     OR p_kind = 'balance_sheet' AND section IN ('asset', 'liability', 'equity')
  ORDER BY section, label;
$$;

REVOKE ALL ON FUNCTION public.finance_statement(text, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_statement(text, date, date) TO authenticated;

NOTIFY pgrst, 'reload schema';
