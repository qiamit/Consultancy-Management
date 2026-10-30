-- Customer Portal, Phase 1 (2026-10-30): licensees log in (invite only) and see only the licences the owner
-- assigns to them, read-only. Customers are competitors of each other, so:
--   * A new role 'customer'. A customer is locked out of EVERY table by a RESTRICTIVE policy, whatever the
--     permissive policies say (several tables are readable by any signed-in user, e.g. user_profiles, is_codes).
--     The only exception is reading their own user_profiles row (the app needs the role and name).
--   * app_module_level() returns 'none' for a customer, so no module RPC opens for them either.
--   * Customers read through the portal_* functions below only. They return the customer's own assigned
--     licences and a whitelist of columns (never billing, Manak password, case handling, internal people).
--   * Storage: a customer can read only files the owner marked "Show to Customer" on an assigned licence.
-- Tables added later must get the lockout too: public.app_apply_customer_lockout() (called at the end) adds it to
-- every public table that lacks it, and backend/database/tests/portal_isolation.sql fails when one is missing.
-- Idempotent. Apply with npm run db:migrate. Do not edit after it is applied.

SET LOCAL lock_timeout = '5s';

-- ── Role ─────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_role_check CHECK (role = ANY (ARRAY['admin', 'staff', 'viewer', 'customer']));

CREATE OR REPLACE FUNCTION public.app_is_customer()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  -- Whatever the account status: an inactive customer stays locked out too.
  SELECT EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'customer');
$$;
REVOKE ALL ON FUNCTION public.app_is_customer() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_is_customer() TO authenticated;

-- app_module_level: a customer gets no module at all (not even the '/' view every user has).
-- The live body is patched in place, so later changes to the rest of the function are kept.
DO $$
DECLARE
  v_def text := pg_get_functiondef('public.app_module_level(text)'::regprocedure);
  v_old text := E'  IF v_uid IS NULL THEN\n    RETURN ''none'';\n  END IF;';
  v_new text := E'  IF v_uid IS NULL OR public.app_is_customer() THEN\n    RETURN ''none'';\n  END IF;';
BEGIN
  IF position('public.app_is_customer()' IN v_def) > 0 THEN
    RETURN;
  END IF;
  IF position(v_old IN v_def) = 0 THEN
    RAISE EXCEPTION 'app_module_level: expected guard not found; customer lockout not applied';
  END IF;
  EXECUTE replace(v_def, v_old, v_new);
END $$;

-- master_reference_counts only checks "signed in"; customers must not use it either.
DO $$
DECLARE
  v_def text := pg_get_functiondef('public.master_reference_counts(text, uuid[])'::regprocedure);
  v_old text := 'IF auth.uid() IS NULL THEN';
  v_new text := 'IF auth.uid() IS NULL OR public.app_is_customer() THEN';
BEGIN
  IF position('public.app_is_customer()' IN v_def) > 0 THEN
    RETURN;
  END IF;
  IF position(v_old IN v_def) = 0 THEN
    RAISE EXCEPTION 'master_reference_counts: expected guard not found';
  END IF;
  EXECUTE replace(v_def, v_old, v_new);
END $$;

-- ── Lockout on every table ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.app_apply_customer_lockout()
RETURNS integer
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  t record;
  n integer := 0;
BEGIN
  FOR t IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace ns ON ns.oid = c.relnamespace
     WHERE ns.nspname = 'public' AND c.relkind IN ('r', 'p')
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);
    IF t.relname = 'user_profiles' THEN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t.relname
                       AND policyname = 'customer_lockout_read') THEN
        EXECUTE 'CREATE POLICY customer_lockout_read ON public.user_profiles AS RESTRICTIVE FOR SELECT TO authenticated
                   USING (NOT (SELECT public.app_is_customer()) OR id = auth.uid())';
        EXECUTE 'CREATE POLICY customer_lockout_insert ON public.user_profiles AS RESTRICTIVE FOR INSERT TO authenticated
                   WITH CHECK (NOT (SELECT public.app_is_customer()))';
        EXECUTE 'CREATE POLICY customer_lockout_update ON public.user_profiles AS RESTRICTIVE FOR UPDATE TO authenticated
                   USING (NOT (SELECT public.app_is_customer())) WITH CHECK (NOT (SELECT public.app_is_customer()))';
        EXECUTE 'CREATE POLICY customer_lockout_delete ON public.user_profiles AS RESTRICTIVE FOR DELETE TO authenticated
                   USING (NOT (SELECT public.app_is_customer()))';
        n := n + 1;
      END IF;
    ELSIF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t.relname
                        AND policyname = 'customer_lockout') THEN
      EXECUTE format(
        'CREATE POLICY customer_lockout ON public.%I AS RESTRICTIVE FOR ALL TO authenticated
           USING (NOT (SELECT public.app_is_customer())) WITH CHECK (NOT (SELECT public.app_is_customer()))',
        t.relname);
      n := n + 1;
    END IF;
  END LOOP;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.app_apply_customer_lockout() FROM PUBLIC, anon, authenticated;

