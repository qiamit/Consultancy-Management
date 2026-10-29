-- Security hardening (DB review 2026-10-29). Runs after 20261029100000 / 20261029150000.
-- Verified against the live catalog (read-only) before writing:
--   H1  transactions, finance_sales_orders(+_lines), finance_customer_statements(+_lines):
--       FOR ALL TO authenticated USING (true) WITH CHECK (true)  ->  module-access view / edit split.
--   H2  storage buckets whose policies checked only bucket_id (is-code-files, documents, is_code_documents,
--       calibration-files, equipment-files, quotation-signatures, sample-client-references, test-method-notes)
--       + laboratory-files readable by every signed-in user  ->  module-access policies, MIME allow-lists,
--       file_size_limit = FILE_SIZE_LIMIT (50 MB) where unset. Empty LIMS-only buckets become admin-only.
--   M1  stop marking: already fixed by 20261029100000 (not repeated here).
--   M2  finance_journal_lines / purchase_order_lines / debit_note_lines / sales_debit_note_lines:
--       one FOR ALL policy (USING = parent visible, so a viewer could UPDATE/DELETE lines)  ->  SELECT / INSERT /
--       UPDATE / DELETE split with the edit check in USING (same shape as finance_purchase_bill_lines).
--   M3  clients_select USING (true)  ->  view on any screen that reads or embeds clients (app_client_view_paths()).
--   M4  bis_portal_secret_get / client_portal_secret_get: extension_login only for editors of the BIS screens
--       that launch a Manak login; extra cap of 60 requests per user per 24 h (plus the 30 / 10 min one); still logged.
--   M7  audit_log / mcp_audit_log / portal_secret_access_log are append-only (no UPDATE / DELETE / TRUNCATE grants
--       for API roles + statement triggers that refuse them). audit_row_change strips secrets by name pattern
--       (oauth tokens, ai_api_key …) and now covers finance documents, client contacts / sites / certificates,
--       document series, AI models, portal roles, email accounts, BIS new applications and stop marking.
--   L3  legacy public.profiles: authenticated can no longer INSERT / UPDATE / DELETE (the app never writes it).
--   L5  sync_company_settings_to_lab_settings(): no longer callable by anon / authenticated.
--   L6  app_tables_without_rls(): lists public tables without RLS (for a CI / health check).
-- No data rewrite. Idempotent. Runs in one transaction (backend/scripts/apply-migrations.mjs).
-- Takes ACCESS EXCLUSIVE locks on the tables above and on storage.objects: fail fast instead of queueing.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- =====================================================================
-- 0) Path helpers
-- =====================================================================
-- Every screen that reads clients directly or embeds them (client:clients(...)): Client Master, BIS screens,
-- BIS branch offices / laboratories (stored in clients), all finance party screens, Email tools.
CREATE OR REPLACE FUNCTION public.app_client_view_paths()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT ARRAY['/masters/clients', '/masters/bis-branch-offices', '/masters/laboratories',
               '/finance/sale/quotation', '/finance/sale/proforma-invoice', '/finance/sale/invoice',
               '/finance/sale/credit-note', '/finance/sale/debit-note', '/finance/sale/payment-receipt',
               '/finance/sale/refund', '/finance/purchase/order', '/finance/purchase/bill',
               '/finance/purchase/payment', '/finance/purchase/debit-note', '/finance/expense',
               '/finance/ledger', '/finance/accounts', '/finance/journal', '/finance/statements',
               '/finance/reports', '/tools/email']::text[]
         || public.app_bis_paths();
$$;

-- Finance screens that read receipts / payments / refunds (lists, balances, settlements, books RPCs).
CREATE OR REPLACE FUNCTION public.app_finance_money_view_paths()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT ARRAY['/finance/sale/invoice', '/finance/sale/credit-note', '/finance/sale/debit-note',
               '/finance/sale/payment-receipt', '/finance/sale/refund', '/finance/purchase/bill',
               '/finance/purchase/payment', '/finance/purchase/debit-note', '/finance/ledger',
               '/finance/accounts', '/finance/journal', '/finance/statements', '/finance/reports']::text[];
$$;

-- BIS screens that launch a Manak login with the stored portal password (BisProjectsMasterPage, OSL module,
-- Renewal / Inclusion assist, Stop Marking). List-only screens (due soon, expired, our licences …) excluded.
CREATE OR REPLACE FUNCTION public.app_manak_login_paths()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT ARRAY['/bis/projects', '/bis/new-applications', '/bis/new-inclusion', '/bis/license-renewals',
               '/bis/stop-marking']::text[];
