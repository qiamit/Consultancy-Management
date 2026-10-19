-- Batch A (settings review 2026-10-19, decisions #44 and #45).
-- 1) Admin comes only from user_profiles.role = 'admin' (designation is a job title only).
-- 2) Module Access default is None: a user with no matching matrix rows gets 'none'
--    everywhere except a Dashboard ('/') view. Saving "None" now stores a 'none' row.
-- 3) update_team_user uses the same admin check (it used a designation list and ignored status).
-- Live check before this migration: every user has user-level rows and both admins already
-- have role = 'admin', so nobody loses access.
-- Idempotent. Apply with npm run db:migrate. Do not edit after it is applied.

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
       AND role = 'admin'
  );
$$;

-- Same resolution as S6 (mirrors resolveModuleAccess.ts), except the fallback:
-- no matching subject rows = 'none' ('/' = 'view'), not 'edit'.
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

CREATE OR REPLACE FUNCTION public.update_team_user(
  p_user_id uuid,
  p_full_name text DEFAULT NULL,
  p_mobile text DEFAULT NULL,
  p_designation text DEFAULT NULL,
  p_department_name text DEFAULT NULL,
  p_division text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_email text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, auth
AS $$
DECLARE
  next_email text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Forbidden'
      USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id is required';
  END IF;

  UPDATE public.user_profiles
  SET
    full_name = COALESCE(p_full_name, full_name),
    mobile = COALESCE(p_mobile, mobile),
    designation = COALESCE(p_designation, designation),
    department_name = COALESCE(p_department_name, department_name),
    division = COALESCE(p_division, division),
    status = COALESCE(p_status, status),
    email = COALESCE(NULLIF(trim(p_email), ''), email),
    updated_at = now()
  WHERE id = p_user_id;

  next_email := NULLIF(trim(COALESCE(p_email, '')), '');
  IF next_email IS NOT NULL THEN
    UPDATE auth.users
    SET
      email = next_email,
      updated_at = now()
    WHERE id = p_user_id;

    UPDATE auth.identities
    SET
      identity_data = coalesce(identity_data, '{}'::jsonb)
        || jsonb_build_object('email', next_email),
      updated_at = now()
    WHERE user_id = p_user_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.app_is_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.app_module_level(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_team_user(uuid, text, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_is_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_module_level(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_team_user(uuid, text, text, text, text, text, text, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- MANUAL TEST (psql, everything rolled back). Replace <STAFF_UID> with a non-admin id.
-- BEGIN;
-- SELECT set_config('request.jwt.claims', json_build_object('sub','<STAFF_UID>','role','authenticated')::text, true);
-- SET LOCAL ROLE authenticated;
-- SELECT public.app_is_admin();                         -- false
-- SELECT public.app_module_level('/settings/users');    -- none (no row for it)
-- SELECT public.app_module_level('/');                  -- view unless a '/' row says otherwise
-- ROLLBACK;
