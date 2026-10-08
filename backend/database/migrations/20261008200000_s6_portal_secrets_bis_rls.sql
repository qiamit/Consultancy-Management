-- S6: Manak portal passwords encrypted at rest (+ reveal/login RPCs with access log),
--     BIS tables + bis-project-files bucket under module-level RLS, BIS audit triggers,
--     audit_log secret stripping by name pattern, audit history RPC, user role column (MST-03),
--     server-side client search RPC + trigram indexes, live-schema reconciliation
--     (bis_projects.is_qe_managed / application_stage, bis_renewal_applications).
-- Idempotent: safe to run twice. Runs as the migration superuser (supabase_admin), in one transaction
-- (backend/scripts/apply-migrations.mjs). If the password backfill check fails, the whole file rolls back.
-- Key custody: the encryption key is generated INSIDE the DB (private.app_keys, schema not exposed by
-- PostgREST, no grants to anon/authenticated/service_role). Supabase Vault is NOT used: its root key
-- file (/etc/postgresql-custom/pgsodium_root.key) is not on the Railway volume and would be lost on a
-- Postgres redeploy. No Railway variable is needed.
-- Does NOT touch finance_* / quotation* / transactions.

-- Live-safety: this file takes ACCESS EXCLUSIVE locks (user_profiles, bis_*, storage.objects policies).
-- Run it when nobody is using the app. Fail fast instead of queueing behind app traffic (a queued
-- lock blocks every later reader and exhausts the PostgREST pool). Measured apply time ~1.4 s.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- =====================================================================
-- 0) Extensions
-- =====================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- =====================================================================
-- 1) Reconciliation: live-only objects that no repo migration creates (MST-01 / G13).
--    All no-ops on the live DB; they make a fresh DB match production.
-- =====================================================================
ALTER TABLE public.bis_projects
  ADD COLUMN IF NOT EXISTS is_qe_managed     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS application_stage text    NOT NULL DEFAULT 'Under Preparation';
CREATE INDEX IF NOT EXISTS bis_projects_is_qe_managed_true_idx ON public.bis_projects (is_qe_managed) WHERE is_qe_managed = true;

CREATE TABLE IF NOT EXISTS public.bis_renewal_applications (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id             uuid NOT NULL REFERENCES public.bis_projects(id) ON DELETE CASCADE,
  client_id              uuid REFERENCES public.clients(id) ON DELETE RESTRICT,
  application_date       date,
  submission_mode        text,
  acknowledgment_number  text,
  bis_office             text,
  bis_desk_officer       text,
  marking_fee_rate       numeric,
  marking_fee_quantity   numeric,
  marking_fee_total      numeric,
  fee_challan_number     text,
  fee_payment_date       date,
  fee_payment_mode       text,
  test_report_number     text,
  test_report_date       date,
  test_lab_name          text,
  test_lab_nabl_no       text,
  test_result            text,
  inspection_notice_date date,
  inspection_date        date,
  bis_inspector_name     text,
  inspection_result      text,
  renewal_granted_date   date,
  new_validity_from      date,
  new_validity_to        date,
  renewal_status         text NOT NULL DEFAULT 'Initiated',
  notes                  text,
  created_by             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bis_renewal_applications_project_id_idx ON public.bis_renewal_applications (project_id);
ALTER TABLE public.bis_renewal_applications ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- 2) User role (MST-03): admin | staff | viewer. Designation-based admin keeps working.
--    viewer = can never edit (module level capped at 'view').
-- =====================================================================
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'staff';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_profiles_role_check'
                   AND conrelid = 'public.user_profiles'::regclass) THEN
    ALTER TABLE public.user_profiles ADD CONSTRAINT user_profiles_role_check CHECK (role IN ('admin', 'staff', 'viewer'));
  END IF;
END $$;
COMMENT ON COLUMN public.user_profiles.role IS 'S6: admin | staff | viewer. Only admins can change it (set_user_role / guard trigger). viewer = read-only everywhere.';

UPDATE public.user_profiles
   SET role = 'admin'
 WHERE role = 'staff'
   AND lower(trim(COALESCE(designation, ''))) IN
       ('laboratory director', 'admin', 'administrator', 'director', 'super admin', 'managing director');

