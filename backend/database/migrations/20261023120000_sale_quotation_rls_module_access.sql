-- APP-S06: Replace open USING (true) sale/quotation policies with module-access checks.
-- Live confirmed 2026-10-23: finance_* sale headers/lines and legacy quotations* used
-- authenticated FOR ALL … USING (true) WITH CHECK (true).
-- No data rewrite. Apply with npm run db:migrate when Amit asks.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION pg_temp.sale_rls_rebuild(
  p_table text,
  p_view_paths text[],
  p_edit_paths text[]
) RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pol text;
  v_rel text := format('public.%I', p_table);
  v_view text;
  v_edit text;
  i int;
BEGIN
  IF to_regclass(v_rel) IS NULL THEN
    RETURN;
  END IF;

  FOR v_pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = p_table
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %s', v_pol, v_rel);
  END LOOP;

  v_view := '(SELECT public.app_is_admin())';
  FOR i IN 1 .. coalesce(array_length(p_view_paths, 1), 0) LOOP
    v_view := v_view || format(' OR (SELECT public.app_can_view(%L))', p_view_paths[i]);
  END LOOP;

  v_edit := '(SELECT public.app_is_admin())';
  FOR i IN 1 .. coalesce(array_length(p_edit_paths, 1), 0) LOOP
    v_edit := v_edit || format(' OR (SELECT public.app_can_edit(%L))', p_edit_paths[i]);
  END LOOP;

  EXECUTE format(
    'CREATE POLICY %I ON %s FOR SELECT TO authenticated USING (%s)',
    p_table || '_select',
    v_rel,
    v_view
  );
  EXECUTE format(
    'CREATE POLICY %I ON %s FOR ALL TO authenticated USING (%s) WITH CHECK (%s)',
    p_table || '_write',
    v_rel,
    v_edit,
    v_edit
  );

  EXECUTE format('REVOKE ALL ON %s FROM PUBLIC, anon', v_rel);
  EXECUTE format(
    'GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO authenticated',
    v_rel
  );
END;
$$;

SELECT pg_temp.sale_rls_rebuild('quotations', ARRAY['/finance/sale/quotation'], ARRAY['/finance/sale/quotation']);
SELECT pg_temp.sale_rls_rebuild('quotation_line_items', ARRAY['/finance/sale/quotation'], ARRAY['/finance/sale/quotation']);
SELECT pg_temp.sale_rls_rebuild('quotation_notes', ARRAY['/finance/sale/quotation'], ARRAY['/finance/sale/quotation']);
SELECT pg_temp.sale_rls_rebuild('quotation_remarks', ARRAY['/finance/sale/quotation'], ARRAY['/finance/sale/quotation']);
SELECT pg_temp.sale_rls_rebuild('quotation_terms_conditions', ARRAY['/finance/sale/quotation'], ARRAY['/finance/sale/quotation']);

SELECT pg_temp.sale_rls_rebuild('finance_quotations', ARRAY['/finance/sale/quotation'], ARRAY['/finance/sale/quotation']);
SELECT pg_temp.sale_rls_rebuild('finance_quotation_lines', ARRAY['/finance/sale/quotation'], ARRAY['/finance/sale/quotation']);
SELECT pg_temp.sale_rls_rebuild('finance_proforma_invoices', ARRAY['/finance/sale/proforma-invoice'], ARRAY['/finance/sale/proforma-invoice']);
SELECT pg_temp.sale_rls_rebuild('finance_proforma_invoice_lines', ARRAY['/finance/sale/proforma-invoice'], ARRAY['/finance/sale/proforma-invoice']);
SELECT pg_temp.sale_rls_rebuild('finance_tax_invoices', ARRAY['/finance/sale/invoice'], ARRAY['/finance/sale/invoice']);
SELECT pg_temp.sale_rls_rebuild('finance_tax_invoice_lines', ARRAY['/finance/sale/invoice'], ARRAY['/finance/sale/invoice']);
SELECT pg_temp.sale_rls_rebuild('finance_credit_notes', ARRAY['/finance/sale/credit-note'], ARRAY['/finance/sale/credit-note']);
SELECT pg_temp.sale_rls_rebuild('finance_credit_note_lines', ARRAY['/finance/sale/credit-note'], ARRAY['/finance/sale/credit-note']);

DO $$
DECLARE
  v_pol text;
BEGIN
  IF to_regclass('public.sale_document_signature_defaults') IS NULL THEN
    RETURN;
  END IF;
  FOR v_pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sale_document_signature_defaults'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.sale_document_signature_defaults', v_pol);
  END LOOP;
  CREATE POLICY sale_document_signature_defaults_select
    ON public.sale_document_signature_defaults
    FOR SELECT TO authenticated
    USING (
      (SELECT public.app_is_admin())
      OR (SELECT public.app_can_view('/finance/sale/quotation'))
      OR (SELECT public.app_can_view('/finance/sale/proforma-invoice'))
      OR (SELECT public.app_can_view('/finance/sale/invoice'))
      OR (SELECT public.app_can_view('/finance/sale/credit-note'))
      OR (SELECT public.app_can_view('/finance/sale/payment-receipt'))
    );
  CREATE POLICY sale_document_signature_defaults_write
    ON public.sale_document_signature_defaults
    FOR ALL TO authenticated
    USING (
      (SELECT public.app_is_admin())
      OR (SELECT public.app_can_edit('/finance/sale/quotation'))
      OR (SELECT public.app_can_edit('/finance/sale/proforma-invoice'))
      OR (SELECT public.app_can_edit('/finance/sale/invoice'))
      OR (SELECT public.app_can_edit('/finance/sale/credit-note'))
      OR (SELECT public.app_can_edit('/finance/sale/payment-receipt'))
    )
    WITH CHECK (
      (SELECT public.app_is_admin())
      OR (SELECT public.app_can_edit('/finance/sale/quotation'))
      OR (SELECT public.app_can_edit('/finance/sale/proforma-invoice'))
      OR (SELECT public.app_can_edit('/finance/sale/invoice'))
      OR (SELECT public.app_can_edit('/finance/sale/credit-note'))
      OR (SELECT public.app_can_edit('/finance/sale/payment-receipt'))
    );
  REVOKE ALL ON public.sale_document_signature_defaults FROM PUBLIC, anon;
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.sale_document_signature_defaults TO authenticated;
END $$;

NOTIFY pgrst, 'reload schema';
