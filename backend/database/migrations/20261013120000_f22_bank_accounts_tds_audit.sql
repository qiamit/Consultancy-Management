-- F22: separate bank ledgers, receipt TDS detail, and immutable transaction change history.
-- Additive only; existing transaction amounts and bank rows remain unchanged.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE IF NOT EXISTS public.finance_bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_name text NOT NULL,
  bank_name text NOT NULL DEFAULT '',
  account_number_last4 text NOT NULL DEFAULT '',
  ifsc text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT finance_bank_accounts_name_nonempty CHECK (btrim(account_name) <> ''),
  CONSTRAINT finance_bank_accounts_last4_ck CHECK (account_number_last4 = '' OR account_number_last4 ~ '^[0-9]{4}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS finance_bank_accounts_name_uidx
  ON public.finance_bank_accounts (lower(btrim(account_name)));

DROP TRIGGER IF EXISTS trg_finance_bank_accounts_updated_at ON public.finance_bank_accounts;
CREATE TRIGGER trg_finance_bank_accounts_updated_at
  BEFORE UPDATE ON public.finance_bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.finance_bank_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS finance_bank_accounts_select ON public.finance_bank_accounts;
CREATE POLICY finance_bank_accounts_select ON public.finance_bank_accounts
  FOR SELECT TO authenticated
  USING ((SELECT public.app_is_admin()) OR (SELECT public.app_can_view('/finance/accounts')) OR (SELECT public.app_can_view('/finance/ledger')));
DROP POLICY IF EXISTS finance_bank_accounts_write ON public.finance_bank_accounts;
CREATE POLICY finance_bank_accounts_write ON public.finance_bank_accounts
  FOR ALL TO authenticated
  USING ((SELECT public.app_is_admin()) OR (SELECT public.app_can_edit('/finance/accounts')))
  WITH CHECK ((SELECT public.app_is_admin()) OR (SELECT public.app_can_edit('/finance/accounts')));

REVOKE ALL ON public.finance_bank_accounts FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_bank_accounts TO authenticated;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS bank_account_id uuid REFERENCES public.finance_bank_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tds_section text,
  ADD COLUMN IF NOT EXISTS tds_amount numeric,
  ADD COLUMN IF NOT EXISTS tds_taxable_amount numeric;

CREATE INDEX IF NOT EXISTS transactions_bank_account_date_idx
  ON public.transactions (bank_account_id, txn_date DESC)
  WHERE bank_account_id IS NOT NULL;

ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_tds_percent_chk;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_tds_percent_chk
  CHECK (tds_percent IS NULL OR tds_percent BETWEEN 0 AND 100) NOT VALID;
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_tds_amount_nonnegative_ck;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_tds_amount_nonnegative_ck
  CHECK (tds_amount IS NULL OR tds_amount >= 0) NOT VALID;
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_tds_taxable_nonnegative_ck;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_tds_taxable_nonnegative_ck
  CHECK (tds_taxable_amount IS NULL OR tds_taxable_amount >= 0) NOT VALID;
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_tds_section_length_ck;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_tds_section_length_ck
  CHECK (tds_section IS NULL OR length(btrim(tds_section)) <= 32) NOT VALID;

CREATE TABLE IF NOT EXISTS public.finance_transaction_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL,
  operation text NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  old_values jsonb,
  new_values jsonb
);

CREATE INDEX IF NOT EXISTS finance_transaction_audit_transaction_idx
  ON public.finance_transaction_audit (transaction_id, changed_at DESC);

ALTER TABLE public.finance_transaction_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS finance_transaction_audit_select ON public.finance_transaction_audit;
CREATE POLICY finance_transaction_audit_select ON public.finance_transaction_audit
  FOR SELECT TO authenticated
  USING ((SELECT public.app_is_admin()) OR (SELECT public.app_can_view('/finance/ledger')));
REVOKE ALL ON public.finance_transaction_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.finance_transaction_audit TO authenticated;

