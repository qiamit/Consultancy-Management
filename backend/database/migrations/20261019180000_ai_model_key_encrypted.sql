-- Batch D (settings review 2026-10-19, finding L6, decision #50).
-- AI model API keys are stored encrypted with the S6 portal key in private.ai_model_secrets.
-- public.ai_models.api_key is always NULL; ai_models.api_key_set says whether a key exists.
-- Admins enter the key through the api_key column (a shim trigger encrypts and blanks it)
-- and can reveal it with ai_model_key_reveal (logged). Only the functions service
-- (service_role) reads it for QE Assistant through ai_model_key_for_service.
-- Idempotent. Apply with npm run db:migrate. Do not edit after it is applied.

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.ai_models ADD COLUMN IF NOT EXISTS api_key_set boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.ai_models.api_key_set IS
  'True when an encrypted API key exists in private.ai_model_secrets. The key itself is never in this table.';
COMMENT ON COLUMN public.ai_models.api_key IS
  'Write-only. A trigger encrypts any value written here into private.ai_model_secrets and stores NULL.';

CREATE TABLE IF NOT EXISTS private.ai_model_secrets (
  model_id   uuid PRIMARY KEY REFERENCES public.ai_models(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  secret_enc bytea NOT NULL,
  key_name   text NOT NULL DEFAULT 'portal_v1',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
REVOKE ALL ON private.ai_model_secrets FROM PUBLIC;

ALTER TABLE public.portal_secret_access_log ADD COLUMN IF NOT EXISTS ai_model_id uuid;

-- Move existing plain-text keys before the trigger exists.
INSERT INTO private.ai_model_secrets (model_id, secret_enc)
SELECT m.id, extensions.pgp_sym_encrypt(trim(m.api_key), private.portal_key(), 'cipher-algo=aes256')
  FROM public.ai_models m
 WHERE COALESCE(trim(m.api_key), '') <> ''
ON CONFLICT (model_id) DO UPDATE
  SET secret_enc = EXCLUDED.secret_enc, key_name = 'portal_v1', updated_at = now();
UPDATE public.ai_models m
   SET api_key = NULL,
       api_key_set = EXISTS (SELECT 1 FROM private.ai_model_secrets s WHERE s.model_id = m.id)
 WHERE m.api_key IS NOT NULL
    OR m.api_key_set IS DISTINCT FROM EXISTS (SELECT 1 FROM private.ai_model_secrets s WHERE s.model_id = m.id);

-- A non-empty api_key is encrypted and replaced by NULL. NULL or blank keeps the stored key.
CREATE OR REPLACE FUNCTION public.ai_models_api_key_shim()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF COALESCE(trim(NEW.api_key), '') <> '' THEN
    IF length(NEW.api_key) > 1000 THEN
      RAISE EXCEPTION 'API key is too long (max 1000 characters).' USING ERRCODE = '22023';
    END IF;
    INSERT INTO private.ai_model_secrets (model_id, secret_enc, updated_by)
    VALUES (NEW.id, extensions.pgp_sym_encrypt(trim(NEW.api_key), private.portal_key(), 'cipher-algo=aes256'), auth.uid())
    ON CONFLICT (model_id) DO UPDATE
      SET secret_enc = EXCLUDED.secret_enc, key_name = 'portal_v1', updated_at = now(), updated_by = EXCLUDED.updated_by;
    NEW.api_key_set := true;
    INSERT INTO public.portal_secret_access_log (ai_model_id, action, user_id, via)
    VALUES (NEW.id, 'set', auth.uid(), 'ai_models.api_key column');
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.api_key_set := OLD.api_key_set;
  ELSE
    NEW.api_key_set := false;
  END IF;
  NEW.api_key := NULL;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.ai_models_api_key_shim() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_ai_models_api_key_shim ON public.ai_models;
CREATE TRIGGER trg_ai_models_api_key_shim
  BEFORE INSERT OR UPDATE ON public.ai_models
  FOR EACH ROW EXECUTE FUNCTION public.ai_models_api_key_shim();

-- Admin View in Settings → AI. Logged and rate limited like portal passwords.
CREATE OR REPLACE FUNCTION public.ai_model_key_reveal(p_model_id uuid)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_enc    bytea;
  v_recent integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Only admins can view AI model API keys.' USING ERRCODE = '42501';
  END IF;
  SELECT count(*) INTO v_recent
    FROM public.portal_secret_access_log
   WHERE user_id = auth.uid() AND action = 'reveal' AND at > now() - interval '10 minutes';
  IF v_recent >= 30 THEN
    RAISE EXCEPTION 'Too many key requests. Try again in a few minutes.' USING ERRCODE = '54000';
  END IF;
  SELECT s.secret_enc INTO v_enc FROM private.ai_model_secrets s WHERE s.model_id = p_model_id;
  IF v_enc IS NULL THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.portal_secret_access_log (ai_model_id, action, user_id, via)
  VALUES (p_model_id, 'reveal', auth.uid(), 'ai_model_key_reveal');
  RETURN extensions.pgp_sym_decrypt(v_enc, private.portal_key());
END;
$$;
REVOKE ALL ON FUNCTION public.ai_model_key_reveal(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_model_key_reveal(uuid) TO authenticated;

-- QE Assistant (functions service, service_role only).
CREATE OR REPLACE FUNCTION public.ai_model_key_for_service(p_model_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT extensions.pgp_sym_decrypt(s.secret_enc, private.portal_key())
    FROM private.ai_model_secrets s
   WHERE s.model_id = p_model_id;
$$;
REVOKE ALL ON FUNCTION public.ai_model_key_for_service(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_model_key_for_service(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
