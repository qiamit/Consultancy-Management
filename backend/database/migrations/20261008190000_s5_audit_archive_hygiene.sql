-- S5: audit log, archive (soft delete) + safe permanent delete for masters,
--     FK safety for BIS children, anon/default-privilege hygiene, legacy role cleanup.
-- Idempotent: safe to run twice. Runs as the migration superuser (supabase_admin).
-- Does NOT touch finance_* / quotation* / transactions (Finance F1) or the BIS policies.

-- =====================================================================
-- 1) Audit log (who changed what, when) — admin-readable, written only by trigger
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.audit_log (
  id          bigserial PRIMARY KEY,
  table_name  text        NOT NULL,
  row_id      text,
  action      text        NOT NULL CHECK (action IN ('I', 'U', 'D')),
  changed_by  uuid,
  changed_via text,
  changed_at  timestamptz NOT NULL DEFAULT now(),
  old_data    jsonb,
  new_data    jsonb
);
CREATE INDEX IF NOT EXISTS audit_log_table_row_idx ON public.audit_log (table_name, row_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_changed_at_idx ON public.audit_log (changed_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_changed_by_idx ON public.audit_log (changed_by, changed_at DESC);
COMMENT ON TABLE public.audit_log IS 'S5: row-level change history for masters/settings/users. Written only by public.audit_row_change(); readable by admins only.';

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'audit_log' LOOP
    EXECUTE format('DROP POLICY %I ON public.audit_log', p.policyname);
  END LOOP;
END $$;
CREATE POLICY audit_log_select_admin ON public.audit_log FOR SELECT TO authenticated USING ((SELECT public.app_is_admin()));
REVOKE ALL ON public.audit_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
REVOKE ALL ON SEQUENCE public.audit_log_id_seq FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.audit_row_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_strip  text[] := ARRAY['api_key', 'portal_password', 'password', 'secret_enc', 'encrypted_password'];
  v_ignore text[] := ARRAY['updated_at', 'updated_by'];
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

  IF TG_OP IN ('UPDATE', 'DELETE') THEN v_old := to_jsonb(OLD) - v_strip; END IF;
  IF TG_OP IN ('UPDATE', 'INSERT') THEN v_new := to_jsonb(NEW) - v_strip; END IF;
  v_id := COALESCE(v_new ->> 'id', v_old ->> 'id');

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
  END IF;

  INSERT INTO public.audit_log (table_name, row_id, action, changed_by, changed_via, old_data, new_data)
  VALUES (TG_TABLE_NAME, v_id, left(TG_OP, 1), v_uid, v_via, v_old, v_new);
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.audit_row_change() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['clients', 'is_codes', 'is_code_files', 'test_parameters', 'products_services_master',
                           'lab_settings', 'lab_letterheads', 'lab_prefixes', 'company_settings',
                           'module_access_rules', 'user_profiles'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'S5: table public.% missing, audit trigger skipped', t;
      CONTINUE;
    END IF;
    EXECUTE format('DROP TRIGGER IF EXISTS zz_audit_row_change ON public.%I', t);
    EXECUTE format('CREATE TRIGGER zz_audit_row_change AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_row_change()', t);
  END LOOP;
END $$;

-- =====================================================================
-- 2) Archive (soft delete) + who-changed columns on the 4 masters
--    archived_at IS NULL = active. archived_by / updated_by / created_by are set by trigger.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.master_row_stamp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE v_uid uuid;
BEGIN
  BEGIN
    v_uid := auth.uid();
  EXCEPTION WHEN others THEN
    v_uid := NULL;
  END;
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, v_uid);
    IF NEW.archived_at IS NOT NULL THEN
      NEW.archived_by := COALESCE(NEW.archived_by, v_uid);
    END IF;
    RETURN NEW;
  END IF;
  NEW.updated_at := now();
  NEW.updated_by := COALESCE(v_uid, NEW.updated_by);
  IF NEW.archived_at IS DISTINCT FROM OLD.archived_at THEN
    NEW.archived_by := CASE WHEN NEW.archived_at IS NULL THEN NULL ELSE v_uid END;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.master_row_stamp() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['clients', 'is_codes', 'test_parameters', 'products_services_master'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'S5: table public.% missing, archive columns skipped', t;
      CONTINUE;
    END IF;
    EXECUTE format('ALTER TABLE public.%I
                      ADD COLUMN IF NOT EXISTS created_by  uuid,
                      ADD COLUMN IF NOT EXISTS updated_at  timestamptz DEFAULT now(),
                      ADD COLUMN IF NOT EXISTS updated_by  uuid,
                      ADD COLUMN IF NOT EXISTS archived_at timestamptz,
                      ADD COLUMN IF NOT EXISTS archived_by uuid', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (archived_at) WHERE archived_at IS NOT NULL', t || '_archived_at_idx', t);
    EXECUTE format('DROP TRIGGER IF EXISTS master_row_stamp ON public.%I', t);
    EXECUTE format('CREATE TRIGGER master_row_stamp BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.master_row_stamp()', t);
    EXECUTE format('COMMENT ON COLUMN public.%I.archived_at IS %L', t, 'S5: NULL = active; set = archived (hidden from lists, restorable).');
  END LOOP;
END $$;

-- =====================================================================
-- 3) FK safety: a client / IS code that BIS records point to can no longer be
--    deleted silently (CASCADE wiped surveillance/SFR rows; SET NULL orphaned licences).
--    Finance/quotation/legacy FKs are left for F1; delete_master_rows() refuses them anyway.
-- =====================================================================
DO $$
DECLARE
  s   text[];
  pairs text[][] := ARRAY[
    ARRAY['license_surveillance',       'client_id',  'clients'],
    ARRAY['bis_sample_failure_replies', 'client_id',  'clients'],
    ARRAY['bis_projects',               'client_id',  'clients'],
    ARRAY['bis_projects',               'is_code_id', 'is_codes'],
    ARRAY['bis_new_applications',       'client_id',  'clients'],
    ARRAY['bis_new_applications',       'is_code_id', 'is_codes'],
    ARRAY['bis_renewal_applications',   'client_id',  'clients']
  ];
  v_con text;
BEGIN
  FOREACH s SLICE 1 IN ARRAY pairs LOOP
    IF to_regclass('public.' || s[1]) IS NULL OR to_regclass('public.' || s[3]) IS NULL THEN
      RAISE NOTICE 'S5: %.% skipped (table missing)', s[1], s[2];
      CONTINUE;
    END IF;
    SELECT c.conname INTO v_con
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
     WHERE c.contype = 'f'
       AND c.conrelid = ('public.' || s[1])::regclass
       AND c.confrelid = ('public.' || s[3])::regclass
       AND array_length(c.conkey, 1) = 1
       AND a.attname = s[2]
       AND c.confdeltype <> 'r'
     LIMIT 1;
    IF v_con IS NULL THEN
      CONTINUE;  -- already RESTRICT (or no FK): nothing to do
    END IF;
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', s[1], v_con);
    EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.%I(id) ON DELETE RESTRICT NOT VALID',
                   s[1], v_con, s[2], s[3]);
    EXECUTE format('ALTER TABLE public.%I VALIDATE CONSTRAINT %I', s[1], v_con);
    v_con := NULL;
  END LOOP;
