-- MCP edit tools (decision #47): every edit is previewed first and applied only with the
-- single-use confirm token from that preview. The mcp service (service role) is the only
-- reader and writer; the token is stored as a SHA-256 hash and lives 5 minutes.
-- Idempotent. Apply with npm run db:migrate. Do not edit after it is applied.

SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.mcp_pending_changes (
  token_hash  text PRIMARY KEY,
  user_id     uuid NOT NULL,
  client_id   text NOT NULL,
  kind        text NOT NULL,
  target_id   uuid NOT NULL,
  changes     jsonb NOT NULL,
  before      jsonb NOT NULL,
  summary     text NOT NULL,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mcp_pending_changes_user_idx ON public.mcp_pending_changes (user_id, created_at DESC);

ALTER TABLE public.mcp_pending_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mcp_pending_changes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.mcp_pending_changes TO service_role;

NOTIFY pgrst, 'reload schema';
