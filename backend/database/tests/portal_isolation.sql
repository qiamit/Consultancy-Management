-- Customer Portal isolation test. Run as supabase_admin against a database that has the portal migration:
--   psql -v ON_ERROR_STOP=1 -f backend/database/tests/portal_isolation.sql
-- Everything runs in one transaction and is rolled back. It fails (non-zero exit) when:
--   * a public table has no customer lockout policy;
--   * a customer can read any row of any public table (other than their own profile) or any storage object
--     other than the files shared on their own licences;
--   * a customer can write anything;
--   * the portal functions return another client's licence.
-- It needs two licences of two different clients and one file on the first licence.

BEGIN;

-- 1) Every public table carries the lockout.
DO $$
DECLARE missing text;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO missing
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
     AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname
                       AND p.policyname IN ('customer_lockout', 'customer_lockout_read') AND p.permissive = 'RESTRICTIVE');
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: tables without customer lockout: %', missing;
  END IF;
  RAISE NOTICE 'PASS: every public table has the customer lockout';
END $$;

-- 2) Two test customers on two different clients.
CREATE TEMP TABLE t_case ON COMMIT DROP AS
WITH a AS (
  SELECT p.id AS project_a, p.client_id AS client_a
    FROM public.bis_projects p
   WHERE p.client_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.bis_project_files f WHERE f.bis_project_id = p.id)
   ORDER BY p.created_at LIMIT 1
)
SELECT a.*, b.id AS project_b, b.client_id AS client_b,
       '00000000-0000-4000-8000-0000000000a1'::uuid AS user_a,
       '00000000-0000-4000-8000-0000000000b2'::uuid AS user_b
  FROM a CROSS JOIN LATERAL (
    SELECT p.id, p.client_id FROM public.bis_projects p
     WHERE p.client_id IS NOT NULL AND p.client_id <> a.client_a ORDER BY p.created_at LIMIT 1) b;
GRANT SELECT ON t_case TO authenticated;

DO $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM t_case;
  IF r.project_a IS NULL OR r.project_b IS NULL THEN
    RAISE EXCEPTION 'SETUP: need two licences of two clients, the first with a file';
  END IF;
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  VALUES (r.user_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'portal-test-a@example.invalid', '', now(), now(), now()),
         (r.user_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'portal-test-b@example.invalid', '', now(), now(), now());
  INSERT INTO public.user_profiles (id, email, full_name, role, status)
  VALUES (r.user_a, 'portal-test-a@example.invalid', 'Portal Test A', 'customer', 'Active'),
         (r.user_b, 'portal-test-b@example.invalid', 'Portal Test B', 'customer', 'Active')
  ON CONFLICT (id) DO UPDATE SET role = 'customer', status = 'Active', designation = NULL;
  INSERT INTO public.portal_customers (user_id, client_id) VALUES (r.user_a, r.client_a), (r.user_b, r.client_b);
  INSERT INTO public.portal_licence_access (user_id, project_id) VALUES (r.user_a, r.project_a), (r.user_b, r.project_b);
  -- Share one file of licence A.
  UPDATE public.bis_project_files SET customer_visible = true
   WHERE id = (SELECT id FROM public.bis_project_files WHERE bis_project_id = r.project_a ORDER BY created_at LIMIT 1);
  -- Records (Phase 2): one section per licence, both in the free trial.
  IF to_regclass('public.portal_rec_sections') IS NOT NULL THEN
    INSERT INTO public.portal_services (project_id, records_enabled, trial_ends)
    VALUES (r.project_a, true, current_date + 30), (r.project_b, true, current_date + 30)
    ON CONFLICT (project_id) DO UPDATE SET records_enabled = true, trial_ends = current_date + 30;
    INSERT INTO public.portal_rec_sections (id, project_id, kind, name)
    VALUES ('00000000-0000-4000-8000-00000000aa01', r.project_a, 'raw_material', 'Test RM A'),
           ('00000000-0000-4000-8000-00000000bb01', r.project_b, 'raw_material', 'Test RM B');
    INSERT INTO public.portal_rec_columns (section_id, key, label, col_type)
    VALUES ('00000000-0000-4000-8000-00000000aa01', 'qty', 'Qty', 'number'),
           ('00000000-0000-4000-8000-00000000bb01', 'qty', 'Qty', 'number');
    INSERT INTO public.portal_rec_entries (section_id, project_id, data)
    VALUES ('00000000-0000-4000-8000-00000000bb01', r.project_b, '{"qty": 9}');
  END IF;
  -- A licence of another client cannot be given to customer A.
  BEGIN
    INSERT INTO public.portal_licence_access (user_id, project_id) VALUES (r.user_a, r.project_b);
    RAISE EXCEPTION 'FAIL: licence of another client was assigned';
  EXCEPTION WHEN invalid_parameter_value THEN
    RAISE NOTICE 'PASS: licence of another client cannot be assigned';
  END;
END $$;