END $$;

-- =====================================================================
-- 4) Reference counts + safe permanent delete (admin only)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.master_reference_counts(p_table text, p_ids uuid[])
RETURNS TABLE (row_id uuid, ref_table text, ref_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE c record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF p_table IS NULL OR p_table NOT IN ('clients', 'is_codes', 'test_parameters', 'products_services_master') THEN
    RAISE EXCEPTION 'Not a master table: %', p_table USING ERRCODE = '22023';
  END IF;
  FOR c IN
    SELECT con.conrelid::regclass::text AS child, a.attname AS col
      FROM pg_constraint con
      JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = con.conkey[1]
     WHERE con.contype = 'f'
       AND con.confrelid = ('public.' || p_table)::regclass
       AND array_length(con.conkey, 1) = 1
       AND NOT (p_table = 'is_codes' AND con.conrelid = 'public.is_code_files'::regclass)
  LOOP
    RETURN QUERY EXECUTE format(
      'SELECT %I::uuid, %L::text, count(*)::bigint FROM %s WHERE %I = ANY ($1) GROUP BY 1',
      c.col, c.child, c.child, c.col) USING p_ids;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_master_rows(p_table text, p_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_blocked jsonb;
  v_ok      uuid[];
  v_paths   text[];
  v_deleted uuid[];
BEGIN
  IF auth.uid() IS NULL OR NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Only Laboratory Director/Admin can permanently delete records.' USING ERRCODE = '42501';
  END IF;
  IF p_table IS NULL OR p_table NOT IN ('clients', 'is_codes', 'test_parameters', 'products_services_master') THEN
    RAISE EXCEPTION 'Not a master table: %', p_table USING ERRCODE = '22023';
  END IF;
  IF p_ids IS NULL OR cardinality(p_ids) = 0 THEN
    RETURN jsonb_build_object('deleted', '[]'::jsonb, 'blocked', '[]'::jsonb, 'storage_paths', '[]'::jsonb);
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', b.row_id, 'refs', b.refs)), '[]'::jsonb)
    INTO v_blocked
    FROM (SELECT r.row_id, jsonb_object_agg(r.ref_table, r.ref_count) AS refs
            FROM public.master_reference_counts(p_table, p_ids) r
           WHERE r.ref_count > 0
           GROUP BY r.row_id) b;

  SELECT array_agg(x) INTO v_ok
    FROM unnest(p_ids) AS x
   WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_blocked) e WHERE (e ->> 'id')::uuid = x);

  IF v_ok IS NOT NULL THEN
    IF p_table = 'is_codes' THEN
      SELECT array_agg(f.storage_path) INTO v_paths
        FROM public.is_code_files f
       WHERE f.is_code_id = ANY (v_ok) AND COALESCE(f.storage_path, '') <> '';
    END IF;
    EXECUTE format('WITH d AS (DELETE FROM public.%I WHERE id = ANY ($1) RETURNING id) SELECT array_agg(id) FROM d', p_table)
      INTO v_deleted USING v_ok;
  END IF;

  RETURN jsonb_build_object(
    'deleted',       COALESCE(to_jsonb(v_deleted), '[]'::jsonb),
    'blocked',       v_blocked,
    'storage_paths', COALESCE(to_jsonb(v_paths), '[]'::jsonb));