$$;

-- Rebuild all policies of one table: [select, insert, update(using+check), delete] expressions.
CREATE OR REPLACE FUNCTION pg_temp.sec_rebuild(p_table text, p_sel text, p_ins text, p_upd text, p_del text)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  p record;
BEGIN
  IF to_regclass('public.' || p_table) IS NULL THEN
    RAISE NOTICE 'security hardening: table public.% missing, skipped', p_table;
    RETURN;
  END IF;
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = p_table LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, p_table);
  END LOOP;
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', p_table);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (%s)', p_table || '_select', p_table, p_sel);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)', p_table || '_insert', p_table, p_ins);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)', p_table || '_update', p_table, p_upd, p_upd);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (%s)', p_table || '_delete', p_table, p_del);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon', p_table);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', p_table);
END;
$$;

-- Line table: SELECT = parent visible (parent RLS applies inside EXISTS); writes = editor AND parent visible.
CREATE OR REPLACE FUNCTION pg_temp.sec_lines(p_table text, p_parent text, p_fk text, p_edit text)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_par text := format('EXISTS (SELECT 1 FROM public.%I b WHERE b.id = %I.%I)', p_parent, p_table, p_fk);
  v_w   text := format('(%s) AND %s', p_edit, v_par);
BEGIN
  PERFORM pg_temp.sec_rebuild(p_table, v_par, v_w, v_w, v_w);
END;
$$;

-- =====================================================================
-- 1) H1 — transactions, sales orders, customer statements
-- =====================================================================
DO $$
DECLARE
  adm text := '(SELECT public.app_is_admin())';
  tv  text := '(SELECT public.app_is_admin()) OR (SELECT public.app_can_view(VARIADIC public.app_finance_money_view_paths()))';
  -- Receipts (flow in) = Payment Receipt editors; refunds (flow out, book refund) = Refund editors;
  -- payments made (flow out, any other book) = Payment Made editors.
  tw  text := '(SELECT public.app_is_admin())'
           || ' OR (payment_flow = ''in'' AND (SELECT public.app_can_edit(''/finance/sale/payment-receipt'')))'
           || ' OR (payment_flow <> ''in'' AND COALESCE(extra ->> ''book'', '''') = ''refund'' AND (SELECT public.app_can_edit(''/finance/sale/refund'')))'
           || ' OR (payment_flow <> ''in'' AND COALESCE(extra ->> ''book'', '''') <> ''refund'' AND (SELECT public.app_can_edit(''/finance/purchase/payment'')))';
  sv  text := '(SELECT public.app_is_admin()) OR (SELECT public.app_can_view(''/finance/statements''))';
  se  text := '(SELECT public.app_is_admin()) OR (SELECT public.app_can_edit(''/finance/statements''))';
BEGIN
  PERFORM pg_temp.sec_rebuild('transactions', tv, tw, tw, tw);
  -- No screen uses sales orders (0 rows): admin only until a Sales Order screen exists.
  PERFORM pg_temp.sec_rebuild('finance_sales_orders', adm, adm, adm, adm);
  PERFORM pg_temp.sec_lines('finance_sales_order_lines', 'finance_sales_orders', 'sales_order_id', adm);
  -- Stored customer statements (0 rows; the Statements screen uses finance_statement()): Statements module.
  PERFORM pg_temp.sec_rebuild('finance_customer_statements', sv, se, se, se);
  PERFORM pg_temp.sec_lines('finance_customer_statement_lines', 'finance_customer_statements', 'customer_statement_id', se);
END $$;

-- =====================================================================
-- 2) M2 — finance line tables: edit check in USING for UPDATE / DELETE
-- =====================================================================
SELECT pg_temp.sec_lines('finance_journal_lines', 'finance_journals', 'journal_id',
  '(SELECT public.app_is_admin()) OR (SELECT public.app_can_edit(''/finance/journal''))');
SELECT pg_temp.sec_lines('finance_purchase_order_lines', 'finance_purchase_orders', 'purchase_order_id',
  '(SELECT public.app_is_admin()) OR (SELECT public.app_can_edit(''/finance/purchase/order''))');
SELECT pg_temp.sec_lines('finance_debit_note_lines', 'finance_debit_notes', 'debit_note_id',
  '(SELECT public.app_is_admin()) OR (SELECT public.app_can_edit(''/finance/purchase/debit-note''))');
