-- Security audit M5 + M6 (2026-10-30).
-- M5: the S6 encryption key (Manak passwords, AI model keys, email secrets) moves from the private.app_keys
--     table into Supabase Vault. Vault keeps it encrypted with the server's root key file
--     (/opt/qe/secrets/pgsodium_root.key, mounted into the db container), so a database dump alone can no
--     longer decrypt anything. private.portal_key() reads it from Vault; the app_keys row is removed only
--     after the Vault copy is checked. Where Vault is not installed (local dev) the key stays in app_keys.
-- M6: public.email_accounts.password / oauth tokens / ai_api_key are stored encrypted in
--     private.email_account_secrets. Writes to those columns are encrypted by a trigger and the columns
--     are kept NULL (same pattern as bis_projects.portal_password and ai_models.api_key).
-- Idempotent. Apply with npm run db:migrate. Do not edit after it is applied.

SET LOCAL lock_timeout = '5s';

-- ── M5: key into Vault ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_key   text;
  v_vault text;
BEGIN
  IF to_regclass('vault.decrypted_secrets') IS NULL THEN
    RAISE NOTICE 'Vault not installed: the portal key stays in private.app_keys';
    RETURN;
  END IF;

  SELECT key_hex INTO v_key FROM private.app_keys WHERE name = 'portal_v1';
  SELECT decrypted_secret INTO v_vault FROM vault.decrypted_secrets WHERE name = 'portal_v1';

  IF v_vault IS NULL THEN
    IF v_key IS NULL OR length(v_key) <> 64 THEN
      RAISE EXCEPTION 'M5: portal key missing in both private.app_keys and Vault';
    END IF;
    PERFORM vault.create_secret(v_key, 'portal_v1',
      'S6 encryption key: Manak passwords, AI model keys, email account secrets');
    SELECT decrypted_secret INTO v_vault FROM vault.decrypted_secrets WHERE name = 'portal_v1';
  END IF;

  IF v_key IS NOT NULL AND v_vault IS DISTINCT FROM v_key THEN
    RAISE EXCEPTION 'M5: the Vault copy of the portal key does not match private.app_keys. Nothing changed.';
  END IF;

  EXECUTE $f$
    CREATE OR REPLACE FUNCTION private.portal_key()
    RETURNS text
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = private, pg_temp
    AS $body$
      SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'portal_v1';
    $body$
  $f$;
  REVOKE ALL ON FUNCTION private.portal_key() FROM PUBLIC;

  IF private.portal_key() IS DISTINCT FROM v_vault THEN
    RAISE EXCEPTION 'M5: private.portal_key() does not read the Vault key. Nothing changed.';
  END IF;

  DELETE FROM private.app_keys WHERE name = 'portal_v1';
END $$;

-- ── M6: email account secrets ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_key    text := private.portal_key();
  v_before bigint;
  v_ok     bigint;
