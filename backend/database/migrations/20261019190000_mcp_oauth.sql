-- MCP server at mcp.qengineering.in (decision #47): OAuth bookkeeping and the MCP audit log.
-- The mcp service is the only writer. It reaches these tables through PostgREST with the
-- service role; RLS is on with no policies, so anon and authenticated see nothing.
-- GoTrue sessions are stored encrypted by the service (AES-256-GCM, key in the Railway
-- variable MCP_TOKEN_KEY); tokens and codes are stored only as SHA-256 hashes.
-- Admins can read mcp_audit_log and see / revoke connections through the RPCs below.
-- Idempotent. Apply with npm run db:migrate. Do not edit after it is applied.

SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.mcp_oauth_clients (
  client_id   text PRIMARY KEY,
  client_info jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mcp_oauth_codes (
  code_hash      text PRIMARY KEY,
  client_id      text NOT NULL REFERENCES public.mcp_oauth_clients(client_id) ON DELETE CASCADE,
  user_id        uuid NOT NULL,
  redirect_uri   text NOT NULL,
  code_challenge text NOT NULL,
  scopes         text[] NOT NULL DEFAULT '{}',
  resource       text,
  session_enc    text NOT NULL,
  expires_at     timestamptz NOT NULL,
  used_at        timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mcp_oauth_tokens (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id          text NOT NULL REFERENCES public.mcp_oauth_clients(client_id) ON DELETE CASCADE,
  user_id            uuid NOT NULL,
  scopes             text[] NOT NULL DEFAULT '{}',
  resource           text,
  access_hash        text NOT NULL UNIQUE,
  access_expires_at  timestamptz NOT NULL,
  refresh_hash       text NOT NULL UNIQUE,
  refresh_expires_at timestamptz NOT NULL,
  session_enc        text NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  last_used_at       timestamptz,
  revoked_at         timestamptz
);
CREATE INDEX IF NOT EXISTS mcp_oauth_tokens_user_idx ON public.mcp_oauth_tokens (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.mcp_audit_log (
  id         bigserial PRIMARY KEY,
  user_id    uuid,
  client_id  text,
  tool       text NOT NULL,
  args       jsonb,
  status     text NOT NULL CHECK (status IN ('ok', 'error', 'denied', 'rate_limited')),
  error      text,
  ms         integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mcp_audit_log_created_idx ON public.mcp_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS mcp_audit_log_user_idx ON public.mcp_audit_log (user_id, created_at DESC);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['mcp_oauth_clients', 'mcp_oauth_codes', 'mcp_oauth_tokens', 'mcp_audit_log'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;
REVOKE ALL ON SEQUENCE public.mcp_audit_log_id_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.mcp_audit_log_id_seq TO service_role;

DROP POLICY IF EXISTS mcp_audit_log_select_admin ON public.mcp_audit_log;
CREATE POLICY mcp_audit_log_select_admin ON public.mcp_audit_log
  FOR SELECT TO authenticated USING ((SELECT public.app_is_admin()));
GRANT SELECT ON public.mcp_audit_log TO authenticated;

-- A user's own live connections (admins see everyone's). No token material is returned.
CREATE OR REPLACE FUNCTION public.mcp_list_connections()
RETURNS TABLE (id uuid, user_id uuid, client_name text, created_at timestamptz, last_used_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT t.id, t.user_id, COALESCE(c.client_info ->> 'client_name', t.client_id), t.created_at, t.last_used_at
    FROM public.mcp_oauth_tokens t
    JOIN public.mcp_oauth_clients c ON c.client_id = t.client_id
   WHERE t.revoked_at IS NULL
     AND t.refresh_expires_at > now()
     AND auth.uid() IS NOT NULL
     AND (t.user_id = auth.uid() OR public.app_is_admin())
   ORDER BY t.created_at DESC;
$$;
REVOKE ALL ON FUNCTION public.mcp_list_connections() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mcp_list_connections() TO authenticated;

-- Disconnect one connection (own, or any for an admin).
CREATE OR REPLACE FUNCTION public.mcp_revoke_connection(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  UPDATE public.mcp_oauth_tokens
     SET revoked_at = now()
   WHERE id = p_id
     AND revoked_at IS NULL
     AND (user_id = auth.uid() OR public.app_is_admin());
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.mcp_revoke_connection(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mcp_revoke_connection(uuid) TO authenticated;

-- A deactivated user loses every MCP connection at once (the GoTrue ban also stops refresh).
CREATE OR REPLACE FUNCTION public.mcp_revoke_on_deactivate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF lower(COALESCE(NEW.status, 'Active')) <> 'active'
     AND lower(COALESCE(OLD.status, 'Active')) = 'active' THEN
    UPDATE public.mcp_oauth_tokens SET revoked_at = now() WHERE user_id = NEW.id AND revoked_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.mcp_revoke_on_deactivate() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_user_profiles_mcp_revoke ON public.user_profiles;
CREATE TRIGGER trg_user_profiles_mcp_revoke
  AFTER UPDATE OF status ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.mcp_revoke_on_deactivate();

NOTIFY pgrst, 'reload schema';