CREATE OR REPLACE FUNCTION public.app_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.user_profiles
     WHERE id = auth.uid()
       AND lower(trim(COALESCE(status, 'Active'))) = 'active'
       AND (role = 'admin'
            OR lower(trim(COALESCE(designation, ''))) IN
               ('laboratory director', 'admin', 'administrator', 'director', 'super admin', 'managing director'))
  );
$$;

-- Same resolution as S4 (mirrors resolveModuleAccess.ts), plus: role 'viewer' never gets 'edit'.
CREATE OR REPLACE FUNCTION public.app_module_level(p_path text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_path  text := COALESCE(NULLIF(rtrim(trim(COALESCE(p_path, '')), '/'), ''), '/');
  v_des   text;
  v_dep   text;
  v_div   text;
  v_st    text;
  v_role  text;
  v_type  text;
  v_key   text;
  v_level text;
  v_out   text := 'edit';
BEGIN
  IF v_uid IS NULL THEN
    RETURN 'none';
  END IF;
  IF public.app_is_admin() THEN
    RETURN 'edit';
  END IF;

  SELECT lower(trim(COALESCE(designation, ''))), lower(trim(COALESCE(department_name, ''))),
         lower(trim(COALESCE(division, ''))), lower(trim(COALESCE(status, 'Active'))), COALESCE(role, 'staff')
    INTO v_des, v_dep, v_div, v_st, v_role
    FROM public.user_profiles WHERE id = v_uid;
  IF NOT FOUND OR v_st <> 'active' THEN
    RETURN 'none';
  END IF;

  <<subjects>>
  FOREACH v_type IN ARRAY ARRAY['user', 'designation', 'department', 'division'] LOOP
    v_key := CASE v_type WHEN 'user' THEN v_uid::text WHEN 'designation' THEN v_des
                         WHEN 'department' THEN v_dep ELSE v_div END;
    CONTINUE WHEN v_key = '';
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM public.module_access_rules r
       WHERE r.subject_type = v_type
         AND CASE WHEN v_type = 'user' THEN trim(r.subject_key) = v_key
                  ELSE lower(trim(r.subject_key)) = v_key END);

    SELECT lower(trim(r.access_level)) INTO v_level
      FROM public.module_access_rules r
      CROSS JOIN LATERAL (SELECT COALESCE(NULLIF(rtrim(trim(r.module_key), '/'), ''), '/') AS k) n
     WHERE r.subject_type = v_type
       AND CASE WHEN v_type = 'user' THEN trim(r.subject_key) = v_key
                ELSE lower(trim(r.subject_key)) = v_key END
       AND CASE WHEN n.k = '/' THEN v_path = '/'
                ELSE v_path = n.k OR left(v_path, length(n.k) + 1) = n.k || '/' END
     ORDER BY length(n.k) DESC
     LIMIT 1;

    v_out := COALESCE(v_level, CASE WHEN v_path = '/' THEN 'view' ELSE 'none' END);
    EXIT subjects;
  END LOOP;

  IF v_role = 'viewer' AND v_out = 'edit' THEN
    RETURN 'view';
  END IF;
  RETURN v_out;
END;
$$;

CREATE OR REPLACE FUNCTION public.app_can_view(VARIADIC p_paths text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM unnest(p_paths) AS x(p) WHERE public.app_module_level(x.p) IN ('view', 'edit'));
$$;

-- Module keys of the BIS work screens (lib/appNav.ts). Knowledge search is not a data module.
CREATE OR REPLACE FUNCTION public.app_bis_paths()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT ARRAY['/bis/projects', '/bis/new-applications', '/bis/new-inclusion', '/bis/license-renewals',
               '/bis/stop-marking', '/bis/surveillance', '/bis/sample-failure-reply', '/bis/our-licenses',
               '/bis/expired-licenses', '/bis/due-soon']::text[];
$$;

