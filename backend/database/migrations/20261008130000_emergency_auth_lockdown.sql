-- Emergency auth lockdown (MST-80, MST-81, MST-82, MST-03 writes, MST-85).
-- Does not change client scale or portal password storage.
-- Idempotent. Apply with npm run db:migrate. Do not edit after it is applied.

-- 1) Admin check used by RLS. NULL status counts as active.
CREATE OR REPLACE FUNCTION public.app_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_profiles
    WHERE id = auth.uid()
      AND lower(trim(COALESCE(status, 'Active'))) = 'active'
      AND lower(trim(COALESCE(designation, ''))) IN (
        'laboratory director',
        'admin',
        'administrator',
        'director',
        'super admin',
        'managing director'
      )
  );
$$;

REVOKE ALL ON FUNCTION public.app_is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_is_admin() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.app_is_admin() FROM anon;

-- 2) Legacy tables: enable RLS and take anon/authenticated grants away.
--    No policies. The table owner and service_role keep access.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['app_users', 'app_schema_migrations', '_railway_migrations']
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);
    END IF;
  END LOOP;
END $$;

DO $$
BEGIN
  IF to_regclass('public.app_users') IS NOT NULL THEN
    COMMENT ON TABLE public.app_users IS
      'legacy Consultancy Pro auth table — not used by the app; do not expose';
  END IF;
END $$;

-- 3) Sign-up trigger. Designation is never taken from raw_user_meta_data.
--    A conflict must not overwrite an existing designation or status.
--    The functions service upserts designation afterwards with the service role.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.user_profiles (
    id,
    email,
    full_name,
    mobile,
    designation,
    department_name,
    division,
    status
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'mobile', ''),
    '',
    COALESCE(NEW.raw_user_meta_data->>'department_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'division', ''),
    COALESCE(NEW.raw_user_meta_data->>'status', 'Active')
  )
  ON CONFLICT (id) DO UPDATE SET
    email = COALESCE(NULLIF(EXCLUDED.email, ''), public.user_profiles.email),
    full_name = COALESCE(EXCLUDED.full_name, public.user_profiles.full_name),
    mobile = COALESCE(NULLIF(EXCLUDED.mobile, ''), public.user_profiles.mobile),
    department_name = COALESCE(NULLIF(EXCLUDED.department_name, ''), public.user_profiles.department_name),
    division = COALESCE(NULLIF(EXCLUDED.division, ''), public.user_profiles.division),
    updated_at = now();
  RETURN NEW;
END;
$function$;

-- 4) module_access_rules: everyone may read; only an admin may write.
DO $$
BEGIN
  IF to_regclass('public.module_access_rules') IS NULL THEN
    RETURN;
  END IF;

  DROP POLICY IF EXISTS lims_module_access_rules_select ON public.module_access_rules;
  DROP POLICY IF EXISTS lims_module_access_rules_insert ON public.module_access_rules;
  DROP POLICY IF EXISTS lims_module_access_rules_update ON public.module_access_rules;
  DROP POLICY IF EXISTS lims_module_access_rules_delete ON public.module_access_rules;
  DROP POLICY IF EXISTS consultancy_module_access_rules_all ON public.module_access_rules;

  DROP POLICY IF EXISTS module_access_rules_select ON public.module_access_rules;
  CREATE POLICY module_access_rules_select
    ON public.module_access_rules
    FOR SELECT
    TO authenticated
    USING (true);

  DROP POLICY IF EXISTS module_access_rules_admin_insert ON public.module_access_rules;
  CREATE POLICY module_access_rules_admin_insert
    ON public.module_access_rules
    FOR INSERT
    TO authenticated
    WITH CHECK (public.app_is_admin());

  DROP POLICY IF EXISTS module_access_rules_admin_update ON public.module_access_rules;
  CREATE POLICY module_access_rules_admin_update
    ON public.module_access_rules
    FOR UPDATE
    TO authenticated
    USING (public.app_is_admin())
    WITH CHECK (public.app_is_admin());

  DROP POLICY IF EXISTS module_access_rules_admin_delete ON public.module_access_rules;
  CREATE POLICY module_access_rules_admin_delete
    ON public.module_access_rules
    FOR DELETE
    TO authenticated
    USING (public.app_is_admin());
END $$;

-- 5) user_profiles. Drop the open ALL policy and older USING(true) policies
--    from skipped/earlier migrations so they cannot OR with the new rules.
DO $$
BEGIN
  IF to_regclass('public.user_profiles') IS NULL THEN
    RETURN;
  END IF;

  DROP POLICY IF EXISTS consultancy_user_profiles_all ON public.user_profiles;
  DROP POLICY IF EXISTS lims_user_profiles_all ON public.user_profiles;
  DROP POLICY IF EXISTS "Allow select for authenticated" ON public.user_profiles;
  DROP POLICY IF EXISTS "Allow insert for authenticated" ON public.user_profiles;
  DROP POLICY IF EXISTS "Allow update for authenticated" ON public.user_profiles;
  DROP POLICY IF EXISTS "Allow delete for authenticated" ON public.user_profiles;

  DROP POLICY IF EXISTS user_profiles_select ON public.user_profiles;
  CREATE POLICY user_profiles_select
    ON public.user_profiles
    FOR SELECT
    TO authenticated
    USING (true);

  DROP POLICY IF EXISTS user_profiles_insert ON public.user_profiles;
  CREATE POLICY user_profiles_insert
    ON public.user_profiles
    FOR INSERT
    TO authenticated
    WITH CHECK (public.app_is_admin());

  DROP POLICY IF EXISTS user_profiles_update ON public.user_profiles;
  CREATE POLICY user_profiles_update
    ON public.user_profiles
    FOR UPDATE
    TO authenticated
    USING (public.app_is_admin() OR id = auth.uid())
    WITH CHECK (public.app_is_admin() OR id = auth.uid());

  DROP POLICY IF EXISTS user_profiles_delete ON public.user_profiles;
  CREATE POLICY user_profiles_delete
    ON public.user_profiles
    FOR DELETE
    TO authenticated
    USING (public.app_is_admin());
