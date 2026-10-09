-- F1: gap-free document numbers, and TDS percent on receipts.
-- Does not rewrite existing document numbers or totals. Apply when the app is idle.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE TABLE IF NOT EXISTS public.document_series (
  doc_type text PRIMARY KEY,
  prefix text NOT NULL,
  next_number integer NOT NULL,
  pad_width integer NOT NULL DEFAULT 4,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_series_next_chk CHECK (next_number >= 1),
  CONSTRAINT document_series_pad_chk CHECK (pad_width BETWEEN 1 AND 8)
);

DROP TRIGGER IF EXISTS trg_document_series_updated_at ON public.document_series;
CREATE TRIGGER trg_document_series_updated_at
  BEFORE UPDATE ON public.document_series
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.document_series (doc_type, prefix, next_number, pad_width) VALUES
  ('QUOTATION', 'QE/26-27/QT/', 1, 4),
  ('PROFORMA', 'QE/26-27/PI/', 1, 4),
  ('TAX_INVOICE', 'QE/26-27/SL/', 1, 4),
  ('CREDIT_NOTE', 'QE/26-27/CN/', 1, 4),
  ('PAYMENT_RECEIPT', 'QE/26-27/RC/', 1, 4)
ON CONFLICT (doc_type) DO NOTHING;

ALTER TABLE public.document_series ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS document_series_select ON public.document_series;
CREATE POLICY document_series_select ON public.document_series
  FOR SELECT TO authenticated
  USING (
    (SELECT public.app_is_admin())
    OR (SELECT public.app_can_view('/finance/sale/quotation'))
    OR (SELECT public.app_can_view('/finance/sale/invoice'))
    OR (SELECT public.app_can_view('/finance/sale/payment-receipt'))
  );
DROP POLICY IF EXISTS document_series_write ON public.document_series;
CREATE POLICY document_series_write ON public.document_series
  FOR ALL TO authenticated
  USING ((SELECT public.app_is_admin()))
  WITH CHECK ((SELECT public.app_is_admin()));

REVOKE ALL ON public.document_series FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_series TO authenticated;

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
    ELSE NULL
  END;
  IF v_path IS NULL OR NOT public.app_can_edit(v_path) THEN
    RAISE EXCEPTION 'No edit access for this document series';
  END IF;

  SELECT prefix, next_number, pad_width
    INTO v_prefix, v_next, v_pad
    FROM public.document_series
   WHERE doc_type = v_type
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document series is not configured';
  END IF;

  v_number := v_prefix || lpad(v_next::text, v_pad, '0');
  UPDATE public.document_series
     SET next_number = v_next + 1
   WHERE doc_type = v_type;
  RETURN v_number;
END;
$$;

REVOKE ALL ON FUNCTION public.next_document_number(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_document_number(text) TO authenticated;

ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS tds_percent numeric;
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_tds_percent_chk;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_tds_percent_chk
  CHECK (tds_percent IS NULL OR tds_percent IN (2, 10)) NOT VALID;

NOTIFY pgrst, 'reload schema';