SELECT pg_temp.sec_lines('finance_sales_debit_note_lines', 'finance_sales_debit_notes', 'sales_debit_note_id',
  '(SELECT public.app_is_admin()) OR (SELECT public.app_can_edit(''/finance/sale/debit-note''))');

-- =====================================================================
-- 3) M3 — clients SELECT: only users who can open a screen that shows clients
--    (insert / update / delete policies unchanged)
-- =====================================================================
DROP POLICY IF EXISTS clients_select ON public.clients;
CREATE POLICY clients_select ON public.clients
  FOR SELECT TO authenticated
  USING ((SELECT public.app_is_admin()) OR (SELECT public.app_can_view(VARIADIC public.app_client_view_paths())));

-- =====================================================================
-- 4) H2 — storage buckets
-- =====================================================================
CREATE OR REPLACE FUNCTION pg_temp.sec_bucket(p_bucket text, p_view text, p_edit text)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lit  text := format('bucket_id = %L::text', p_bucket);
  v_name text := replace(replace(p_bucket, '-', '_'), '.', '_') || '_storage';
  v_b    text := format('bucket_id = %L', p_bucket);
  p record;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND (position(v_lit IN COALESCE(qual, '')) > 0 OR position(v_lit IN COALESCE(with_check, '')) > 0)
  LOOP
    EXECUTE format('DROP POLICY %I ON storage.objects', p.policyname);
  END LOOP;
  EXECUTE format('CREATE POLICY %I ON storage.objects FOR SELECT TO authenticated USING (%s AND (%s))', v_name || '_select', v_b, p_view);
  EXECUTE format('CREATE POLICY %I ON storage.objects FOR INSERT TO authenticated WITH CHECK (%s AND (%s))', v_name || '_insert', v_b, p_edit);
  EXECUTE format('CREATE POLICY %I ON storage.objects FOR UPDATE TO authenticated USING (%s AND (%s)) WITH CHECK (%s AND (%s))', v_name || '_update', v_b, p_edit, v_b, p_edit);
  EXECUTE format('CREATE POLICY %I ON storage.objects FOR DELETE TO authenticated USING (%s AND (%s))', v_name || '_delete', v_b, p_edit);
END;
$$;

DO $$
DECLARE
  adm  text := '(SELECT public.app_is_admin())';
  -- IS code PDFs: IS Code master + every BIS screen (CMPF / scope / varieties read them).
  isv  text := '(SELECT public.app_is_admin()) OR (SELECT public.app_can_view(''/masters/is-codes''))'
            || ' OR (SELECT public.app_can_view(VARIADIC public.app_bis_paths()))';
  ise  text := '(SELECT public.app_is_admin()) OR (SELECT public.app_can_edit(''/masters/is-codes''))';
  -- Quotation signatures: the sale documents that print a signature (same list as sale_document_signature_defaults).
  qsv  text := '(SELECT public.app_is_admin()) OR (SELECT public.app_can_view(''/finance/sale/quotation'', ''/finance/sale/proforma-invoice'','
            || ' ''/finance/sale/invoice'', ''/finance/sale/credit-note'', ''/finance/sale/payment-receipt''))';
  qse  text := '(SELECT public.app_is_admin()) OR (SELECT public.app_can_edit(''/finance/sale/quotation'', ''/finance/sale/proforma-invoice'','
            || ' ''/finance/sale/invoice'', ''/finance/sale/credit-note'', ''/finance/sale/payment-receipt''))';
  -- Company logo / letterhead / seal / registration documents: any user with a work module (prints use them).
  lfv  text := '(SELECT public.app_is_admin()) OR (SELECT public.app_can_view(VARIADIC public.app_client_view_paths()))'
            || ' OR (SELECT public.app_can_view(''/masters/is-codes'', ''/masters/product-services'', ''/masters/test-parameter'','
            || ' ''/settings/lab'', ''/tools/cms''))';
  b text;
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE 'security hardening: storage.objects missing, skipped';
    RETURN;
  END IF;
  PERFORM pg_temp.sec_bucket('is-code-files', isv, ise);
  PERFORM pg_temp.sec_bucket('quotation-signatures', qsv, qse);
  PERFORM pg_temp.sec_bucket('laboratory-files', lfv, adm);
  -- Empty and unused by the Consultancy app (LIMS leftovers): admin only.
  FOREACH b IN ARRAY ARRAY['documents', 'is_code_documents', 'calibration-files', 'equipment-files',
                           'sample-client-references', 'test-method-notes'] LOOP
    PERFORM pg_temp.sec_bucket(b, adm, adm);
  END LOOP;
