-- AI usage log (owner, 21 Nov 2026: the Anthropic credit ran out overnight and nothing in the app showed where the
-- tokens went). One row per call to the AI provider: who, which page, which model, tokens in / out, time, ok or
-- error. No question or answer text is kept. Written by the functions service (service role); admins read it.

CREATE TABLE IF NOT EXISTS public.ai_usage_log (
  id            bigserial PRIMARY KEY,
  created_at    timestamptz NOT NULL DEFAULT now(),
  user_id       uuid,
  page          text,
  provider      text,
  model_id      text,
  agent         boolean NOT NULL DEFAULT false,
  input_tokens  integer,
  output_tokens integer,
  ms            integer,
  status        text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'error')),
  error         text
);
CREATE INDEX IF NOT EXISTS ai_usage_log_created_idx ON public.ai_usage_log (created_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_log_model_idx ON public.ai_usage_log (model_id, created_at DESC);

ALTER TABLE public.ai_usage_log ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.ai_usage_log TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.ai_usage_log_id_seq TO service_role;

DROP POLICY IF EXISTS ai_usage_log_select_admin ON public.ai_usage_log;
CREATE POLICY ai_usage_log_select_admin ON public.ai_usage_log
  FOR SELECT TO authenticated USING (public.app_is_admin());
GRANT SELECT ON public.ai_usage_log TO authenticated;
