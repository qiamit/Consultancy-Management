-- Admin Two-Step Login (authenticator app / TOTP). Runs after 20261030100000_security_hardening.
-- Admin power now needs a session that passed the authenticator code: the JWT claim aal = 'aal2'.
-- 1) app_is_admin(): true only on an aal2 session.
-- 2) app_module_level(): an admin account, or any user who has a verified authenticator, gets 'none' on a
--    password-only (aal1) session (admins also have their own Module Access rows, which would otherwise
--    still apply). So a stolen password alone opens no module data, settings or admin RPCs.
-- Users without an authenticator (staff who never set one up) are unchanged.
--
-- Why only these two functions change:
--   * Every RLS policy, RPC guard and SECURITY DEFINER helper (app_module_level, app_can_view / app_can_edit,
--     portal-secret reveal, user_profiles policies …) decides "admin" through public.app_is_admin(), so they
--     all follow automatically.
--   * auth.jwt() reads request.jwt.claims, which PostgREST and storage-api set from the caller's JWT for the
--     whole request, including triggers and SECURITY DEFINER functions the request fires.
--   * Paths without a user JWT are unchanged: service_role (functions / mcp service calls), GoTrue's own
--     connection, migrations and cron have no auth.uid(), so app_is_admin() was already false there and those
--     paths never relied on it (they bypass RLS or check the role themselves).
--   * user_profiles_guard_last_admin counts role = 'admin' rows directly (not this function): unchanged.
--   * Enrolling the authenticator is a GoTrue call (/auth/v1/factors), not a database permission, so an admin
--     still on aal1 can always reach and finish the enrollment screen. Reading one's own user_profiles row
--     (the app's admin check) does not need admin either.
-- Break-glass (both admins lost their phones): see deploy/oracle/README.md "Two-Step Login break-glass".
-- No data change. Idempotent. Apply with npm run db:migrate. Do not edit after it is applied.

CREATE OR REPLACE FUNCTION public.app_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(auth.jwt() ->> 'aal', '') = 'aal2'
     AND EXISTS (
       SELECT 1
         FROM public.user_profiles
        WHERE id = auth.uid()
          AND lower(trim(COALESCE(status, 'Active'))) = 'active'
          AND role = 'admin'
     );
$$;

-- Module Access (app_module_level, used by app_can_view / app_can_edit and every module RLS policy):
-- same body as 20261019120000 (checked equal to the live function on 2026-10-30) plus the aal check.
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
  v_out   text;
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

  -- Two-Step Login: an admin account, or anyone who has set up an authenticator, gets no module access on a
  -- password-only (aal1) session. Finishing the code / enrollment step is a GoTrue call, so it still works.
  IF COALESCE(auth.jwt() ->> 'aal', '') <> 'aal2'
     AND (v_role = 'admin'
          OR EXISTS (SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = v_uid AND f.status = 'verified'))
  THEN
    RETURN 'none';
  END IF;

  v_out := CASE WHEN v_path = '/' THEN 'view' ELSE 'none' END;

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

    v_out := COALESCE(v_level, v_out);
    EXIT subjects;
  END LOOP;

  IF v_role = 'viewer' AND v_out = 'edit' THEN
    RETURN 'view';
  END IF;
  RETURN v_out;
END;
$$;

COMMENT ON FUNCTION public.app_is_admin() IS
  'Admin = active user_profiles.role = ''admin'' AND the session passed Two-Step Login (JWT aal = aal2).';

NOTIFY pgrst, 'reload schema';