CREATE OR REPLACE FUNCTION public.audit_finance_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old jsonb;
  v_new jsonb;
  v_id uuid;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    v_old := jsonb_build_object(
      'receipt_number', OLD.receipt_number,
      'client_id', OLD.client_id,
      'txn_date', OLD.txn_date,
      'amount', OLD.amount,
      'payment_flow', OLD.payment_flow,
      'mode_of_payment', OLD.mode_of_payment,
      'bank_account_id', OLD.bank_account_id,
      'tds_percent', OLD.tds_percent,
      'tds_section', OLD.tds_section,
      'tds_amount', OLD.tds_amount,
      'tds_taxable_amount', OLD.tds_taxable_amount,
      'status', OLD.status
    );
  END IF;
  IF TG_OP <> 'DELETE' THEN
    v_new := jsonb_build_object(
      'receipt_number', NEW.receipt_number,
      'client_id', NEW.client_id,
      'txn_date', NEW.txn_date,
      'amount', NEW.amount,
      'payment_flow', NEW.payment_flow,
      'mode_of_payment', NEW.mode_of_payment,
      'bank_account_id', NEW.bank_account_id,
      'tds_percent', NEW.tds_percent,
      'tds_section', NEW.tds_section,
      'tds_amount', NEW.tds_amount,
      'tds_taxable_amount', NEW.tds_taxable_amount,
      'status', NEW.status
    );
  END IF;
  v_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
  INSERT INTO public.finance_transaction_audit (transaction_id, operation, actor_id, old_values, new_values)
  VALUES (v_id, TG_OP, auth.uid(), v_old, v_new);
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_finance_transaction() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_audit_finance_transaction ON public.transactions;
CREATE TRIGGER trg_audit_finance_transaction
  AFTER INSERT OR UPDATE OR DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.audit_finance_transaction();