END;
$$;

-- =====================================================================
-- 5) Legacy role cleanup (MST-86): one admin definition everywhere
-- =====================================================================
CREATE OR REPLACE FUNCTION public.current_user_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.app_is_admin();
$$;
COMMENT ON FUNCTION public.current_user_is_admin() IS 'LEGACY alias (old Consultancy Pro). S5: now delegates to public.app_is_admin().';

-- Old Consultancy Pro tables (no code reads or writes them): read-only for staff, admin-only writes.
DO $$
DECLARE t text; p record;
BEGIN
  FOREACH t IN ARRAY ARRAY['app_dropdown_options', 'company_notes', 'company_scope_of_work', 'company_terms',
                           'iso_projects', 'project_documents', 'service_offerings', 'product_master_items'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK ((SELECT public.app_is_admin()))', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING ((SELECT public.app_is_admin())) WITH CHECK ((SELECT public.app_is_admin()))', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING ((SELECT public.app_is_admin()))', t || '_delete', t);
    EXECUTE format('COMMENT ON TABLE public.%I IS %L', t, 'LEGACY (old Consultancy Pro) — not used by the app. S5: admin-only writes.');
  END LOOP;
  IF to_regclass('public.profiles') IS NOT NULL THEN
    COMMENT ON TABLE public.profiles IS 'LEGACY (old Consultancy Pro) — the app uses public.user_profiles. Do not use.';
  END IF;
END $$;

-- =====================================================================
-- 6) Privilege hygiene (MST-06):
--    anon keeps ONLY the two public website RPCs. No table/sequence grants.
--    TRUNCATE/REFERENCES/TRIGGER (TRUNCATE bypasses RLS) removed from anon/authenticated.
--    Future objects created by supabase_admin/postgres in public no longer auto-grant anon.
-- =====================================================================
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM authenticated;

DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig, p.proname, p.prorettype = 'trigger'::regtype AS is_trigger
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.prokind IN ('f', 'p')
       AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  LOOP
    IF f.proname IN ('get_public_company_brand', 'get_public_website_content') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated, service_role', f.sig);
      CONTINUE;
    END IF;
    IF NOT f.is_trigger
       AND f.proname NOT IN ('user_profiles_sync_auth_ban', 'audit_row_change', 'master_row_stamp') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f.sig);
    END IF;
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f.sig);
  END LOOP;
END $$;

DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['supabase_admin', 'postgres'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      CONTINUE;
    END IF;
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON TABLES FROM anon', r);
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon', r);
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon', r);
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM authenticated', r);
  END LOOP;
END $$;
-- NOTE: PostgreSQL still grants EXECUTE on NEW functions to PUBLIC by default.
-- Every future SECURITY DEFINER function must end with:
--   REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon; GRANT EXECUTE ON FUNCTION ... TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- =====================================================================
-- MANUAL TEST (psql against POSTGRES_URL; everything is rolled back)
-- <IE_UID> = a non-admin user id, <ADMIN_UID> = an admin user id
-- =====================================================================
-- BEGIN;
--   SET LOCAL ROLE anon;
--   SAVEPOINT a; SELECT count(*) FROM public.clients;                 -- expect: permission denied
--   ROLLBACK TO SAVEPOINT a;
--   SELECT company_name FROM public.get_public_company_brand();        -- expect 1 row
--   RESET ROLE;
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims', '{"sub":"<IE_UID>","role":"authenticated"}', true);
--   UPDATE public.clients SET remark = 'S5 manual test'
--    WHERE id = (SELECT id FROM public.clients ORDER BY company_name LIMIT 1) RETURNING updated_by;  -- expect <IE_UID>
--   UPDATE public.clients SET archived_at = now()
--    WHERE id = (SELECT id FROM public.clients ORDER BY company_name LIMIT 1) RETURNING archived_by;  -- expect <IE_UID>
--   SELECT count(*) FROM public.audit_log;                              -- expect 0 (admin only)
--   SAVEPOINT b; SELECT public.delete_master_rows('clients', ARRAY[gen_random_uuid()]);  -- expect: Only Laboratory Director/Admin
--   ROLLBACK TO SAVEPOINT b;
--   SELECT set_config('request.jwt.claims', '{"sub":"<ADMIN_UID>","role":"authenticated"}', true);
--   SELECT action, changed_by, new_data FROM public.audit_log ORDER BY id DESC LIMIT 3;  -- expect the 2 updates above
--   SELECT public.delete_master_rows('clients',
--     ARRAY(SELECT client_id FROM public.bis_projects WHERE client_id IS NOT NULL LIMIT 1));  -- expect deleted [], blocked [{refs:{bis_projects:n}}]
--   RESET ROLE;
-- ROLLBACK;
