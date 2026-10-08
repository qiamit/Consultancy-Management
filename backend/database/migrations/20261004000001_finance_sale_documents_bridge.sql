-- Sale document bridge: lets the LIMS-style Sale UI (Proforma / Invoice / Credit Note / Payment Receipt)
-- persist into the Consultancy Pro finance_* tables and `transactions`.
-- `extra` holds UI-only fields that have no dedicated column (client snapshot, charges, line details, ...).

ALTER TABLE public.finance_proforma_invoices
  ADD COLUMN IF NOT EXISTS extra jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.finance_tax_invoices
  ADD COLUMN IF NOT EXISTS extra jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.finance_credit_notes
  ADD COLUMN IF NOT EXISTS extra jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.finance_proforma_invoice_lines
  ADD COLUMN IF NOT EXISTS extra jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.finance_tax_invoice_lines
  ADD COLUMN IF NOT EXISTS extra jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.finance_credit_note_lines
  ADD COLUMN IF NOT EXISTS extra jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS finance_proforma_invoice_lines_parent_idx
  ON public.finance_proforma_invoice_lines (proforma_invoice_id, sort_order);
CREATE INDEX IF NOT EXISTS finance_tax_invoice_lines_parent_idx
  ON public.finance_tax_invoice_lines (tax_invoice_id, sort_order);
CREATE INDEX IF NOT EXISTS finance_credit_note_lines_parent_idx
  ON public.finance_credit_note_lines (credit_note_id, sort_order);

-- Payment Receipt = transactions row with payment_flow = 'in'.
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS receipt_number text,
  ADD COLUMN IF NOT EXISTS extra jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS transactions_receipt_number_in_uidx
  ON public.transactions (receipt_number)
  WHERE payment_flow = 'in' AND receipt_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS transactions_flow_date_idx
  ON public.transactions (payment_flow, txn_date DESC);