END $$;

-- MIME allow-lists (enforced by storage-api on upload only; existing objects are not touched).
-- No SVG anywhere (script-capable). Sizes follow FILE_SIZE_LIMIT (52428800) unless a smaller limit is set.
DO $$
DECLARE
  img    text[] := ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
  office text[] := ARRAY['application/msword',
                         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                         'application/vnd.ms-excel',
                         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
BEGIN
  IF to_regclass('storage.buckets') IS NULL THEN
    RETURN;
  END IF;
  UPDATE storage.buckets SET allowed_mime_types = ARRAY['application/pdf'] || img || office,
                             file_size_limit = COALESCE(file_size_limit, 52428800)
   WHERE id = 'is-code-files';
  UPDATE storage.buckets SET allowed_mime_types = img,
                             file_size_limit = COALESCE(file_size_limit, 5242880)
   WHERE id = 'quotation-signatures';
  UPDATE storage.buckets SET allowed_mime_types = ARRAY['application/pdf'] || img,
                             file_size_limit = COALESCE(file_size_limit, 52428800)
   WHERE id = 'laboratory-files';
  UPDATE storage.buckets SET allowed_mime_types = ARRAY['application/pdf'] || img || office,
                             file_size_limit = COALESCE(file_size_limit, 52428800)
   WHERE id IN ('documents', 'is_code_documents', 'calibration-files', 'equipment-files',
                'sample-client-references', 'test-method-notes');
END $$;

-- =====================================================================
-- 5) M4 — portal password RPCs: narrower extension_login gate + daily cap
-- =====================================================================
CREATE OR REPLACE FUNCTION public.bis_portal_secret_get(p_project_id uuid, p_purpose text DEFAULT 'extension_login')
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_purpose text := lower(trim(COALESCE(p_purpose, '')));
  v_client  uuid;
  v_enc     bytea;
  v_recent  integer;
  v_day     integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF v_purpose NOT IN ('reveal', 'extension_login') THEN
    RAISE EXCEPTION 'Purpose must be reveal or extension_login' USING ERRCODE = '22023';
  END IF;
  IF v_purpose = 'reveal' AND NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Only Laboratory Director/Admin can reveal portal passwords.' USING ERRCODE = '42501';
  END IF;
  IF v_purpose = 'extension_login'
     AND NOT (public.app_is_admin() OR public.app_can_edit(VARIADIC public.app_manak_login_paths())) THEN
    RAISE EXCEPTION 'You do not have edit access to BIS projects.' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) FILTER (WHERE at > now() - interval '10 minutes'), count(*)
    INTO v_recent, v_day
    FROM public.portal_secret_access_log
   WHERE user_id = auth.uid() AND action IN ('reveal', 'extension_login') AND at > now() - interval '24 hours';
  IF v_recent >= 30 THEN
    RAISE EXCEPTION 'Too many password requests. Try again in a few minutes.' USING ERRCODE = '54000';
  END IF;
  IF v_day >= 60 THEN
    RAISE EXCEPTION 'Too many password requests today (limit 60 in 24 hours). Ask an admin if you need more.' USING ERRCODE = '54000';
  END IF;

  SELECT p.client_id INTO v_client FROM public.bis_projects p WHERE p.id = p_project_id;
  IF v_client IS NOT NULL THEN
    SELECT s.secret_enc INTO v_enc FROM private.client_portal_secrets s WHERE s.client_id = v_client;
  END IF;
  IF v_enc IS NULL THEN
    SELECT s.secret_enc INTO v_enc FROM private.bis_portal_secrets s WHERE s.project_id = p_project_id;
  END IF;
  IF v_enc IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.portal_secret_access_log (project_id, client_id, action, user_id, via)
  VALUES (p_project_id, v_client, v_purpose, auth.uid(), 'bis_portal_secret_get');
  RETURN extensions.pgp_sym_decrypt(v_enc, private.portal_key());
END;
$$;