END $$;

CREATE OR REPLACE FUNCTION public.user_profiles_guard_privileged()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL
     OR COALESCE(auth.role(), '') = 'service_role'
     OR public.app_is_admin()
  THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF COALESCE(trim(NEW.designation), '') <> '' THEN
      RAISE EXCEPTION 'Only an admin can change designation/status/department'
        USING ERRCODE = '42501';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.designation IS DISTINCT FROM OLD.designation
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.department_name IS DISTINCT FROM OLD.department_name
       OR NEW.division IS DISTINCT FROM OLD.division
       OR NEW.email IS DISTINCT FROM OLD.email
    THEN
      RAISE EXCEPTION 'Only an admin can change designation/status/department'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.user_profiles') IS NULL THEN
    RETURN;
  END IF;
  DROP TRIGGER IF EXISTS user_profiles_guard_privileged ON public.user_profiles;
  CREATE TRIGGER user_profiles_guard_privileged
    BEFORE INSERT OR UPDATE ON public.user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.user_profiles_guard_privileged();
END $$;

-- 6) lab_settings anon SELECT exposed bank account, IFSC and UPI.
--    Logged-out UI uses get_public_company_brand(), not this table.
--    /contact and other lab_settings reads sit behind the authenticated shell.
DO $$
BEGIN
  IF to_regclass('public.lab_settings') IS NOT NULL THEN
    DROP POLICY IF EXISTS consultancy_lab_settings_anon_select ON public.lab_settings;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- -- S1 MANUAL TEST (run after npm run db:migrate). Read-only: every block ends in ROLLBACK.
-- -- Replace <IE_UUID> with a real Inspection Engineer id and <ADMIN_UUID> with an Admin id:
-- --   SELECT id, email, designation FROM public.user_profiles ORDER BY designation;
--
-- -- A) Structure
-- SELECT c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
-- WHERE n.nspname = 'public' AND c.relname IN ('app_users','app_schema_migrations','_railway_migrations');  -- all true
-- SELECT has_table_privilege('anon','public.app_users','select') AS anon_app_users,
--        has_table_privilege('authenticated','public.app_users','select') AS auth_app_users;  -- false, false
-- SELECT tablename, policyname, cmd FROM pg_policies
-- WHERE schemaname='public' AND tablename IN ('module_access_rules','user_profiles','lab_settings') ORDER BY 1,2;
-- -- expect: lab_settings.consultancy_lab_settings_all only; module_access_rules_{select,admin_insert,admin_update,admin_delete};
-- --         user_profiles_{select,insert,update,delete}. No lims_* / consultancy_*_all on those two tables.
--
-- -- B) anon cannot read app_users
-- BEGIN; SET LOCAL ROLE anon; SELECT count(*) FROM public.app_users; ROLLBACK;   -- ERROR permission denied
--
-- -- C) anon sees no lab_settings rows
-- BEGIN; SET LOCAL ROLE anon; SELECT count(*) FROM public.lab_settings; ROLLBACK; -- 0
--
-- -- D) Inspection Engineer: read OK, writes blocked
-- BEGIN;
-- SELECT set_config('request.jwt.claims', json_build_object('sub','<IE_UUID>','role','authenticated')::text, true);
-- SET LOCAL ROLE authenticated;
-- SELECT public.app_is_admin();                                                -- false
-- SELECT count(*) FROM public.module_access_rules;                             -- > 0 (read still works)
-- UPDATE public.module_access_rules SET access_level = access_level RETURNING id;  -- UPDATE 0 (RLS hides rows; does not raise an error)
-- INSERT INTO public.module_access_rules (module_key) VALUES ('__s1_test__');  -- ERROR new row violates row-level security policy
-- ROLLBACK;
--
-- BEGIN;
-- SELECT set_config('request.jwt.claims', json_build_object('sub','<IE_UUID>','role','authenticated')::text, true);
-- SET LOCAL ROLE authenticated;
-- UPDATE public.user_profiles SET designation = 'Admin' WHERE id = '<IE_UUID>'; -- ERROR Only an admin can change designation/status/department
-- ROLLBACK;
--
-- -- E) Admin still works
-- BEGIN;
-- SELECT set_config('request.jwt.claims', json_build_object('sub','<ADMIN_UUID>','role','authenticated')::text, true);
-- SET LOCAL ROLE authenticated;
-- SELECT public.app_is_admin();                                                -- true
-- UPDATE public.module_access_rules SET access_level = access_level RETURNING id;  -- returns all rows
-- ROLLBACK;
