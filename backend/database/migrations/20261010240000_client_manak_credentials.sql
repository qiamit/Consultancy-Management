-- Manak Online user id and password live on the client (one firm, every licence).
-- The password is encrypted with the existing S6 portal key. It is never stored in public.
-- Licence rows keep the deprecated portal_password column (always NULL). Their user id and
-- encrypted secret are copied here, then cleared, so a later licence edit cannot diverge.

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS manak_user_id text,
  ADD COLUMN IF NOT EXISTS manak_password_set boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.clients.manak_user_id IS
  'Manak Online user id for this firm. Shared by every BIS licence. May be an email or another id. Not the password.';
COMMENT ON COLUMN public.clients.manak_password_set IS
  'True when an encrypted Manak password exists in private.client_portal_secrets. The password is never in this table.';

CREATE TABLE IF NOT EXISTS private.client_portal_secrets (
  client_id  uuid PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  secret_enc bytea NOT NULL,
  key_name   text NOT NULL DEFAULT 'portal_v1',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
REVOKE ALL ON private.client_portal_secrets FROM PUBLIC;

ALTER TABLE public.portal_secret_access_log
  ADD COLUMN IF NOT EXISTS client_id uuid;
CREATE INDEX IF NOT EXISTS portal_secret_access_log_client_idx
  ON public.portal_secret_access_log (client_id, at DESC);

-- Set or clear one firm's password. Empty clears. Never returns the password.
CREATE OR REPLACE FUNCTION public.client_portal_secret_set(p_client_id uuid, p_password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT (public.app_is_admin() OR public.app_can_edit('/masters/clients')) THEN
    RAISE EXCEPTION 'You do not have edit access to clients.' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.clients WHERE id = p_client_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Client not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_password IS NULL OR p_password = '' THEN
    DELETE FROM private.client_portal_secrets WHERE client_id = p_client_id;
    UPDATE public.clients SET manak_password_set = false WHERE id = p_client_id AND manak_password_set;
    INSERT INTO public.portal_secret_access_log (client_id, action, user_id, via)
    VALUES (p_client_id, 'clear', auth.uid(), 'client_portal_secret_set');
    RETURN false;
  END IF;

  IF length(p_password) > 200 THEN
    RAISE EXCEPTION 'Password is too long (max 200 characters).' USING ERRCODE = '22023';
  END IF;

  INSERT INTO private.client_portal_secrets (client_id, secret_enc, updated_by)
  VALUES (p_client_id, extensions.pgp_sym_encrypt(p_password, private.portal_key(), 'cipher-algo=aes256'), auth.uid())
  ON CONFLICT (client_id) DO UPDATE
    SET secret_enc = EXCLUDED.secret_enc, key_name = 'portal_v1', updated_at = now(), updated_by = EXCLUDED.updated_by;
  UPDATE public.clients SET manak_password_set = true WHERE id = p_client_id AND NOT manak_password_set;
  INSERT INTO public.portal_secret_access_log (client_id, action, user_id, via)
  VALUES (p_client_id, 'set', auth.uid(), 'client_portal_secret_set');
  RETURN true;
END;
$$;

-- One firm's password, for one purpose, logged.
--   reveal           → admins only (View on the client form). There is no copy purpose.
--   extension_login  → client editors or BIS editors (handed to the QE extension).
CREATE OR REPLACE FUNCTION public.client_portal_secret_get(p_client_id uuid, p_purpose text DEFAULT 'extension_login')
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
    RAISE EXCEPTION 'Only Laboratory Director/Admin can view portal passwords.' USING ERRCODE = '42501';
  END IF;
  IF v_purpose = 'extension_login'
     AND NOT (
       public.app_is_admin()
       OR public.app_can_edit('/masters/clients')
       OR public.app_can_edit(VARIADIC public.app_bis_paths())
     ) THEN
    RAISE EXCEPTION 'You do not have access to this portal password.' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_recent
    FROM public.portal_secret_access_log
   WHERE user_id = auth.uid() AND action IN ('reveal', 'extension_login') AND at > now() - interval '10 minutes';
  IF v_recent >= 30 THEN
    RAISE EXCEPTION 'Too many password requests. Try again in a few minutes.' USING ERRCODE = '54000';
  END IF;

  SELECT s.secret_enc INTO v_enc FROM private.client_portal_secrets s WHERE s.client_id = p_client_id;
  IF v_enc IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.portal_secret_access_log (client_id, action, user_id, via)
  VALUES (p_client_id, v_purpose, auth.uid(), 'client_portal_secret_get');
  RETURN extensions.pgp_sym_decrypt(v_enc, private.portal_key());
END;
$$;

-- Licence login still passes a project id. Read the firm's secret first, then any leftover project secret.
CREATE OR REPLACE FUNCTION public.bis_portal_secret_get(p_project_id uuid, p_purpose text DEFAULT 'extension_login')
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_purpose text := lower(trim(COALESCE(p_purpose, '')));
  v_client  uuid;
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

  SELECT p.client_id INTO v_client FROM public.bis_projects p WHERE p.id = p_project_id;
  IF v_client IS NOT NULL THEN
    SELECT s.secret_enc INTO v_enc FROM private.client_portal_secrets s WHERE s.client_id = v_client;
  END IF;
  IF v_enc IS NULL THEN
    SELECT s.secret_enc INTO v_enc FROM private.bis_portal_secrets s WHERE s.project_id = p_project_id;
  END IF;
  IF v_enc IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.portal_secret_access_log (project_id, client_id, action, user_id, via)
  VALUES (p_project_id, v_client, v_purpose, auth.uid(), 'bis_portal_secret_get');
  RETURN extensions.pgp_sym_decrypt(v_enc, private.portal_key());
END;
$$;

REVOKE ALL ON FUNCTION public.client_portal_secret_set(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.client_portal_secret_get(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.client_portal_secret_set(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.client_portal_secret_get(uuid, text) TO authenticated;

-- Copy licence credentials onto the firm. Counts only; never the user id or the password.
DO $$
DECLARE
  v_key            text := private.portal_key();
  v_client         uuid;
  v_plain          text;
  v_first          text;
  v_chosen         text;
  v_conflict       boolean;
  v_copied         integer := 0;
  v_pass_conflicts integer := 0;
  v_user_conflicts integer := 0;
  v_enc            bytea;
BEGIN
  IF v_key IS NULL OR length(v_key) <> 64 THEN
    RAISE EXCEPTION 'portal key missing';
  END IF;

  SELECT count(*) INTO v_user_conflicts
    FROM (
      SELECT p.client_id
        FROM public.bis_projects p
       WHERE p.client_id IS NOT NULL
         AND btrim(COALESCE(p.portal_user_id, '')) <> ''
       GROUP BY p.client_id
      HAVING count(DISTINCT btrim(p.portal_user_id)) > 1
    ) conflicts;

  WITH ranked AS (
    SELECT p.client_id,
           btrim(p.portal_user_id) AS user_id,
           count(*) AS n,
           max(p.updated_at) AS latest
      FROM public.bis_projects p
     WHERE p.client_id IS NOT NULL
       AND btrim(COALESCE(p.portal_user_id, '')) <> ''
     GROUP BY p.client_id, btrim(p.portal_user_id)
  ), picked AS (
    SELECT DISTINCT ON (client_id) client_id, user_id
      FROM ranked
     ORDER BY client_id, n DESC, latest DESC
  )
  UPDATE public.clients c
     SET manak_user_id = picked.user_id
    FROM picked
   WHERE c.id = picked.client_id
     AND btrim(COALESCE(c.manak_user_id, '')) = '';

  FOR v_client IN
    SELECT p.client_id
      FROM public.bis_projects p
      JOIN private.bis_portal_secrets s ON s.project_id = p.id
     WHERE p.client_id IS NOT NULL
     GROUP BY p.client_id
  LOOP
    v_first := NULL;
    v_chosen := NULL;
    v_conflict := false;
    FOR v_plain IN
      SELECT extensions.pgp_sym_decrypt(s.secret_enc, v_key)
        FROM private.bis_portal_secrets s
        JOIN public.bis_projects p ON p.id = s.project_id
       WHERE p.client_id = v_client
       ORDER BY s.updated_at DESC NULLS LAST, p.updated_at DESC NULLS LAST
    LOOP
      IF v_chosen IS NULL THEN
        v_chosen := v_plain;
      END IF;
      IF v_first IS NULL THEN
        v_first := v_plain;
      ELSIF v_plain IS DISTINCT FROM v_first THEN
        v_conflict := true;
      END IF;
    END LOOP;

    IF v_chosen IS NULL OR v_chosen = '' THEN
      CONTINUE;
    END IF;

    v_enc := extensions.pgp_sym_encrypt(v_chosen, v_key, 'cipher-algo=aes256');
    IF extensions.pgp_sym_decrypt(v_enc, v_key) IS DISTINCT FROM v_chosen THEN
      RAISE EXCEPTION 'client portal password verify failed';
    END IF;

    INSERT INTO private.client_portal_secrets (client_id, secret_enc)
    VALUES (v_client, v_enc)
    ON CONFLICT (client_id) DO UPDATE
      SET secret_enc = EXCLUDED.secret_enc, key_name = 'portal_v1', updated_at = now();
    UPDATE public.clients SET manak_password_set = true WHERE id = v_client AND NOT manak_password_set;
    v_copied := v_copied + 1;
    IF v_conflict THEN
      v_pass_conflicts := v_pass_conflicts + 1;
    END IF;
  END LOOP;

  DELETE FROM private.bis_portal_secrets s
   USING public.bis_projects p
   WHERE s.project_id = p.id
     AND p.client_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM private.client_portal_secrets c WHERE c.client_id = p.client_id);

  UPDATE public.bis_projects p
     SET portal_user_id = NULL,
         portal_password_set = false
   WHERE p.client_id IS NOT NULL
     AND (
       EXISTS (
         SELECT 1 FROM public.clients c
          WHERE c.id = p.client_id AND btrim(COALESCE(c.manak_user_id, '')) <> ''
       )
       OR EXISTS (SELECT 1 FROM private.client_portal_secrets s WHERE s.client_id = p.client_id)
     );

  INSERT INTO public.portal_secret_access_log (action, via)
  VALUES ('migrate', 'client manak credentials');

  RAISE NOTICE 'client manak passwords copied: %, password conflicts kept latest: %, user-id conflicts kept most common: %',
    v_copied, v_pass_conflicts, v_user_conflicts;
END $$;

NOTIFY pgrst, 'reload schema';