-- Privileged-column guard (S1) now also protects role.
CREATE OR REPLACE FUNCTION public.user_profiles_guard_privileged()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL
     OR COALESCE(auth.role(), '') = 'service_role'
     OR public.app_is_admin()
  THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF COALESCE(trim(NEW.designation), '') <> '' OR COALESCE(NEW.role, 'staff') <> 'staff' THEN
      RAISE EXCEPTION 'Only an admin can change designation/status/department/role'
        USING ERRCODE = '42501';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.designation IS DISTINCT FROM OLD.designation
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.department_name IS DISTINCT FROM OLD.department_name
       OR NEW.division IS DISTINCT FROM OLD.division
       OR NEW.email IS DISTINCT FROM OLD.email
       OR NEW.role IS DISTINCT FROM OLD.role
    THEN
      RAISE EXCEPTION 'Only an admin can change designation/status/department/role'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_user_role(p_user_id uuid, p_role text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_role text := lower(trim(COALESCE(p_role, '')));
BEGIN
  IF auth.uid() IS NULL OR NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Only Laboratory Director/Admin can change roles.' USING ERRCODE = '42501';
  END IF;
  IF v_role NOT IN ('admin', 'staff', 'viewer') THEN
    RAISE EXCEPTION 'Role must be admin, staff or viewer' USING ERRCODE = '22023';
  END IF;
  IF p_user_id = auth.uid() AND v_role <> 'admin' THEN
    RAISE EXCEPTION 'You cannot remove your own admin role.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.user_profiles SET role = v_role, updated_at = now() WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_role;
END;
$$;

-- list_team_users: same output, but uses the single admin definition (role or designation).
CREATE OR REPLACE FUNCTION public.list_team_users()
RETURNS TABLE(id uuid, email text, full_name text, mobile text, designation text, department_name text, division text, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT p.id,
         COALESCE(NULLIF(p.email, ''), u.email, ''::text)::text,
         COALESCE(p.full_name, ''::text),
         COALESCE(p.mobile, ''::text),
         COALESCE(p.designation, ''::text),
         COALESCE(p.department_name, ''::text),
         COALESCE(p.division, ''::text),
         COALESCE(p.status, 'Active'::text)
    FROM public.user_profiles p
    LEFT JOIN auth.users u ON u.id = p.id
   ORDER BY p.full_name ASC NULLS LAST;
END;
$$;

-- =====================================================================
-- 3) Audit log: strip anything that looks like a secret, by column-name pattern
--    (portal_password, password, *_token, *api_key, *secret, secret_enc …).
-- =====================================================================
CREATE OR REPLACE FUNCTION public.audit_strip_secrets(p jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
    FROM jsonb_each(p) e
   WHERE e.key !~* '(^|_)(password|passwd|pwd|secret|secret_enc|api_key|apikey|token|access_token|refresh_token|private_key|key_hex)$'
     AND e.key NOT IN ('encrypted_password', 'password_hash');
$$;

CREATE OR REPLACE FUNCTION public.audit_row_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
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

  IF TG_OP IN ('UPDATE', 'DELETE') THEN v_old := public.audit_strip_secrets(to_jsonb(OLD)); END IF;
  IF TG_OP IN ('UPDATE', 'INSERT') THEN v_new := public.audit_strip_secrets(to_jsonb(NEW)); END IF;
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

-- Scrub any secret-looking keys already stored (expected 0 rows).
UPDATE public.audit_log
   SET old_data = public.audit_strip_secrets(old_data),
       new_data = public.audit_strip_secrets(new_data)
 WHERE (old_data IS NOT NULL AND old_data <> public.audit_strip_secrets(old_data))
    OR (new_data IS NOT NULL AND new_data <> public.audit_strip_secrets(new_data));

-- Admin-only history for one record (used by the History dialog and by AI/MCP).
CREATE OR REPLACE FUNCTION public.get_audit_history(p_table text, p_row_id text, p_limit integer DEFAULT 50)
RETURNS TABLE (id bigint, action text, changed_at timestamptz, changed_by uuid, changed_by_name text,
               changed_via text, old_data jsonb, new_data jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Only Laboratory Director/Admin can view change history.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT a.id, a.action, a.changed_at, a.changed_by,
         COALESCE(NULLIF(trim(up.full_name), ''), CASE WHEN a.changed_by IS NULL THEN 'System / migration' ELSE 'Unknown user' END),
         a.changed_via,
         public.audit_strip_secrets(a.old_data),
         public.audit_strip_secrets(a.new_data)
    FROM public.audit_log a
    LEFT JOIN public.user_profiles up ON up.id = a.changed_by
   WHERE a.table_name = p_table
     AND a.row_id = p_row_id
   ORDER BY a.changed_at DESC, a.id DESC
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
END;
$$;

-- =====================================================================
-- 4) Portal password encryption (MST-07 reversed by Amit for S6).
--    private.app_keys holds a random 256-bit key; private.bis_portal_secrets holds pgp_sym_encrypt
--    (AES-256) ciphertext per BIS project. Neither is reachable through PostgREST.
-- =====================================================================
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role', 'authenticator'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA private FROM %I', r);
    END IF;
  END LOOP;
END $$;
COMMENT ON SCHEMA private IS 'S6: not exposed by PostgREST. Keys and encrypted secrets. Read only through SECURITY DEFINER functions.';

CREATE TABLE IF NOT EXISTS private.app_keys (
  name       text PRIMARY KEY,
  key_hex    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON private.app_keys FROM PUBLIC;
INSERT INTO private.app_keys (name, key_hex)
VALUES ('portal_v1', encode(extensions.gen_random_bytes(32), 'hex'))
ON CONFLICT (name) DO NOTHING;

CREATE OR REPLACE FUNCTION private.portal_key()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = private, pg_temp
AS $$
  SELECT key_hex FROM private.app_keys WHERE name = 'portal_v1';
$$;
REVOKE ALL ON FUNCTION private.portal_key() FROM PUBLIC;

CREATE TABLE IF NOT EXISTS private.bis_portal_secrets (
  project_id uuid PRIMARY KEY REFERENCES public.bis_projects(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  secret_enc bytea NOT NULL,
  key_name   text NOT NULL DEFAULT 'portal_v1',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
REVOKE ALL ON private.bis_portal_secrets FROM PUBLIC;

ALTER TABLE public.bis_projects ADD COLUMN IF NOT EXISTS portal_password_set boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.bis_projects.portal_password_set IS 'S6: true when an encrypted Manak password exists (private.bis_portal_secrets). The password itself is never in this table.';

-- Access log: who set / cleared / revealed / used a password for login. Never the value.
CREATE TABLE IF NOT EXISTS public.portal_secret_access_log (
  id         bigserial PRIMARY KEY,
  project_id uuid,
  action     text NOT NULL CHECK (action IN ('set', 'clear', 'reveal', 'extension_login', 'migrate')),
  user_id    uuid,
  via        text,
  at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS portal_secret_access_log_user_at_idx ON public.portal_secret_access_log (user_id, at DESC);
CREATE INDEX IF NOT EXISTS portal_secret_access_log_project_idx ON public.portal_secret_access_log (project_id, at DESC);
ALTER TABLE public.portal_secret_access_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS portal_secret_access_log_select_admin ON public.portal_secret_access_log;
CREATE POLICY portal_secret_access_log_select_admin ON public.portal_secret_access_log
  FOR SELECT TO authenticated USING ((SELECT public.app_is_admin()));
REVOKE ALL ON public.portal_secret_access_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.portal_secret_access_log TO authenticated;
REVOKE ALL ON SEQUENCE public.portal_secret_access_log_id_seq FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.portal_secret_access_log IS 'S6: Manak password set/clear/reveal/login events (no values). Admin-readable; written only by S6 functions.';

-- Backward-compatible write path: anything written to bis_projects.portal_password (old frontend,
-- imports, AI tools) is encrypted into private.bis_portal_secrets and the column is set back to NULL.
-- NULL / unchanged = keep the stored password.
CREATE OR REPLACE FUNCTION public.bis_projects_portal_password_shim()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.portal_password IS NOT NULL THEN
    IF NEW.portal_password <> '' THEN
      INSERT INTO private.bis_portal_secrets (project_id, secret_enc, updated_by)
      VALUES (NEW.id, extensions.pgp_sym_encrypt(NEW.portal_password, private.portal_key(), 'cipher-algo=aes256'), auth.uid())
      ON CONFLICT (project_id) DO UPDATE
        SET secret_enc = EXCLUDED.secret_enc, key_name = 'portal_v1', updated_at = now(), updated_by = EXCLUDED.updated_by;
      NEW.portal_password_set := true;
      INSERT INTO public.portal_secret_access_log (project_id, action, user_id, via)
      VALUES (NEW.id, 'set', auth.uid(), 'portal_password column');
    END IF;
    NEW.portal_password := NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.bis_projects_portal_password_shim() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS bis_projects_portal_password_shim ON public.bis_projects;
CREATE TRIGGER bis_projects_portal_password_shim
  BEFORE INSERT OR UPDATE OF portal_password ON public.bis_projects
  FOR EACH ROW EXECUTE FUNCTION public.bis_projects_portal_password_shim();

-- Backfill: encrypt every plaintext password, verify EVERY row decrypts to the original, then null
-- the plaintext. Any mismatch aborts the whole migration (nothing is changed).
DO $$
DECLARE
  v_key    text := private.portal_key();
  v_before bigint;
  v_ok     bigint;
  v_left   bigint;
BEGIN
  IF v_key IS NULL OR length(v_key) <> 64 THEN
    RAISE EXCEPTION 'S6: portal key missing';
  END IF;

  SELECT count(*) INTO v_before FROM public.bis_projects WHERE COALESCE(portal_password, '') <> '';

  INSERT INTO private.bis_portal_secrets (project_id, secret_enc)
  SELECT b.id, extensions.pgp_sym_encrypt(b.portal_password, v_key, 'cipher-algo=aes256')
    FROM public.bis_projects b
   WHERE COALESCE(b.portal_password, '') <> ''
  ON CONFLICT (project_id) DO UPDATE SET secret_enc = EXCLUDED.secret_enc, key_name = 'portal_v1', updated_at = now();

  SELECT count(*) INTO v_ok
    FROM public.bis_projects b
    JOIN private.bis_portal_secrets s ON s.project_id = b.id
   WHERE COALESCE(b.portal_password, '') <> ''
     AND extensions.pgp_sym_decrypt(s.secret_enc, v_key) = b.portal_password;

  IF v_ok <> v_before THEN
    RAISE EXCEPTION 'S6: portal password backfill check failed: % of % rows verified. Nothing changed.', v_ok, v_before;
  END IF;

  INSERT INTO public.portal_secret_access_log (project_id, action, via)
  SELECT b.id, 'migrate', 'S6 migration'
    FROM public.bis_projects b
   WHERE COALESCE(b.portal_password, '') <> '';

  UPDATE public.bis_projects
     SET portal_password_set = true
   WHERE COALESCE(portal_password, '') <> '' AND NOT portal_password_set;
  UPDATE public.bis_projects SET portal_password = NULL WHERE portal_password IS NOT NULL;

  SELECT count(*) INTO v_left FROM public.bis_projects WHERE portal_password IS NOT NULL;
  IF v_left <> 0 THEN
    RAISE EXCEPTION 'S6: % plaintext portal passwords left after backfill', v_left;
  END IF;
  -- Flags must match the secrets table exactly.
  IF EXISTS (SELECT 1 FROM public.bis_projects b
              WHERE b.portal_password_set <> EXISTS (SELECT 1 FROM private.bis_portal_secrets s WHERE s.project_id = b.id)) THEN
    RAISE EXCEPTION 'S6: portal_password_set flags do not match encrypted secrets';
  END IF;
  RAISE NOTICE 'S6: % portal passwords encrypted and verified', v_before;

  IF to_regclass('public.bis_new_applications') IS NOT NULL THEN
    UPDATE public.bis_new_applications SET portal_password = NULL WHERE portal_password IS NOT NULL;
  END IF;
END $$;

-- The plaintext columns can never hold a value again (defence in depth; the shim runs first).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bis_projects_portal_password_always_null') THEN
    ALTER TABLE public.bis_projects ADD CONSTRAINT bis_projects_portal_password_always_null CHECK (portal_password IS NULL) NOT VALID;
    ALTER TABLE public.bis_projects VALIDATE CONSTRAINT bis_projects_portal_password_always_null;
  END IF;
  IF to_regclass('public.bis_new_applications') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bis_new_applications_portal_password_always_null') THEN
    ALTER TABLE public.bis_new_applications ADD CONSTRAINT bis_new_applications_portal_password_always_null CHECK (portal_password IS NULL) NOT VALID;
    ALTER TABLE public.bis_new_applications VALIDATE CONSTRAINT bis_new_applications_portal_password_always_null;
  END IF;
END $$;
COMMENT ON COLUMN public.bis_projects.portal_password IS 'DEPRECATED (S6): always NULL. Writes are encrypted into private.bis_portal_secrets by trigger. Drop in a later session.';

-- Set / clear (BIS editors). Empty or NULL clears.
CREATE OR REPLACE FUNCTION public.bis_portal_secret_set(p_project_id uuid, p_password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.app_can_edit(VARIADIC public.app_bis_paths()) THEN
    RAISE EXCEPTION 'You do not have edit access to BIS projects.' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.bis_projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BIS project not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_password IS NULL OR p_password = '' THEN
    DELETE FROM private.bis_portal_secrets WHERE project_id = p_project_id;
    UPDATE public.bis_projects SET portal_password_set = false WHERE id = p_project_id AND portal_password_set;
    INSERT INTO public.portal_secret_access_log (project_id, action, user_id, via)
    VALUES (p_project_id, 'clear', auth.uid(), 'bis_portal_secret_set');
    RETURN false;
  END IF;

  IF length(p_password) > 200 THEN
    RAISE EXCEPTION 'Password is too long (max 200 characters).' USING ERRCODE = '22023';
  END IF;

  INSERT INTO private.bis_portal_secrets (project_id, secret_enc, updated_by)
  VALUES (p_project_id, extensions.pgp_sym_encrypt(p_password, private.portal_key(), 'cipher-algo=aes256'), auth.uid())
  ON CONFLICT (project_id) DO UPDATE
    SET secret_enc = EXCLUDED.secret_enc, key_name = 'portal_v1', updated_at = now(), updated_by = EXCLUDED.updated_by;
  UPDATE public.bis_projects SET portal_password_set = true WHERE id = p_project_id AND NOT portal_password_set;
  INSERT INTO public.portal_secret_access_log (project_id, action, user_id, via)
  VALUES (p_project_id, 'set', auth.uid(), 'bis_portal_secret_set');
  RETURN true;
END;
$$;

-- Get one password, for ONE project, logged.
--   p_purpose 'reveal'          → admins only (show on screen)
--   p_purpose 'extension_login' → BIS editors (handed straight to the QE extension for Manak login)
-- Rate limit: 30 requests per user per 10 minutes.
CREATE OR REPLACE FUNCTION public.bis_portal_secret_get(p_project_id uuid, p_purpose text DEFAULT 'extension_login')
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
  IF v_purpose = 'extension_login' AND NOT public.app_can_edit(VARIADIC public.app_bis_paths()) THEN
    RAISE EXCEPTION 'You do not have edit access to BIS projects.' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_recent
    FROM public.portal_secret_access_log
   WHERE user_id = auth.uid() AND action IN ('reveal', 'extension_login') AND at > now() - interval '10 minutes';
  IF v_recent >= 30 THEN
    RAISE EXCEPTION 'Too many password requests. Try again in a few minutes.' USING ERRCODE = '54000';
  END IF;

  SELECT s.secret_enc INTO v_enc FROM private.bis_portal_secrets s WHERE s.project_id = p_project_id;
  IF v_enc IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.portal_secret_access_log (project_id, action, user_id, via)
  VALUES (p_project_id, v_purpose, auth.uid(), 'bis_portal_secret_get');
  RETURN extensions.pgp_sym_decrypt(v_enc, private.portal_key());
END;
$$;

-- =====================================================================
-- 5) BIS tables: module-level RLS (same pattern as S4 masters).
--    SELECT: anyone with view/edit on any BIS screen. Writes: editors of the owning screen.
--    bis_projects DELETE: admin only (the UI shows Delete only to Laboratory Director).
-- =====================================================================
DO $$
DECLARE
  bv  text := '(SELECT public.app_can_view(VARIADIC public.app_bis_paths()))';
  be  text := '(SELECT public.app_can_edit(VARIADIC public.app_bis_paths()))';
  ren text := '(SELECT public.app_can_edit(''/bis/license-renewals''))';
  sfr text := '(SELECT public.app_can_edit(''/bis/sample-failure-reply''))';
  sur text := '(SELECT public.app_can_edit(''/bis/surveillance''))';
  adm text := '(SELECT public.app_is_admin())';
  spec jsonb;
  t text;
  p record;
BEGIN
  -- table => [select, insert, update, delete]
  spec := jsonb_build_object(
    'bis_projects',               jsonb_build_array(bv, be, be, adm),
    'bis_project_files',          jsonb_build_array(bv, be, be, be),
    'bis_project_module_data',    jsonb_build_array(bv, be, be, be),
    'bis_renewal_applications',   jsonb_build_array(bv, ren, ren, ren),
    'bis_sample_failure_replies', jsonb_build_array(bv, sfr, sfr, sfr),
    'license_surveillance',       jsonb_build_array(bv, sur, sur, sur),
    'bis_new_applications',       jsonb_build_array(bv, adm, adm, adm)
  );
  FOR t IN SELECT jsonb_object_keys(spec) LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'S6: table public.% missing, skipped', t;
      CONTINUE;
    END IF;
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (%s)', t || '_select', t, spec->t->>0);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)', t || '_insert', t, spec->t->>1);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)', t || '_update', t, spec->t->>2, spec->t->>2);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (%s)', t || '_delete', t, spec->t->>3);
  END LOOP;
END $$;

-- Storage bucket bis-project-files: read = BIS viewers, write = BIS editors.
DO $$
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE 'S6: storage.objects missing, skipped';
    RETURN;
  END IF;
  EXECUTE 'DROP POLICY IF EXISTS bis_project_files_storage_select ON storage.objects';
  EXECUTE 'CREATE POLICY bis_project_files_storage_select ON storage.objects FOR SELECT TO authenticated USING (bucket_id = ''bis-project-files'' AND (SELECT public.app_can_view(VARIADIC public.app_bis_paths())))';
  EXECUTE 'DROP POLICY IF EXISTS bis_project_files_storage_insert ON storage.objects';
  EXECUTE 'CREATE POLICY bis_project_files_storage_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = ''bis-project-files'' AND (SELECT public.app_can_edit(VARIADIC public.app_bis_paths())))';
  EXECUTE 'DROP POLICY IF EXISTS bis_project_files_storage_update ON storage.objects';
  EXECUTE 'CREATE POLICY bis_project_files_storage_update ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = ''bis-project-files'' AND (SELECT public.app_can_edit(VARIADIC public.app_bis_paths()))) WITH CHECK (bucket_id = ''bis-project-files'' AND (SELECT public.app_can_edit(VARIADIC public.app_bis_paths())))';
  EXECUTE 'DROP POLICY IF EXISTS bis_project_files_storage_delete ON storage.objects';
  EXECUTE 'CREATE POLICY bis_project_files_storage_delete ON storage.objects FOR DELETE TO authenticated USING (bucket_id = ''bis-project-files'' AND (SELECT public.app_can_edit(VARIADIC public.app_bis_paths())))';
END $$;

-- BIS change history (added after the backfill so the migration itself is not logged 257 times).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['bis_projects', 'bis_renewal_applications', 'bis_sample_failure_replies',
                           'license_surveillance', 'bis_project_files', 'bis_project_module_data'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('DROP TRIGGER IF EXISTS zz_audit_row_change ON public.%I', t);
    EXECUTE format('CREATE TRIGGER zz_audit_row_change AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_row_change()', t);
  END LOOP;
END $$;

-- =====================================================================
-- 6) Server-side client search (pickers now; Client Directory in S6b) + trigram indexes.
--    SECURITY INVOKER: the caller's RLS applies. Archived clients hidden unless asked for.
-- =====================================================================
CREATE INDEX IF NOT EXISTS clients_company_name_trgm_idx ON public.clients USING gin (company_name extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS clients_gst_number_trgm_idx   ON public.clients USING gin (gst_number extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS clients_contact_trgm_idx      ON public.clients USING gin (contact_person_name extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS clients_mobile_trgm_idx       ON public.clients USING gin (mobile extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS clients_city_trgm_idx         ON public.clients USING gin (city extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS is_codes_is_number_trgm_idx   ON public.is_codes USING gin (is_number extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS is_codes_title_trgm_idx       ON public.is_codes USING gin (title extensions.gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.search_clients(
  p_search           text    DEFAULT '',
  p_limit            integer DEFAULT 30,
  p_offset           integer DEFAULT 0,
  p_include_archived boolean DEFAULT false,
  p_company_type     text    DEFAULT NULL
)
RETURNS TABLE (
  id uuid, company_name text, gst_number text, company_type text, company_scale text,
  contact_person_name text, email text, country_code text, mobile text, address text,
  district text, city text, state text, pin_code text, country text,
  opening_balance numeric, balance_type text, archived_at timestamptz, total_count bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH q AS (
    SELECT trim(COALESCE(p_search, '')) AS raw,
           '%' || replace(replace(replace(trim(COALESCE(p_search, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%' AS pat
  )
  SELECT c.id, c.company_name, c.gst_number, c.company_type, c.company_scale,
         c.contact_person_name, c.email, c.country_code, c.mobile, c.address,
         c.district, c.city, c.state, c.pin_code, c.country,
         c.opening_balance, c.balance_type, c.archived_at,
         count(*) OVER () AS total_count
    FROM public.clients c, q
   WHERE (p_include_archived OR c.archived_at IS NULL)
     AND (p_company_type IS NULL OR c.company_type = p_company_type)
     AND (q.raw = ''
          OR c.company_name ILIKE q.pat
          OR c.gst_number ILIKE q.pat
          OR c.contact_person_name ILIKE q.pat
          OR c.mobile ILIKE q.pat
          OR c.city ILIKE q.pat)
   ORDER BY (lower(c.company_name) = lower(q.raw)) DESC,
            (c.company_name ILIKE replace(replace(replace(q.raw, '\', '\\'), '%', '\%'), '_', '\_') || '%') DESC,
            c.company_name ASC, c.id ASC
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 30), 1), 200)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

-- =====================================================================
-- 7) Function privileges (S5 rule: every new function revokes PUBLIC/anon)
-- =====================================================================
DO $$
DECLARE f text;
BEGIN
  -- callable by logged-in users (each checks permissions inside, or is RLS-bound)
  FOREACH f IN ARRAY ARRAY['public.app_is_admin()', 'public.app_module_level(text)', 'public.app_can_view(text[])',
                           'public.app_bis_paths()', 'public.set_user_role(uuid,text)', 'public.list_team_users()',
                           'public.get_audit_history(text,text,integer)', 'public.bis_portal_secret_set(uuid,text)',
                           'public.bis_portal_secret_get(uuid,text)', 'public.search_clients(text,integer,integer,boolean,text)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
  -- internal only
  FOREACH f IN ARRAY ARRAY['public.audit_strip_secrets(jsonb)', 'public.audit_row_change()',
                           'public.user_profiles_guard_privileged()', 'public.bis_projects_portal_password_shim()'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- =====================================================================
-- MANUAL TEST (psql/db-run.mjs against POSTGRES_URL; everything is rolled back)
-- <IE_UID> = non-admin with BIS edit, <ADMIN_UID> = admin, <P> = a bis_projects id with portal_password_set
-- =====================================================================
-- BEGIN;
--   SELECT count(*) FROM public.bis_projects WHERE portal_password IS NOT NULL;            -- expect 0
--   SELECT count(*) FROM public.bis_projects WHERE portal_password_set;                    -- expect 257
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims', '{"sub":"<IE_UID>","role":"authenticated"}', true);
--   SAVEPOINT a; SELECT count(*) FROM private.bis_portal_secrets;                          -- expect permission denied
--   ROLLBACK TO SAVEPOINT a;
--   SAVEPOINT b; SELECT public.bis_portal_secret_get('<P>', 'reveal');                     -- expect Only Laboratory Director/Admin
--   ROLLBACK TO SAVEPOINT b;
--   SELECT public.bis_portal_secret_get('<P>', 'extension_login') IS NOT NULL;             -- expect true (logged)
--   SAVEPOINT c; SELECT * FROM public.get_audit_history('clients', '<any id>');            -- expect Only Laboratory Director/Admin
--   ROLLBACK TO SAVEPOINT c;
--   SELECT count(*) FROM public.search_clients('steel', 10);                               -- expect <= 10 rows
--   SELECT set_config('request.jwt.claims', '{"sub":"<ADMIN_UID>","role":"authenticated"}', true);
--   SELECT action, user_id FROM public.portal_secret_access_log ORDER BY id DESC LIMIT 3;   -- expect extension_login by IE
--   RESET ROLE;
-- ROLLBACK;
