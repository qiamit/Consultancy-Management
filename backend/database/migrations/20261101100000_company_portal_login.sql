-- Company-wide portal login (BIS Portal / BSB Edge, standardsbis.bsbedge.com): one User ID and password for the
-- whole company, set in Company Settings. The QE Consultancy extension fills them on the BSB Edge login page;
-- the user types the captcha. The password is encrypted with the S6 portal key and never stored in public.
-- No data rewrite. Idempotent.

SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS private.company_portal_logins (
  portal     text PRIMARY KEY CHECK (portal IN ('bsb')),
  user_id    text NOT NULL DEFAULT '',
  secret_enc bytea,
  key_name   text NOT NULL DEFAULT 'portal_v1',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
REVOKE ALL ON private.company_portal_logins FROM PUBLIC;

-- User ID and whether a password is saved (never the password). Admins only (Company Settings).
CREATE OR REPLACE FUNCTION public.company_portal_login_info(p_portal text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row private.company_portal_logins%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Only Laboratory Director/Admin can see company portal logins.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_row FROM private.company_portal_logins WHERE portal = lower(trim(p_portal));
  RETURN jsonb_build_object('user_id', COALESCE(v_row.user_id, ''), 'password_set', v_row.secret_enc IS NOT NULL);
END;
$$;

-- Save the User ID; p_password NULL keeps the saved password, '' clears it. Admins only. Never returns the password.
CREATE OR REPLACE FUNCTION public.company_portal_login_set(p_portal text, p_user_id text, p_password text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_portal text := lower(trim(COALESCE(p_portal, '')));
  v_user   text := trim(COALESCE(p_user_id, ''));
BEGIN
  IF auth.uid() IS NULL OR NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Only Laboratory Director/Admin can change company portal logins.' USING ERRCODE = '42501';
  END IF;
  IF v_portal NOT IN ('bsb') THEN
    RAISE EXCEPTION 'Unknown portal' USING ERRCODE = '22023';
  END IF;
  IF length(v_user) > 200 OR length(COALESCE(p_password, '')) > 200 THEN
    RAISE EXCEPTION 'User ID / password is too long (max 200 characters).' USING ERRCODE = '22023';
  END IF;

  INSERT INTO private.company_portal_logins (portal, user_id, updated_by)
  VALUES (v_portal, v_user, auth.uid())
  ON CONFLICT (portal) DO UPDATE SET user_id = EXCLUDED.user_id, updated_at = now(), updated_by = EXCLUDED.updated_by;

  IF p_password IS NOT NULL THEN
    UPDATE private.company_portal_logins
       SET secret_enc = CASE WHEN p_password = '' THEN NULL
                             ELSE extensions.pgp_sym_encrypt(p_password, private.portal_key(), 'cipher-algo=aes256') END,
           key_name = 'portal_v1'
     WHERE portal = v_portal;
    INSERT INTO public.portal_secret_access_log (action, user_id, via)
    VALUES (CASE WHEN p_password = '' THEN 'clear' ELSE 'set' END, auth.uid(), 'company_portal_login_set:' || v_portal);
  END IF;
  RETURN (SELECT secret_enc IS NOT NULL FROM private.company_portal_logins WHERE portal = v_portal);
END;
$$;

-- User ID + password for the extension's login fill. Admins or editors of a BIS screen; same caps as the Manak
-- password (30 per 10 minutes, 60 per 24 hours per user); every read is logged.
CREATE OR REPLACE FUNCTION public.company_portal_login_get(p_portal text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_portal text := lower(trim(COALESCE(p_portal, '')));
  v_row    private.company_portal_logins%ROWTYPE;
  v_recent integer;
  v_day    integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.app_is_admin() OR public.app_can_edit(VARIADIC public.app_bis_paths())) THEN
    RAISE EXCEPTION 'You do not have edit access to BIS screens.' USING ERRCODE = '42501';
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

  SELECT * INTO v_row FROM private.company_portal_logins WHERE portal = v_portal;
  IF NOT FOUND OR (COALESCE(v_row.user_id, '') = '' AND v_row.secret_enc IS NULL) THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.portal_secret_access_log (action, user_id, via)
  VALUES ('extension_login', auth.uid(), 'company_portal_login_get:' || v_portal);
  RETURN jsonb_build_object(
    'user_id', v_row.user_id,
    'password', CASE WHEN v_row.secret_enc IS NULL THEN '' ELSE extensions.pgp_sym_decrypt(v_row.secret_enc, private.portal_key()) END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.company_portal_login_info(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.company_portal_login_set(text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.company_portal_login_get(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.company_portal_login_info(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.company_portal_login_set(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.company_portal_login_get(text) TO authenticated;