-- 3) Act as customer A (signed in with Two-Step Login).
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT user_a FROM t_case), 'role', 'authenticated', 'aal', 'aal2')::text, true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  t record;
  n bigint;
  leaks text := '';
  r record;
BEGIN
  SELECT * INTO r FROM t_case;
  FOR t IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
     WHERE ns.nspname = 'public' AND c.relkind IN ('r', 'p') ORDER BY 1
  LOOP
    BEGIN
      EXECUTE format('SELECT count(*) FROM public.%I', t.relname) INTO n;
    EXCEPTION WHEN insufficient_privilege THEN
      n := 0;
    END;
    IF t.relname = 'user_profiles' THEN
      IF n <> 1 THEN leaks := leaks || format(' user_profiles=%s', n); END IF;
    ELSIF n > 0 THEN
      leaks := leaks || format(' %s=%s', t.relname, n);
    END IF;
  END LOOP;
  IF leaks <> '' THEN RAISE EXCEPTION 'FAIL: customer A can read:%', leaks; END IF;
  RAISE NOTICE 'PASS: customer A reads no table row (own profile only)';

  SELECT count(*) INTO n FROM storage.objects;
  IF n > 1 THEN RAISE EXCEPTION 'FAIL: customer A sees % storage objects', n; END IF;
  SELECT count(*) INTO n FROM storage.objects o
   WHERE NOT EXISTS (SELECT 1 FROM public.portal_licence_detail(r.project_a) d,
                       jsonb_array_elements(d -> 'files') f WHERE f ->> 'storage_path' = o.name);
  IF n > 0 THEN RAISE EXCEPTION 'FAIL: customer A sees a storage object that is not shared'; END IF;
  RAISE NOTICE 'PASS: customer A sees only the shared file in storage';

  SELECT count(*) INTO n FROM public.portal_my_licences();
  IF n <> 1 OR NOT EXISTS (SELECT 1 FROM public.portal_my_licences() WHERE id = r.project_a) THEN
    RAISE EXCEPTION 'FAIL: portal_my_licences returned % rows', n;
  END IF;
  IF jsonb_array_length(public.portal_licence_detail(r.project_a) -> 'files') <> 1 THEN
    RAISE EXCEPTION 'FAIL: shared file list is wrong';
  END IF;
  BEGIN
    PERFORM public.portal_licence_detail(r.project_b);
    RAISE EXCEPTION 'FAIL: customer A opened the licence of another client';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: portal functions return only customer A''s licence';
  END;

  IF to_regclass('public.portal_rec_sections') IS NOT NULL THEN
    PERFORM public.portal_entry_save('00000000-0000-4000-8000-00000000aa01', NULL, current_date, 'LOT-1', '{"qty": 5}', 'pass');
    IF (SELECT count(*) FROM public.portal_entries('00000000-0000-4000-8000-00000000aa01')) <> 1 THEN
      RAISE EXCEPTION 'FAIL: customer A could not save / read its own entry';
    END IF;
    IF jsonb_array_length(public.portal_dashboard() -> 'licences') <> 1 THEN
      RAISE EXCEPTION 'FAIL: dashboard shows another licence';
    END IF;
    BEGIN
      PERFORM public.portal_entries('00000000-0000-4000-8000-00000000bb01');
      RAISE EXCEPTION 'FAIL: customer A read the records of another client';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
      PERFORM public.portal_entry_save('00000000-0000-4000-8000-00000000bb01', NULL, current_date, 'X', '{}', NULL);
      RAISE EXCEPTION 'FAIL: customer A wrote into another client''s records';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
      PERFORM public.portal_section('00000000-0000-4000-8000-00000000bb01');
      RAISE EXCEPTION 'FAIL: customer A opened another client''s section';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    RAISE NOTICE 'PASS: records are separated per customer (own entry saved, other client blocked)';
  END IF;

  IF public.app_module_level('/') <> 'none' OR public.app_can_view('/bis/projects') THEN
    RAISE EXCEPTION 'FAIL: customer A has module access';
  END IF;
  RAISE NOTICE 'PASS: customer A has no module access';

  BEGIN
    UPDATE public.user_profiles SET role = 'admin' WHERE id = r.user_a;
    IF FOUND THEN RAISE EXCEPTION 'FAIL: customer A changed own role'; END IF;
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN
    IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO public.clients (company_name) VALUES ('portal-test-should-fail');
    RAISE EXCEPTION 'FAIL: customer A inserted a client';
  EXCEPTION WHEN insufficient_privilege OR not_null_violation OR check_violation THEN
    NULL;
  END;
  BEGIN
    INSERT INTO public.portal_licence_access (user_id, project_id) VALUES (r.user_a, r.project_b);
    RAISE EXCEPTION 'FAIL: customer A gave itself a licence';
  EXCEPTION WHEN insufficient_privilege OR invalid_parameter_value THEN
    NULL;
  END;
  RAISE NOTICE 'PASS: customer A cannot write';
END $$;

RESET ROLE;
ROLLBACK;
\echo 'portal isolation test: ALL PASS'
