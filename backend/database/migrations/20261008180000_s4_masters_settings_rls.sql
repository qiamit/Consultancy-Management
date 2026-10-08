-- S4: Masters / Settings / CMS write rules in the database (module-level), admin-only
--     settings, ai_models secret, inactive users blocked, anon EXECUTE hygiene.
-- Idempotent: safe to run twice. Runs as the migration superuser (POSTGRES_URL).
-- Mirrors frontend/web/src/features/settings/module-access/resolveModuleAccess.ts
-- (priority user > designation > department > division; longest module_key prefix wins;
--  a subject with any rows but no match = none ('/' = view); no matrix at all = edit).

-- =====================================================================
-- 1) Helpers
-- =====================================================================
CREATE OR REPLACE FUNCTION public.app_module_level(p_path text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_path  text := COALESCE(NULLIF(rtrim(trim(COALESCE(p_path, '')), '/'), ''), '/');
  v_des   text;
  v_dep   text;
  v_div   text;
  v_st    text;
  v_type  text;
  v_key   text;
  v_level text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN 'none';
  END IF;
  IF public.app_is_admin() THEN
    RETURN 'edit';
  END IF;

  SELECT lower(trim(COALESCE(designation, ''))), lower(trim(COALESCE(department_name, ''))),
         lower(trim(COALESCE(division, ''))), lower(trim(COALESCE(status, 'Active')))
    INTO v_des, v_dep, v_div, v_st
    FROM public.user_profiles WHERE id = v_uid;
  IF NOT FOUND OR v_st <> 'active' THEN
    RETURN 'none';
  END IF;

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

    IF v_level IS NOT NULL THEN
      RETURN v_level;
    END IF;
    RETURN CASE WHEN v_path = '/' THEN 'view' ELSE 'none' END;
  END LOOP;

  RETURN 'edit';
END;
$$;

CREATE OR REPLACE FUNCTION public.app_can_edit(VARIADIC p_paths text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM unnest(p_paths) AS x(p) WHERE public.app_module_level(x.p) = 'edit');
$$;

REVOKE ALL ON FUNCTION public.app_module_level(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_can_edit(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_module_level(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_can_edit(text[]) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.app_module_level(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.app_can_edit(text[]) FROM anon;

-- =====================================================================
-- 2) Replace USING(true) policies. Every existing policy on these tables is
--    dropped first (permissive policies are OR-ed, so leftovers would re-open writes).
--    SELECT stays open to authenticated (except ai_models).
--    Each check is wrapped in (SELECT ...) so it runs once per statement.
-- =====================================================================
DO $$
DECLARE
  -- module paths (= module_access_rules.module_key values from lib/appNav.ts)
  mc  text := '''/masters/clients''';
  mi  text := '''/masters/is-codes''';
  mp  text := '''/masters/product-services''';
  mt  text := '''/masters/test-parameter''';
  cms text := '''/tools/cms''';
  bis text := '''/bis/projects'',''/bis/new-applications'',''/bis/new-inclusion'',''/bis/license-renewals'',''/bis/stop-marking'',''/bis/our-licenses'',''/bis/expired-licenses'',''/bis/due-soon''';
  fin text := '''/finance/sale/quotation'',''/finance/sale/proforma-invoice'',''/finance/sale/invoice'',''/finance/sale/credit-note'',''/finance/sale/payment-receipt''';
  adm text := '(SELECT public.app_is_admin())';
  -- table => [insert check, update check, delete check]; NULL select = keep open
  spec jsonb;
  t text;
  p record;
  ins text; upd text; del text; sel text;
BEGIN
  spec := jsonb_build_object(
    -- masters (records): quick-add from BIS / sale forms may INSERT; only the master's editors UPDATE; only admins DELETE
    'clients',                  jsonb_build_array(format('(SELECT public.app_can_edit(%s,%s,%s))', mc, bis, fin), format('(SELECT public.app_can_edit(%s))', mc), adm),
    'is_codes',                 jsonb_build_array(format('(SELECT public.app_can_edit(%s,%s,%s,%s))', mi, mt, bis, fin), format('(SELECT public.app_can_edit(%s,%s))', mi, mt), adm),
    'test_parameters',          jsonb_build_array(format('(SELECT public.app_can_edit(%s,%s))', mt, bis), format('(SELECT public.app_can_edit(%s))', mt), adm),
    'products_services_master', jsonb_build_array(format('(SELECT public.app_can_edit(%s,%s))', mp, fin), format('(SELECT public.app_can_edit(%s))', mp), adm),
    -- attachments / option lists: editors of the owning master
    'is_code_files',            jsonb_build_array(format('(SELECT public.app_can_edit(%s))', mi), format('(SELECT public.app_can_edit(%s))', mi), format('(SELECT public.app_can_edit(%s))', mi)),
    'client_master_options',    jsonb_build_array(format('(SELECT public.app_can_edit(%s,%s,%s))', mc, bis, fin), format('(SELECT public.app_can_edit(%s))', mc), format('(SELECT public.app_can_edit(%s))', mc)),
    'is_code_master_options',   jsonb_build_array(format('(SELECT public.app_can_edit(%s,%s))', mi, mt), format('(SELECT public.app_can_edit(%s,%s))', mi, mt), format('(SELECT public.app_can_edit(%s,%s))', mi, mt)),
    'product_item_categories',  jsonb_build_array(format('(SELECT public.app_can_edit(%s,%s))', mp, fin), format('(SELECT public.app_can_edit(%s))', mp), format('(SELECT public.app_can_edit(%s))', mp)),
    'product_makes',            jsonb_build_array(format('(SELECT public.app_can_edit(%s,%s))', mp, fin), format('(SELECT public.app_can_edit(%s))', mp), format('(SELECT public.app_can_edit(%s))', mp)),
    'gst_rates',                jsonb_build_array(format('(SELECT public.app_can_edit(%s,%s))', mp, fin), format('(SELECT public.app_can_edit(%s))', mp), format('(SELECT public.app_can_edit(%s))', mp)),
    'test_parameter_units',     jsonb_build_array(format('(SELECT public.app_can_edit(%s))', mt), format('(SELECT public.app_can_edit(%s))', mt), format('(SELECT public.app_can_edit(%s))', mt)),
    'lab_master_options',       jsonb_build_array(format('(SELECT public.app_can_edit(%s))', bis), format('(SELECT public.app_can_edit(%s))', bis), format('(SELECT public.app_can_edit(%s))', bis)),
    -- settings: admin-only writes
    'accreditation_bodies',     jsonb_build_array(adm, adm, adm),
    'company_settings',         jsonb_build_array(adm, adm, adm),
    'lab_prefixes',             jsonb_build_array(adm, adm, adm),
    'lab_documents',            jsonb_build_array(adm, adm, adm),
    'lab_accreditations',       jsonb_build_array(adm, adm, adm),
    'ai_settings',              jsonb_build_array(adm, adm, adm),
    'ai_skills',                jsonb_build_array(adm, adm, adm),
    'app_settings',             jsonb_build_array(adm, adm, adm),
    'ai_models',                jsonb_build_array(adm, adm, adm),
    -- website CMS: editors of /tools/cms
    'website_news',             jsonb_build_array(format('(SELECT public.app_can_edit(%s))', cms), format('(SELECT public.app_can_edit(%s))', cms), format('(SELECT public.app_can_edit(%s))', cms)),
    'website_services',         jsonb_build_array(format('(SELECT public.app_can_edit(%s))', cms), format('(SELECT public.app_can_edit(%s))', cms), format('(SELECT public.app_can_edit(%s))', cms)),
    'website_settings',         jsonb_build_array(format('(SELECT public.app_can_edit(%s))', cms), format('(SELECT public.app_can_edit(%s))', cms), format('(SELECT public.app_can_edit(%s))', cms))
  );

  FOR t IN SELECT jsonb_object_keys(spec) LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'S4: table public.% missing, skipped', t;
      CONTINUE;
    END IF;
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    ins := spec->t->>0; upd := spec->t->>1; del := spec->t->>2;
    sel := CASE WHEN t = 'ai_models' THEN adm ELSE 'true' END;
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (%s)', t || '_select', t, sel);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)', t || '_insert', t, ins);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)', t || '_update', t, upd, upd);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (%s)', t || '_delete', t, del);
  END LOOP;
END $$;

-- =====================================================================
-- 3) Storage: laboratory-files (logo, seal, letterheads, lab documents) is
--    written only from Lab Settings (admin route). Reads stay open.
-- =====================================================================
DO $$
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE 'S4: storage.objects missing, skipped';
    RETURN;
  END IF;
  EXECUTE 'DROP POLICY IF EXISTS lims_laboratory_files_insert ON storage.objects';
  EXECUTE 'CREATE POLICY lims_laboratory_files_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = ''laboratory-files'' AND (SELECT public.app_is_admin()))';
  EXECUTE 'DROP POLICY IF EXISTS lims_laboratory_files_update ON storage.objects';
  EXECUTE 'CREATE POLICY lims_laboratory_files_update ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = ''laboratory-files'' AND (SELECT public.app_is_admin())) WITH CHECK (bucket_id = ''laboratory-files'' AND (SELECT public.app_is_admin()))';
  EXECUTE 'DROP POLICY IF EXISTS lims_laboratory_files_delete ON storage.objects';
  EXECUTE 'CREATE POLICY lims_laboratory_files_delete ON storage.objects FOR DELETE TO authenticated USING (bucket_id = ''laboratory-files'' AND (SELECT public.app_is_admin()))';
