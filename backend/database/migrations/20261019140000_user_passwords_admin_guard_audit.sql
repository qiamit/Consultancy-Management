-- Batch B (settings review 2026-10-19, decision #46, findings H4 / M2 / M3 / M4).
-- 1) user_profiles.must_change_password: set when an admin creates a user or sets a password.
--    Only an admin (or the service role) can set it; the user clears it through
--    app_password_changed() after changing their own password.
-- 2) Last-admin guard: at least one active admin must remain, and an admin cannot
--    deactivate or demote themselves. Also covers the cascade from a GoTrue user delete.
-- 3) Audit actor: rows written by the functions service (service role) take changed_by from
--    the x-actor-id request header. GoTrue-side events (create / delete / password set) are
--    logged through app_audit_user_event() as table_name 'auth.users'.
-- 4) app_revoke_user_sessions(): the functions service logs a user out after a password reset.
-- Idempotent. Apply with npm run db:migrate. Do not edit after it is applied.

-- ---------------------------------------------------------------------
-- 1) must_change_password
-- ---------------------------------------------------------------------
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.user_profiles.must_change_password IS
  'Batch B: true after an admin creates the user or sets their password. The app asks for a new password until app_password_changed() clears it.';

CREATE OR REPLACE FUNCTION public.user_profiles_guard_must_change_password()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.must_change_password IS NOT DISTINCT FROM OLD.must_change_password THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NULL
     OR COALESCE(auth.role(), '') = 'service_role'
     OR public.app_is_admin()
  THEN
    RETURN NEW;
  END IF;
  -- The user clearing their own flag through app_password_changed().
  IF NEW.id = auth.uid()
     AND NEW.must_change_password = false
     AND current_setting('app.password_changed', true) = 'on'
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Only an admin can change must_change_password' USING ERRCODE = '42501';
END;
$$;
REVOKE ALL ON FUNCTION public.user_profiles_guard_must_change_password() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS user_profiles_guard_must_change_password ON public.user_profiles;
CREATE TRIGGER user_profiles_guard_must_change_password
  BEFORE UPDATE OF must_change_password ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.user_profiles_guard_must_change_password();

CREATE OR REPLACE FUNCTION public.app_password_changed()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('app.password_changed', 'on', true);
  UPDATE public.user_profiles
     SET must_change_password = false
   WHERE id = auth.uid()
     AND must_change_password;
END;
$$;

-- ---------------------------------------------------------------------
-- 2) Last-admin guard
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_profiles_guard_last_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid        uuid;
  v_was_admin  boolean;
  v_still      boolean;
BEGIN
  BEGIN
    v_uid := auth.uid();
  EXCEPTION WHEN others THEN
    v_uid := NULL;
  END;

  v_was_admin := OLD.role = 'admin' AND lower(trim(COALESCE(OLD.status, 'Active'))) = 'active';

  IF TG_OP = 'UPDATE' THEN
    IF v_uid IS NOT NULL AND OLD.id = v_uid THEN
      IF lower(trim(COALESCE(OLD.status, 'Active'))) = 'active'
         AND lower(trim(COALESCE(NEW.status, 'Active'))) <> 'active'
      THEN
        RAISE EXCEPTION 'You cannot deactivate your own account.' USING ERRCODE = '42501';
      END IF;
      IF OLD.role = 'admin' AND NEW.role IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'You cannot remove your own admin role.' USING ERRCODE = '42501';
      END IF;
    END IF;
    v_still := NEW.role = 'admin' AND lower(trim(COALESCE(NEW.status, 'Active'))) = 'active';
  ELSE
    v_still := false;
  END IF;

  IF v_was_admin AND NOT v_still THEN
    -- Serialise admin removals so two admins cannot remove each other at the same time.
    PERFORM pg_advisory_xact_lock(hashtext('user_profiles_guard_last_admin'));
    IF NOT EXISTS (
      SELECT 1
        FROM public.user_profiles
       WHERE id <> OLD.id
         AND role = 'admin'
         AND lower(trim(COALESCE(status, 'Active'))) = 'active'
    ) THEN
      RAISE EXCEPTION 'At least one active admin must remain.' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.user_profiles_guard_last_admin() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS user_profiles_guard_last_admin ON public.user_profiles;
CREATE TRIGGER user_profiles_guard_last_admin
  BEFORE UPDATE OF role, status OR DELETE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.user_profiles_guard_last_admin();

-- ---------------------------------------------------------------------
-- 3) Audit actor
-- ---------------------------------------------------------------------
-- Same as S5, plus: under the service role, changed_by comes from the x-actor-id header
-- (only the functions service holds the service key and sets it to the calling admin).
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

  IF v_uid IS NULL AND v_via = 'service_role' THEN
    BEGIN
      v_uid := NULLIF(NULLIF(current_setting('request.headers', true), '')::jsonb ->> 'x-actor-id', '')::uuid;
    EXCEPTION WHEN others THEN
      v_uid := NULL;
    END;
  END IF;

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

-- GoTrue-side user events from the functions service. p_action: I = created, U = password set, D = deleted.
CREATE OR REPLACE FUNCTION public.app_audit_user_event(
  p_actor   uuid,
  p_user_id uuid,
  p_action  text,
  p_event   text,
  p_data    jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_action NOT IN ('I', 'U', 'D') THEN
    RAISE EXCEPTION 'Invalid audit action %', p_action;
  END IF;
  INSERT INTO public.audit_log (table_name, row_id, action, changed_by, changed_via, old_data, new_data)
  VALUES (
    'auth.users',
    p_user_id::text,
    p_action,
    p_actor,
    'functions',
    CASE WHEN p_action = 'D' THEN COALESCE(p_data, '{}'::jsonb) ELSE NULL END,
    CASE WHEN p_action = 'D' THEN jsonb_build_object('event', p_event)
         ELSE jsonb_build_object('event', p_event) || COALESCE(p_data, '{}'::jsonb) END
  );
END;
$$;

-- ---------------------------------------------------------------------
-- 4) Session revoke (after an admin password reset)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_revoke_user_sessions(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_count integer;
BEGIN
  DELETE FROM auth.sessions WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.app_password_changed() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.app_audit_user_event(uuid, uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.app_revoke_user_sessions(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_password_changed() TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_audit_user_event(uuid, uuid, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.app_revoke_user_sessions(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