-- ── Who sees what ────────────────────────────────────────────────────────────────────────────────────
-- One customer login belongs to one client; the owner assigns that client's licences one by one.
CREATE TABLE IF NOT EXISTS public.portal_customers (
  user_id     uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id   uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  invited_by  uuid,
  invited_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS portal_customers_client_idx ON public.portal_customers (client_id);

CREATE TABLE IF NOT EXISTS public.portal_licence_access (
  user_id     uuid NOT NULL REFERENCES public.portal_customers(user_id) ON DELETE CASCADE,
  project_id  uuid NOT NULL REFERENCES public.bis_projects(id) ON DELETE CASCADE,
  granted_by  uuid,
  granted_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, project_id)
);
CREATE INDEX IF NOT EXISTS portal_licence_access_project_idx ON public.portal_licence_access (project_id);

-- A licence can only go to a login of the same client.
CREATE OR REPLACE FUNCTION public.portal_licence_access_same_client()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.portal_customers pc JOIN public.bis_projects p ON p.client_id = pc.client_id
     WHERE pc.user_id = NEW.user_id AND p.id = NEW.project_id
  ) THEN
    RAISE EXCEPTION 'This licence belongs to another client.' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS portal_licence_access_same_client ON public.portal_licence_access;
CREATE TRIGGER portal_licence_access_same_client
  BEFORE INSERT OR UPDATE ON public.portal_licence_access
  FOR EACH ROW EXECUTE FUNCTION public.portal_licence_access_same_client();

ALTER TABLE public.portal_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_licence_access ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS portal_customers_admin ON public.portal_customers;
CREATE POLICY portal_customers_admin ON public.portal_customers FOR ALL TO authenticated
  USING ((SELECT public.app_is_admin())) WITH CHECK ((SELECT public.app_is_admin()));
DROP POLICY IF EXISTS portal_licence_access_admin ON public.portal_licence_access;
CREATE POLICY portal_licence_access_admin ON public.portal_licence_access FOR ALL TO authenticated
  USING ((SELECT public.app_is_admin())) WITH CHECK ((SELECT public.app_is_admin()));

-- "Show to Customer" on a licence file. Off by default, so nothing internal is shared by accident.
ALTER TABLE public.bis_project_files ADD COLUMN IF NOT EXISTS customer_visible boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.bis_project_files.customer_visible IS
  'True when the owner shares this file with the customer logins that have the licence (Customer Portal).';

-- ── Portal functions (the only way a customer reads data) ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.portal_can_see_licence(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.portal_licence_access a
      JOIN public.user_profiles u ON u.id = a.user_id
     WHERE a.user_id = auth.uid()
       AND a.project_id = p_project_id
       AND u.role = 'customer'
       AND lower(trim(COALESCE(u.status, 'Active'))) = 'active'
  );