BEGIN
  IF to_regclass('public.email_accounts') IS NULL THEN
    RETURN;
  END IF;
  IF v_key IS NULL OR length(v_key) <> 64 THEN
    RAISE EXCEPTION 'M6: portal key missing';
  END IF;

  CREATE TABLE IF NOT EXISTS private.email_account_secrets (
    account_id              uuid PRIMARY KEY
                              REFERENCES public.email_accounts(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    password_enc            bytea,
    oauth_access_token_enc  bytea,
    oauth_refresh_token_enc bytea,
    ai_api_key_enc          bytea,
    updated_at              timestamptz NOT NULL DEFAULT now(),
    updated_by              uuid
  );
  REVOKE ALL ON private.email_account_secrets FROM PUBLIC;

  ALTER TABLE public.email_accounts ADD COLUMN IF NOT EXISTS password_set boolean NOT NULL DEFAULT false;
  COMMENT ON COLUMN public.email_accounts.password_set IS
    'True when an encrypted password exists in private.email_account_secrets. The password itself is never in this table.';
  COMMENT ON COLUMN public.email_accounts.password IS
    'Write-only. A trigger encrypts any value written here into private.email_account_secrets and stores NULL.';

  SELECT count(*) INTO v_before
    FROM public.email_accounts
   WHERE COALESCE(password, '') <> '' OR COALESCE(oauth_access_token, '') <> ''
      OR COALESCE(oauth_refresh_token, '') <> '' OR COALESCE(ai_api_key, '') <> '';

  INSERT INTO private.email_account_secrets
    (account_id, password_enc, oauth_access_token_enc, oauth_refresh_token_enc, ai_api_key_enc)
  SELECT a.id,
         extensions.pgp_sym_encrypt(NULLIF(a.password, ''), v_key, 'cipher-algo=aes256'),
         extensions.pgp_sym_encrypt(NULLIF(a.oauth_access_token, ''), v_key, 'cipher-algo=aes256'),
         extensions.pgp_sym_encrypt(NULLIF(a.oauth_refresh_token, ''), v_key, 'cipher-algo=aes256'),
         extensions.pgp_sym_encrypt(NULLIF(a.ai_api_key, ''), v_key, 'cipher-algo=aes256')
    FROM public.email_accounts a
   WHERE COALESCE(a.password, '') <> '' OR COALESCE(a.oauth_access_token, '') <> ''
      OR COALESCE(a.oauth_refresh_token, '') <> '' OR COALESCE(a.ai_api_key, '') <> ''
  ON CONFLICT (account_id) DO UPDATE SET
    password_enc            = COALESCE(EXCLUDED.password_enc, private.email_account_secrets.password_enc),
    oauth_access_token_enc  = COALESCE(EXCLUDED.oauth_access_token_enc, private.email_account_secrets.oauth_access_token_enc),
    oauth_refresh_token_enc = COALESCE(EXCLUDED.oauth_refresh_token_enc, private.email_account_secrets.oauth_refresh_token_enc),
    ai_api_key_enc          = COALESCE(EXCLUDED.ai_api_key_enc, private.email_account_secrets.ai_api_key_enc),
    updated_at              = now();

  -- Every plain value must decrypt back exactly before it is removed.
  SELECT count(*) INTO v_ok
    FROM public.email_accounts a
    JOIN private.email_account_secrets s ON s.account_id = a.id
   WHERE (COALESCE(a.password, '') <> '' OR COALESCE(a.oauth_access_token, '') <> ''
          OR COALESCE(a.oauth_refresh_token, '') <> '' OR COALESCE(a.ai_api_key, '') <> '')
     AND (COALESCE(a.password, '') = '' OR extensions.pgp_sym_decrypt(s.password_enc, v_key) = a.password)
     AND (COALESCE(a.oauth_access_token, '') = ''
          OR extensions.pgp_sym_decrypt(s.oauth_access_token_enc, v_key) = a.oauth_access_token)
     AND (COALESCE(a.oauth_refresh_token, '') = ''
          OR extensions.pgp_sym_decrypt(s.oauth_refresh_token_enc, v_key) = a.oauth_refresh_token)
     AND (COALESCE(a.ai_api_key, '') = '' OR extensions.pgp_sym_decrypt(s.ai_api_key_enc, v_key) = a.ai_api_key);

  IF v_ok <> v_before THEN
    RAISE EXCEPTION 'M6: email secret backfill check failed: % of % rows verified. Nothing changed.', v_ok, v_before;
  END IF;

  UPDATE public.email_accounts a
     SET password = NULL, oauth_access_token = NULL, oauth_refresh_token = NULL, ai_api_key = NULL,
         password_set = s.password_enc IS NOT NULL
    FROM private.email_account_secrets s
   WHERE s.account_id = a.id;
END $$;

CREATE OR REPLACE FUNCTION public.email_accounts_secrets_shim()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_key text;
BEGIN
  IF COALESCE(NEW.password, '') = '' AND COALESCE(NEW.oauth_access_token, '') = ''
     AND COALESCE(NEW.oauth_refresh_token, '') = '' AND COALESCE(NEW.ai_api_key, '') = '' THEN
    NEW.password := NULL; NEW.oauth_access_token := NULL; NEW.oauth_refresh_token := NULL; NEW.ai_api_key := NULL;
    RETURN NEW;
  END IF;

  v_key := private.portal_key();
  INSERT INTO private.email_account_secrets
    (account_id, password_enc, oauth_access_token_enc, oauth_refresh_token_enc, ai_api_key_enc, updated_by)
  VALUES (NEW.id,
          extensions.pgp_sym_encrypt(NULLIF(NEW.password, ''), v_key, 'cipher-algo=aes256'),
          extensions.pgp_sym_encrypt(NULLIF(NEW.oauth_access_token, ''), v_key, 'cipher-algo=aes256'),
          extensions.pgp_sym_encrypt(NULLIF(NEW.oauth_refresh_token, ''), v_key, 'cipher-algo=aes256'),
          extensions.pgp_sym_encrypt(NULLIF(NEW.ai_api_key, ''), v_key, 'cipher-algo=aes256'),
          auth.uid())
  ON CONFLICT (account_id) DO UPDATE SET
    password_enc            = COALESCE(EXCLUDED.password_enc, private.email_account_secrets.password_enc),
    oauth_access_token_enc  = COALESCE(EXCLUDED.oauth_access_token_enc, private.email_account_secrets.oauth_access_token_enc),
    oauth_refresh_token_enc = COALESCE(EXCLUDED.oauth_refresh_token_enc, private.email_account_secrets.oauth_refresh_token_enc),
    ai_api_key_enc          = COALESCE(EXCLUDED.ai_api_key_enc, private.email_account_secrets.ai_api_key_enc),
    updated_at              = now(),
    updated_by              = EXCLUDED.updated_by;

  IF COALESCE(NEW.password, '') <> '' THEN
    NEW.password_set := true;
  END IF;
  NEW.password := NULL; NEW.oauth_access_token := NULL; NEW.oauth_refresh_token := NULL; NEW.ai_api_key := NULL;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.email_accounts_secrets_shim() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF to_regclass('public.email_accounts') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS email_accounts_secrets_shim ON public.email_accounts;
    -- On INSERT the account row does not exist yet; the secrets table's foreign key is deferred to commit.
    CREATE TRIGGER email_accounts_secrets_shim
      BEFORE INSERT OR UPDATE OF password, oauth_access_token, oauth_refresh_token, ai_api_key
      ON public.email_accounts
      FOR EACH ROW EXECUTE FUNCTION public.email_accounts_secrets_shim();
  END IF;
END $$;