CREATE OR REPLACE FUNCTION public.finance_ledger(p_tab text)
RETURNS TABLE (party_id uuid, party_name text, balance numeric, balance_side text, detail text)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH sale AS (
    SELECT i.client_id, SUM(COALESCE(i.grand_total, 0)) AS invoiced
    FROM public.finance_tax_invoices i
    WHERE i.tax_status IS DISTINCT FROM 'cancelled'
    GROUP BY i.client_id
  ), credits AS (
    SELECT cn.client_id, SUM(COALESCE(cn.grand_total, 0)) AS credited
    FROM public.finance_credit_notes cn
    WHERE cn.credit_note_status IS DISTINCT FROM 'cancelled'
    GROUP BY cn.client_id
  ), receipts AS (
    SELECT t.client_id, SUM(COALESCE(t.amount, 0)) AS received
    FROM public.transactions t
    WHERE t.payment_flow = 'in'
    GROUP BY t.client_id
  ), sale_due AS (
    SELECT c.id, COALESCE(NULLIF(btrim(c.company_name), ''), 'Unnamed party') AS party_name, c.company_type,
      ROUND(GREATEST(0, COALESCE(s.invoiced, 0) - COALESCE(cr.credited, 0) - COALESCE(r.received, 0)), 2) AS balance
    FROM public.clients c
    LEFT JOIN sale s ON s.client_id = c.id
    LEFT JOIN credits cr ON cr.client_id = c.id
    LEFT JOIN receipts r ON r.client_id = c.id
    WHERE c.archived_at IS NULL
  ), bills AS (
    SELECT b.client_id, SUM(COALESCE(b.grand_total, 0)) AS billed
    FROM public.finance_purchase_bills b
    WHERE b.purchase_status IS DISTINCT FROM 'cancelled'
    GROUP BY b.client_id
  ), paid AS (
    SELECT t.client_id, SUM(COALESCE(t.amount, 0)) AS amount
    FROM public.transactions t
    WHERE t.payment_flow = 'out' AND COALESCE(t.extra->>'book', '') = 'payment_made'
    GROUP BY t.client_id
  ), debited AS (
    SELECT dn.client_id, SUM(COALESCE(dn.grand_total, 0)) AS amount
    FROM public.finance_debit_notes dn
    WHERE dn.debit_note_status IS DISTINCT FROM 'cancelled'
    GROUP BY dn.client_id
  ), purchase_due AS (
    SELECT c.id, COALESCE(NULLIF(btrim(c.company_name), ''), 'Unnamed party') AS party_name, c.company_type,
      ROUND(GREATEST(0, COALESCE(b.billed, 0) - COALESCE(p.amount, 0) - COALESCE(d.amount, 0)), 2) AS balance
    FROM public.clients c
    LEFT JOIN bills b ON b.client_id = c.id
    LEFT JOIN paid p ON p.client_id = c.id
    LEFT JOIN debited d ON d.client_id = c.id
    WHERE c.archived_at IS NULL
  )
  SELECT s.id, s.party_name, s.balance, 'Dr'::text, 'Sale outstanding'::text
    FROM sale_due s WHERE p_tab = 'debtors' AND s.balance > 0.009
  UNION ALL
  SELECT p.id, p.party_name, p.balance, 'Cr'::text, 'Purchase outstanding'::text
    FROM purchase_due p WHERE p_tab = 'creditors' AND p.balance > 0.009
  UNION ALL
  SELECT s.id, s.party_name, s.balance, 'Dr'::text, 'Buyer and vendor'::text
    FROM sale_due s WHERE p_tab = 'both' AND s.company_type = 'Both' AND s.balance > 0.009
  UNION ALL
  SELECT p.id, p.party_name, p.balance, 'Cr'::text, 'Buyer and vendor'::text
    FROM purchase_due p WHERE p_tab = 'both' AND p.company_type = 'Both' AND p.balance > 0.009
  UNION ALL
  SELECT c.id, c.company_name,
    ROUND(SUM(COALESCE(t.tds_amount, COALESCE(t.tds_taxable_amount, t.amount) * COALESCE(t.tds_percent, 0) / 100, 0)), 2),
    'Dr'::text, 'TDS receivable'::text
    FROM public.transactions t
    JOIN public.clients c ON c.id = t.client_id
    WHERE p_tab = 'tds_receivable' AND t.payment_flow = 'in' AND COALESCE(t.tds_amount, 0) > 0
    GROUP BY c.id, c.company_name
    HAVING SUM(COALESCE(t.tds_amount, COALESCE(t.tds_taxable_amount, t.amount) * COALESCE(t.tds_percent, 0) / 100, 0)) > 0.009
  UNION ALL
  SELECT NULL::uuid, 'Cash',
    ROUND(SUM(CASE WHEN t.payment_flow = 'in' THEN t.amount - COALESCE(t.tds_amount, COALESCE(t.tds_taxable_amount, t.amount) * COALESCE(t.tds_percent, 0) / 100, 0) ELSE -t.amount END), 2),
    'Dr'::text, 'Cash ledger'::text
    FROM public.transactions t
    WHERE p_tab = 'cash' AND t.mode_of_payment = 'cash'
  HAVING ABS(SUM(CASE WHEN t.payment_flow = 'in' THEN t.amount - COALESCE(t.tds_amount, COALESCE(t.tds_taxable_amount, t.amount) * COALESCE(t.tds_percent, 0) / 100, 0) ELSE -t.amount END)) > 0.009
  UNION ALL
  SELECT a.id, a.account_name,
    ROUND(SUM(CASE WHEN t.payment_flow = 'in' THEN t.amount - COALESCE(t.tds_amount, 0) ELSE -t.amount END), 2),
    'Dr'::text, 'Bank ledger'::text
    FROM public.finance_bank_accounts a
    JOIN public.transactions t ON t.bank_account_id = a.id
    WHERE a.is_active AND p_tab = 'bank:' || a.id::text
    GROUP BY a.id, a.account_name
    HAVING ABS(SUM(CASE WHEN t.payment_flow = 'in' THEN t.amount - COALESCE(t.tds_amount, COALESCE(t.tds_taxable_amount, t.amount) * COALESCE(t.tds_percent, 0) / 100, 0) ELSE -t.amount END)) > 0.009
  UNION ALL
  SELECT NULL::uuid, 'Bank (account not assigned)',
    ROUND(SUM(CASE WHEN t.payment_flow = 'in' THEN t.amount - COALESCE(t.tds_amount, COALESCE(t.tds_taxable_amount, t.amount) * COALESCE(t.tds_percent, 0) / 100, 0) ELSE -t.amount END), 2),
    'Dr'::text, 'Bank ledger'::text
    FROM public.transactions t
    WHERE p_tab = 'bank:unassigned' AND t.mode_of_payment IN ('bank', 'neft_rtgs') AND t.bank_account_id IS NULL
  HAVING ABS(SUM(CASE WHEN t.payment_flow = 'in' THEN t.amount - COALESCE(t.tds_amount, COALESCE(t.tds_taxable_amount, t.amount) * COALESCE(t.tds_percent, 0) / 100, 0) ELSE -t.amount END)) > 0.009
  ORDER BY 2;