END $$;

-- =====================================================================
-- 4) Inactive users: setting user_profiles.status to anything but 'Active'
--    bans the GoTrue user (no login, no token refresh) and ends their sessions.
--    Setting it back to 'Active' lifts the ban.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.user_profiles_sync_auth_ban()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF lower(trim(COALESCE(NEW.status, 'Active'))) = 'active' THEN
    UPDATE auth.users SET banned_until = NULL WHERE id = NEW.id AND banned_until IS NOT NULL;
  ELSE
    UPDATE auth.users SET banned_until = now() + interval '100 years' WHERE id = NEW.id;
    DELETE FROM auth.sessions WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.user_profiles_sync_auth_ban() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS user_profiles_sync_auth_ban ON public.user_profiles;
CREATE TRIGGER user_profiles_sync_auth_ban
  AFTER UPDATE OF status ON public.user_profiles
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.user_profiles_sync_auth_ban();

-- Backfill: users already inactive get banned now (no-op when everyone is Active).
UPDATE auth.users u SET banned_until = now() + interval '100 years'
  FROM public.user_profiles p
 WHERE p.id = u.id
   AND lower(trim(COALESCE(p.status, 'Active'))) <> 'active'
   AND (u.banned_until IS NULL OR u.banned_until < now());

-- =====================================================================
-- 5) anon must not execute team/admin helpers (they already refuse, this is hygiene).
-- =====================================================================
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname IN ('list_team_users', 'update_team_user', 'current_user_is_admin')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f.sig);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- =====================================================================
-- MANUAL TEST (run by hand in psql against POSTGRES_URL; everything is rolled back)
-- Replace <IE_UID> with a non-admin user id and <ADMIN_UID> with an admin user id.
-- =====================================================================
-- BEGIN;
--   -- non-admin with edit on /masters/clients
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims', '{"sub":"<IE_UID>","role":"authenticated"}', true);
--   SELECT public.app_module_level('/masters/clients');                       -- expect edit
--   SELECT public.app_module_level('/settings/lab');                          -- expect none
--   UPDATE public.clients SET company_name = company_name
--    WHERE id = (SELECT id FROM public.clients LIMIT 1) RETURNING id;          -- expect 1 row
--   DELETE FROM public.clients WHERE id = (SELECT id FROM public.clients LIMIT 1) RETURNING id;  -- expect 0 rows
--   SELECT count(*) FROM public.ai_models;                                     -- expect 0
--   SAVEPOINT a;
--   INSERT INTO public.lab_prefixes (name, prefix) VALUES ('t', 'T');          -- expect RLS error
--   ROLLBACK TO SAVEPOINT a;
--   SAVEPOINT b;
--   INSERT INTO storage.objects (bucket_id, name) VALUES ('laboratory-files', 'company/t.png');  -- expect RLS error
--   ROLLBACK TO SAVEPOINT b;
--   -- admin
--   SELECT set_config('request.jwt.claims', '{"sub":"<ADMIN_UID>","role":"authenticated"}', true);
--   SELECT count(*) FROM public.ai_models;                                     -- expect >= 1
--   UPDATE public.user_profiles SET status = 'Inactive' WHERE id = '<IE_UID>';
--   RESET ROLE;
--   SELECT banned_until > now() AS banned FROM auth.users WHERE id = '<IE_UID>';  -- expect true
--   SELECT count(*) FROM auth.sessions WHERE user_id = '<IE_UID>';             -- expect 0
-- ROLLBACK;
