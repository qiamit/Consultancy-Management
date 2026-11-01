-- QE Assistant mail connector (Zoho Mail over IMAP / SMTP): one mailbox per admin. The functions service syncs the
-- INBOX into assistant_mail_messages (read-only copy for the agent: search, read, summarise) and sends replies the
-- admin confirmed. The app password is encrypted with the portal key (private schema), set through a function and
-- never returned to the app; only the service role can decrypt it.

SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.assistant_mail_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE DEFAULT auth.uid(),
  email text NOT NULL CHECK (length(email) BETWEEN 3 AND 200),
  username text NOT NULL CHECK (length(username) BETWEEN 1 AND 200),
  imap_host text NOT NULL DEFAULT 'imap.zoho.in',
  imap_port integer NOT NULL DEFAULT 993 CHECK (imap_port BETWEEN 1 AND 65535),
  smtp_host text NOT NULL DEFAULT 'smtp.zoho.in',
  smtp_port integer NOT NULL DEFAULT 465 CHECK (smtp_port BETWEEN 1 AND 65535),
  enabled boolean NOT NULL DEFAULT true,
  password_set boolean NOT NULL DEFAULT false,
  uid_validity bigint,
  last_uid bigint NOT NULL DEFAULT 0,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS private.assistant_mail_secrets (
  account_id uuid PRIMARY KEY REFERENCES public.assistant_mail_accounts(id) ON DELETE CASCADE,
  secret_enc bytea NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON private.assistant_mail_secrets FROM PUBLIC;

CREATE TABLE IF NOT EXISTS public.assistant_mail_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.assistant_mail_accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  uid bigint NOT NULL,
  message_id text,
  from_addr text,
  to_addr text,
  cc_addr text,
  subject text,
  sent_at timestamptz,
  snippet text,
  body_text text,
  attachments text[],
  is_read boolean NOT NULL DEFAULT false,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, uid)
);
CREATE INDEX IF NOT EXISTS assistant_mail_messages_user_idx ON public.assistant_mail_messages (user_id, sent_at DESC);

-- Admin-only, own rows. The account row is editable by its admin (not password_set / sync state: the service owns
-- those); messages are read-only for the admin (written by the service).
ALTER TABLE public.assistant_mail_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS assistant_mail_accounts_own ON public.assistant_mail_accounts;
CREATE POLICY assistant_mail_accounts_own ON public.assistant_mail_accounts FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()) AND (SELECT public.app_is_admin()))
  WITH CHECK (user_id = (SELECT auth.uid()) AND (SELECT public.app_is_admin()));
REVOKE ALL ON public.assistant_mail_accounts FROM anon, authenticated;
GRANT SELECT, DELETE ON public.assistant_mail_accounts TO authenticated;
GRANT INSERT (email, username, imap_host, imap_port, smtp_host, smtp_port, enabled) ON public.assistant_mail_accounts TO authenticated;
GRANT UPDATE (email, username, imap_host, imap_port, smtp_host, smtp_port, enabled, updated_at) ON public.assistant_mail_accounts TO authenticated;

ALTER TABLE public.assistant_mail_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS assistant_mail_messages_own_read ON public.assistant_mail_messages;
CREATE POLICY assistant_mail_messages_own_read ON public.assistant_mail_messages FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) AND (SELECT public.app_is_admin()));
REVOKE ALL ON public.assistant_mail_messages FROM anon, authenticated;
GRANT SELECT ON public.assistant_mail_messages TO authenticated;

-- Set (or clear with '') the caller's mailbox app password. Never returns it.
CREATE OR REPLACE FUNCTION public.assistant_mail_password_set(p_password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_account uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Only Laboratory Director/Admin can connect a mailbox.' USING ERRCODE = '42501';
  END IF;
  SELECT id INTO v_account FROM public.assistant_mail_accounts WHERE user_id = auth.uid();
  IF v_account IS NULL THEN
    RAISE EXCEPTION 'Save the mailbox details first.' USING ERRCODE = 'P0002';
  END IF;
  IF length(COALESCE(p_password, '')) > 200 THEN
    RAISE EXCEPTION 'Password is too long (max 200 characters).' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(p_password, '') = '' THEN
    DELETE FROM private.assistant_mail_secrets WHERE account_id = v_account;
    UPDATE public.assistant_mail_accounts SET password_set = false, updated_at = now() WHERE id = v_account;
    INSERT INTO public.portal_secret_access_log (action, user_id, via) VALUES ('clear', auth.uid(), 'assistant_mail_password_set');
    RETURN false;
  END IF;
  INSERT INTO private.assistant_mail_secrets (account_id, secret_enc)
  VALUES (v_account, extensions.pgp_sym_encrypt(p_password, private.portal_key(), 'cipher-algo=aes256'))
  ON CONFLICT (account_id) DO UPDATE SET secret_enc = EXCLUDED.secret_enc, updated_at = now();
  -- A new password: let the next sync try again from the stored position.
  UPDATE public.assistant_mail_accounts SET password_set = true, last_error = NULL, updated_at = now() WHERE id = v_account;
  INSERT INTO public.portal_secret_access_log (action, user_id, via) VALUES ('set', auth.uid(), 'assistant_mail_password_set');
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.assistant_mail_password_set(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assistant_mail_password_set(text) TO authenticated;

-- The functions service only (IMAP sync / SMTP send).
CREATE OR REPLACE FUNCTION public.assistant_mail_password_for_service(p_account_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT extensions.pgp_sym_decrypt(s.secret_enc, private.portal_key())
    FROM private.assistant_mail_secrets s
   WHERE s.account_id = p_account_id;
$$;
REVOKE ALL ON FUNCTION public.assistant_mail_password_for_service(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assistant_mail_password_for_service(uuid) TO service_role;

-- Customers never read these tables.
SELECT public.app_apply_customer_lockout();