$$;
REVOKE ALL ON FUNCTION public.portal_can_see_licence(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portal_can_see_licence(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.portal_my_licences()
RETURNS TABLE (
  id                    uuid,
  cm_l_digits           text,
  license_number        text,
  license_validity_date date,
  granted_date          date,
  is_number             text,
  is_year               text,
  is_title              text,
  scheme_name           text,
  licence_status        text,
  company_name          text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p.id, p.cm_l_digits::text, p.license_number::text, p.license_validity_date::date, p.granted_date::date,
         i.is_number::text, i.revision_year::text, COALESCE(NULLIF(i.title, ''), i.is_code_title)::text,
         s.name::text, ls.name::text, c.company_name::text
    FROM public.portal_licence_access a
    JOIN public.bis_projects p ON p.id = a.project_id
    LEFT JOIN public.clients c ON c.id = p.client_id
    LEFT JOIN public.is_codes i ON i.id = p.is_code_id
    LEFT JOIN public.certification_schemes s ON s.id = p.certification_scheme_id
    LEFT JOIN public.licence_statuses ls ON ls.id = p.licence_status_id
   WHERE a.user_id = auth.uid()
     AND public.portal_can_see_licence(p.id)
   ORDER BY p.license_validity_date NULLS LAST, p.cm_l_digits;
$$;
REVOKE ALL ON FUNCTION public.portal_my_licences() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portal_my_licences() TO authenticated;

CREATE OR REPLACE FUNCTION public.portal_licence_detail(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v jsonb;
BEGIN
  IF NOT public.portal_can_see_licence(p_project_id) THEN
    RAISE EXCEPTION 'Not found' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
           'id', p.id,
           'cm_l_digits', p.cm_l_digits,
           'license_number', p.license_number,
           'license_validity_date', p.license_validity_date,
           'granted_date', p.granted_date,
           'scope', p.notes,
           'installed_capacity', p.installed_capacity,
           'production_unit', p.production_unit,
           'company_name', c.company_name,
           'is_number', i.is_number,
           'is_year', i.revision_year,
           'is_title', COALESCE(NULLIF(i.title, ''), i.is_code_title),
           'scheme_name', s.name,
           'licence_status', ls.name,
           'bis_office', o.name,
           'factory', CASE WHEN f.id IS NULL THEN NULL ELSE jsonb_build_object(
             'address', f.address, 'city', f.city, 'district', f.district, 'state', f.state, 'pin_code', f.pin_code) END,
           'machinery', COALESCE((
             SELECT jsonb_agg(jsonb_build_object(
                      'name', r->>'machineryName', 'make', r->>'make', 'number', r->>'number',
                      'capacity_per_day', r->>'capacityPerDay', 'remarks', r->>'remarks'))
               FROM public.bis_project_module_data m, jsonb_array_elements(COALESCE(m.payload->'rows', '[]')) r
              WHERE m.bis_project_id = p.id AND m.module_kind = 'cmpf-305'), '[]'),
           'test_equipment', COALESCE((
             SELECT jsonb_agg(jsonb_build_object(
                      'name', r->>'equipmentName', 'make', r->>'make', 'quantity', r->>'quantity',
                      'range', r->>'range', 'least_count', r->>'leastCount', 'clause_no', r->>'clauseNo',
                      'calibration_status', r->>'calibrationStatus'))
               FROM public.bis_project_module_data m, jsonb_array_elements(COALESCE(m.payload->'rows', '[]')) r
              WHERE m.bis_project_id = p.id AND m.module_kind = 'cmpf-306'), '[]'),
           'files', COALESCE((
             SELECT jsonb_agg(jsonb_build_object('id', bf.id, 'file_name', bf.file_name, 'storage_path', bf.storage_path)
                              ORDER BY bf.created_at DESC)
               FROM public.bis_project_files bf
              WHERE bf.bis_project_id = p.id AND bf.customer_visible), '[]')
         )
    INTO v
    FROM public.bis_projects p
    LEFT JOIN public.clients c ON c.id = p.client_id
    LEFT JOIN public.is_codes i ON i.id = p.is_code_id
    LEFT JOIN public.certification_schemes s ON s.id = p.certification_scheme_id
    LEFT JOIN public.licence_statuses ls ON ls.id = p.licence_status_id
    LEFT JOIN public.bis_offices o ON o.id = p.bis_office_id
    LEFT JOIN public.client_sites f ON f.id = p.factory_site_id
   WHERE p.id = p_project_id;
  RETURN v;
END;
$$;
REVOKE ALL ON FUNCTION public.portal_licence_detail(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portal_licence_detail(uuid) TO authenticated;

-- ── Storage: a customer reads only shared files of an assigned licence ───────────────────────────────
CREATE OR REPLACE FUNCTION public.portal_can_read_object(p_bucket text, p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p_bucket = 'bis-project-files' AND EXISTS (
    SELECT 1 FROM public.bis_project_files bf
     WHERE bf.storage_path = p_name AND bf.customer_visible AND public.portal_can_see_licence(bf.bis_project_id)
  );
$$;
REVOKE ALL ON FUNCTION public.portal_can_read_object(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portal_can_read_object(text, text) TO authenticated;

DROP POLICY IF EXISTS customer_lockout ON storage.objects;
CREATE POLICY customer_lockout ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT (SELECT public.app_is_customer()) OR public.portal_can_read_object(bucket_id, name))
  WITH CHECK (NOT (SELECT public.app_is_customer()));
DROP POLICY IF EXISTS portal_customer_read ON storage.objects;
CREATE POLICY portal_customer_read ON storage.objects FOR SELECT TO authenticated
  USING ((SELECT public.app_is_customer()) AND public.portal_can_read_object(bucket_id, name));
DROP POLICY IF EXISTS customer_lockout ON storage.buckets;
CREATE POLICY customer_lockout ON storage.buckets AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT (SELECT public.app_is_customer()) OR id = 'bis-project-files')
  WITH CHECK (NOT (SELECT public.app_is_customer()));

-- Last: every public table (including the two above) gets the lockout.
SELECT public.app_apply_customer_lockout();

NOTIFY pgrst, 'reload schema';