CREATE OR REPLACE FUNCTION public.client_portal_secret_get(p_client_id uuid, p_purpose text DEFAULT 'extension_login')
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_purpose text := lower(trim(COALESCE(p_purpose, '')));
  v_enc     bytea;
  v_recent  integer;
  v_day     integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF v_purpose NOT IN ('reveal', 'extension_login') THEN
    RAISE EXCEPTION 'Purpose must be reveal or extension_login' USING ERRCODE = '22023';
  END IF;
  IF v_purpose = 'reveal' AND NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Only Laboratory Director/Admin can view portal passwords.' USING ERRCODE = '42501';
  END IF;
  IF v_purpose = 'extension_login'
     AND NOT (
       public.app_is_admin()
       OR public.app_can_edit('/masters/clients')
       OR public.app_can_edit(VARIADIC public.app_manak_login_paths())
     ) THEN
    RAISE EXCEPTION 'You do not have access to this portal password.' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) FILTER (WHERE at > now() - interval '10 minutes'), count(*)
    INTO v_recent, v_day
    FROM public.portal_secret_access_log
   WHERE user_id = auth.uid() AND action IN ('reveal', 'extension_login') AND at > now() - interval '24 hours';
  IF v_recent >= 30 THEN
    RAISE EXCEPTION 'Too many password requests. Try again in a few minutes.' USING ERRCODE = '54000';
  END IF;
  IF v_day >= 60 THEN
    RAISE EXCEPTION 'Too many password requests today (limit 60 in 24 hours). Ask an admin if you need more.' USING ERRCODE = '54000';
  END IF;

  SELECT s.secret_enc INTO v_enc FROM private.client_portal_secrets s WHERE s.client_id = p_client_id;
  IF v_enc IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.portal_secret_access_log (client_id, action, user_id, via)
  VALUES (p_client_id, v_purpose, auth.uid(), 'client_portal_secret_get');
  RETURN extensions.pgp_sym_decrypt(v_enc, private.portal_key());
END;
$$;

-- =====================================================================
-- 6) M7 — append-only audit tables
-- =====================================================================
-- Refuses UPDATE / DELETE / TRUNCATE. Escape hatch for a deliberate maintenance session run by the DB owner
-- (never an API role): SET LOCAL app.audit_maintenance = 'on'; in the same transaction.
CREATE OR REPLACE FUNCTION public.audit_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF COALESCE(current_setting('app.audit_maintenance', true), '') = 'on'
     AND current_user NOT IN ('anon', 'authenticated', 'service_role', 'authenticator') THEN
    RETURN NULL;
  END IF;
  RAISE EXCEPTION 'audit rows are append-only (% on %.% refused)', TG_OP, TG_TABLE_SCHEMA, TG_TABLE_NAME
    USING ERRCODE = '42501';
