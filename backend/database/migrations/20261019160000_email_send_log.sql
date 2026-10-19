-- Batch C (settings review 2026-10-19, finding H3, decision #49).
-- email_send_log: every /send-email attempt (sent, failed at Resend, or blocked before sending),
-- written only by the functions service. Admins can read it; the viewer screen comes in Batch D.
-- app_email_quota(): sends in the last hour / day for the per-user limit (60 / 300).
-- Idempotent. Apply with npm run db:migrate. Do not edit after it is applied.

CREATE TABLE IF NOT EXISTS public.email_send_log (
  id               bigserial   PRIMARY KEY,
  user_id          uuid,
  source_path      text,
  to_addrs         text[]      NOT NULL DEFAULT '{}',
  cc_addrs         text[]      NOT NULL DEFAULT '{}',
  bcc_addrs        text[]      NOT NULL DEFAULT '{}',
  subject          text,
  attachment_count integer     NOT NULL DEFAULT 0,
  attachment_bytes bigint      NOT NULL DEFAULT 0,
  status           text        NOT NULL CHECK (status IN ('sent', 'failed', 'blocked')),
  error            text,
  resend_id        text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_send_log_user_created_idx ON public.email_send_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS email_send_log_created_idx ON public.email_send_log (created_at DESC);
COMMENT ON TABLE public.email_send_log IS
  'Batch C: one row per /send-email attempt (sent / failed / blocked). Written by the functions service only; admins can read.';

ALTER TABLE public.email_send_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS email_send_log_select_admin ON public.email_send_log;
CREATE POLICY email_send_log_select_admin ON public.email_send_log
  FOR SELECT TO authenticated USING ((SELECT public.app_is_admin()));
REVOKE ALL ON public.email_send_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.email_send_log TO authenticated;
GRANT ALL ON public.email_send_log TO service_role;
REVOKE ALL ON SEQUENCE public.email_send_log_id_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.email_send_log_id_seq TO service_role;

-- Attempts that reached Resend (sent or failed) count toward the limit; blocked ones do not.
CREATE OR REPLACE FUNCTION public.app_email_quota(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'hour', count(*) FILTER (WHERE created_at > now() - interval '1 hour'),
    'day',  count(*)
  )
    FROM public.email_send_log
   WHERE user_id = p_user_id
     AND status IN ('sent', 'failed')
     AND created_at > now() - interval '1 day';
$$;
REVOKE ALL ON FUNCTION public.app_email_quota(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_email_quota(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