$$;

-- TDS withheld by customers is not cash received; keep it as a separate receivable asset.
CREATE OR REPLACE FUNCTION public.finance_statement(p_kind text, p_from date, p_to date)
RETURNS TABLE (section text, label text, amount numeric)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH bounds AS (
    SELECT COALESCE(p_from, date_trunc('year', CURRENT_DATE)::date) AS d1, COALESCE(p_to, CURRENT_DATE) AS d2
  ), docs AS (
    SELECT 'income'::text AS section, 'Tax invoices'::text AS label, COALESCE(SUM(grand_total), 0) AS amount
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
    SELECT 'asset', 'Cash and bank receipts', COALESCE(SUM(amount - COALESCE(tds_amount, COALESCE(tds_taxable_amount, amount) * COALESCE(tds_percent, 0) / 100, 0)), 0)
      FROM public.transactions, bounds
      WHERE payment_flow = 'in' AND txn_date <= bounds.d2
    UNION ALL
    SELECT 'asset', 'TDS receivable', COALESCE(SUM(COALESCE(tds_amount, COALESCE(tds_taxable_amount, amount) * COALESCE(tds_percent, 0) / 100, 0)), 0)
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
  ), journals AS (
    SELECT a.account_type AS section, a.account_name AS label, ROUND(SUM(l.debit - l.credit), 2) AS amount
      FROM public.finance_journal_lines l
      JOIN public.finance_journals j ON j.id = l.journal_id
      JOIN public.finance_accounts a ON a.id = l.account_id
      CROSS JOIN bounds
      WHERE (a.account_type IN ('income', 'expense') AND j.journal_date BETWEEN bounds.d1 AND bounds.d2
         OR a.account_type IN ('asset', 'liability', 'equity') AND j.journal_date <= bounds.d2)
      GROUP BY a.account_type, a.account_name
  )
  SELECT section, label, ROUND(amount, 2)
    FROM (SELECT * FROM docs UNION ALL SELECT section, 'Journal · ' || label, amount FROM journals) rows
    WHERE p_kind = 'profit_loss' AND section IN ('income', 'expense')
       OR p_kind = 'balance_sheet' AND section IN ('asset', 'liability', 'equity')
    ORDER BY section, label;
$$;

CREATE OR REPLACE FUNCTION public.finance_tds_report(p_from date, p_to date)
RETURNS TABLE (
  txn_date date,
  pan text,
  party_name text,
  tds_section text,
  taxable_amount numeric,
  tds_amount numeric
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT t.txn_date::date,
    COALESCE(c.pan, ''),
    COALESCE(NULLIF(btrim(c.company_name), ''), 'Unlinked party'),
    COALESCE(NULLIF(btrim(t.tds_section), ''), 'Section not recorded'),
    ROUND(COALESCE(t.tds_taxable_amount, t.amount, 0), 2),
    ROUND(COALESCE(t.tds_amount, t.amount * COALESCE(t.tds_percent, 0) / 100, 0), 2)
  FROM public.transactions t
  LEFT JOIN public.clients c ON c.id = t.client_id
  WHERE t.payment_flow = 'in'
    AND COALESCE(t.tds_percent, 0) > 0
    AND t.txn_date BETWEEN COALESCE(p_from, CURRENT_DATE) AND COALESCE(p_to, CURRENT_DATE)
  ORDER BY t.txn_date, c.company_name, t.receipt_number;
$$;

REVOKE ALL ON FUNCTION public.finance_ledger(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_ledger(text) TO authenticated;
REVOKE ALL ON FUNCTION public.finance_statement(text, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_statement(text, date, date) TO authenticated;
REVOKE ALL ON FUNCTION public.finance_tds_report(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_tds_report(date, date) TO authenticated;
NOTIFY pgrst, 'reload schema';