END;
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['audit_log', 'mcp_audit_log', 'portal_secret_access_log'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'security hardening: table public.% missing, skipped', t;
      CONTINUE;
    END IF;
    EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON public.%I FROM PUBLIC, anon, authenticated, service_role', t);
    EXECUTE format('DROP TRIGGER IF EXISTS audit_append_only_mod ON public.%I', t);
    EXECUTE format('CREATE TRIGGER audit_append_only_mod BEFORE UPDATE OR DELETE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.audit_append_only()', t);
    EXECUTE format('DROP TRIGGER IF EXISTS audit_append_only_truncate ON public.%I', t);
    EXECUTE format('CREATE TRIGGER audit_append_only_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.audit_append_only()', t);
  END LOOP;
END $$;

-- audit_row_change: same as 20261019140000 (x-actor-id under service role), plus
--   * secrets stripped by name pattern (audit_strip_secrets: *password, *_token, *api_key, secret*, key_hex …)
--     on top of the fixed list, so oauth_access_token / oauth_refresh_token / ai_api_key never reach audit_log;
--   * sync bookkeeping columns ignored (email last_sync_at / oauth_expires_at alone do not create a row);
--   * optional trigger argument = key column for tables without an id (document_series → doc_type).
CREATE OR REPLACE FUNCTION public.audit_row_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_strip  text[] := ARRAY['api_key', 'portal_password', 'password', 'secret_enc', 'encrypted_password'];
  v_ignore text[] := ARRAY['updated_at', 'updated_by', 'last_sync_at', 'oauth_expires_at'];
  v_keycol text := COALESCE(NULLIF(TG_ARGV[0], ''), 'id');
  v_claims jsonb;
  v_uid    uuid;
  v_via    text;
  v_old    jsonb;
  v_new    jsonb;
  v_o      jsonb := '{}'::jsonb;
  v_n      jsonb := '{}'::jsonb;
  v_id     text;
  k        text;
BEGIN
  BEGIN
    v_claims := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;
  EXCEPTION WHEN others THEN
    v_claims := NULL;
  END;
  BEGIN
    v_uid := NULLIF(v_claims ->> 'sub', '')::uuid;
  EXCEPTION WHEN others THEN
    v_uid := NULL;
  END;
  v_via := COALESCE(v_claims ->> 'role', session_user::text);
  IF v_uid IS NULL AND v_via = 'service_role' THEN
    BEGIN
      v_uid := NULLIF(NULLIF(current_setting('request.headers', true), '')::jsonb ->> 'x-actor-id', '')::uuid;
    EXCEPTION WHEN others THEN
      v_uid := NULL;
    END;
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') THEN v_old := public.audit_strip_secrets(to_jsonb(OLD)) - v_strip; END IF;
  IF TG_OP IN ('UPDATE', 'INSERT') THEN v_new := public.audit_strip_secrets(to_jsonb(NEW)) - v_strip; END IF;
  v_id := COALESCE(v_new ->> v_keycol, v_old ->> v_keycol);
  IF TG_OP = 'UPDATE' THEN
    FOR k IN SELECT jsonb_object_keys(v_new) LOOP
      CONTINUE WHEN k = ANY (v_ignore);
      IF (v_old -> k) IS DISTINCT FROM (v_new -> k) THEN
        v_o := v_o || jsonb_build_object(k, v_old -> k);
        v_n := v_n || jsonb_build_object(k, v_new -> k);
      END IF;
    END LOOP;
    IF v_n = '{}'::jsonb THEN
      RETURN NULL;  -- nothing meaningful changed
    END IF;
    v_old := v_o;
    v_new := v_n;
    IF v_id IS NULL THEN
      v_id := (to_jsonb(NEW) ->> v_keycol);
    END IF;
  END IF;
  INSERT INTO public.audit_log (table_name, row_id, action, changed_by, changed_via, old_data, new_data)
  VALUES (TG_TABLE_NAME, v_id, left(TG_OP, 1), v_uid, v_via, v_old, v_new);
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.audit_row_change() FROM PUBLIC, anon, authenticated;

-- Change history for more tables. Finance: document headers / money / masters only (line tables are
-- rewritten on every save and would flood the log; header totals carry the change).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'transactions', 'finance_quotations', 'finance_proforma_invoices', 'finance_tax_invoices',
    'finance_credit_notes', 'finance_sales_debit_notes', 'finance_sales_orders', 'finance_customer_statements',
    'finance_purchase_orders', 'finance_purchase_bills', 'finance_debit_notes', 'finance_expenses',
    'finance_journals', 'finance_accounts', 'finance_bank_accounts',
    'bis_new_applications', 'bis_stop_marking_cases',
    'client_contacts', 'client_sites', 'client_certificate_files',
    'ai_models', 'portal_roles', 'email_accounts'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'security hardening: table public.% missing, audit trigger skipped', t;
      CONTINUE;
    END IF;
    EXECUTE format('DROP TRIGGER IF EXISTS zz_audit_row_change ON public.%I', t);
    EXECUTE format('CREATE TRIGGER zz_audit_row_change AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_row_change()', t);
  END LOOP;
  IF to_regclass('public.document_series') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS zz_audit_row_change ON public.document_series;
    CREATE TRIGGER zz_audit_row_change AFTER INSERT OR UPDATE OR DELETE ON public.document_series
      FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('doc_type');
  END IF;
END $$;

-- =====================================================================
-- 7) L3 / L5 / L6
-- =====================================================================
-- Legacy profiles table (superseded by user_profiles): read-only for API users.
DO $$
BEGIN
  IF to_regclass('public.profiles') IS NOT NULL THEN
    REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM anon, authenticated;
  END IF;
END $$;

-- Called only by its own migration; SECURITY DEFINER writes lab_settings, so no API role may call it.
DO $$
BEGIN
  IF to_regprocedure('public.sync_company_settings_to_lab_settings()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.sync_company_settings_to_lab_settings() FROM PUBLIC, anon, authenticated;
  END IF;
END $$;

-- Health check: public tables without RLS (expected: none).
CREATE OR REPLACE FUNCTION public.app_tables_without_rls()
RETURNS TABLE (table_name text)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT c.relname::text
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity
   ORDER BY 1;
$$;

-- Function privileges (S5 rule: every new function revokes PUBLIC / anon).
DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['public.app_client_view_paths()', 'public.app_finance_money_view_paths()',
                           'public.app_manak_login_paths()', 'public.bis_portal_secret_get(uuid,text)',
                           'public.client_portal_secret_get(uuid,text)', 'public.app_tables_without_rls()'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
  EXECUTE 'REVOKE ALL ON FUNCTION public.audit_append_only() FROM PUBLIC, anon, authenticated, service_role';
END $$;

NOTIFY pgrst, 'reload schema';
