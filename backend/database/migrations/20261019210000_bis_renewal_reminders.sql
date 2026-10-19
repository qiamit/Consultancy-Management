-- Automatic BIS licence renewal reminder emails (85 / 50 / 10 days before validity).
-- The functions service sends them once a day and records each one here.
--   bis_renewal_reminder_settings: one row; enabled is OFF until an admin turns it on.
--   bis_renewal_reminders: one row per reminder (auto stage or manual send), with the outcome.
--   bis_projects.renewal_reminders_paused: stop reminders for one licence.
-- Idempotent. Apply with npm run db:migrate. Do not edit after it is applied.

CREATE TABLE IF NOT EXISTS public.bis_renewal_reminder_settings (
  id            integer     PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled       boolean     NOT NULL DEFAULT false,
  stages        integer[]   NOT NULL DEFAULT '{85,50,10}',
  send_hour_ist integer     NOT NULL DEFAULT 9 CHECK (send_hour_ist BETWEEN 0 AND 23),
  last_run_on   date,
  updated_by    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at    timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.bis_renewal_reminder_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.bis_renewal_reminder_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bis_renewal_reminder_settings_select ON public.bis_renewal_reminder_settings;
CREATE POLICY bis_renewal_reminder_settings_select ON public.bis_renewal_reminder_settings
  FOR SELECT TO authenticated USING ((SELECT public.app_can_view('/bis/license-renewals')));
DROP POLICY IF EXISTS bis_renewal_reminder_settings_update_admin ON public.bis_renewal_reminder_settings;
CREATE POLICY bis_renewal_reminder_settings_update_admin ON public.bis_renewal_reminder_settings
  FOR UPDATE TO authenticated
  USING ((SELECT public.app_is_admin()))
  WITH CHECK ((SELECT public.app_is_admin()));
REVOKE ALL ON public.bis_renewal_reminder_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.bis_renewal_reminder_settings TO authenticated;
GRANT UPDATE (enabled, stages, send_hour_ist, updated_by, updated_at) ON public.bis_renewal_reminder_settings TO authenticated;
GRANT ALL ON public.bis_renewal_reminder_settings TO service_role;

CREATE TABLE IF NOT EXISTS public.bis_renewal_reminders (
  id            bigserial   PRIMARY KEY,
  project_id    uuid        NOT NULL REFERENCES public.bis_projects(id) ON DELETE CASCADE,
  validity_date date        NOT NULL,
  -- Days-before-validity stage (85 / 50 / 10); 0 for a manual "send now".
  stage         integer     NOT NULL DEFAULT 0,
  status        text        NOT NULL CHECK (status IN ('sending', 'sent', 'failed', 'skipped')),
  attempts      integer     NOT NULL DEFAULT 1,
  recipient     text,
  subject       text,
  error         text,
  resend_id     text,
  sent_by       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
-- One automatic reminder per stage for each validity date (a renewed licence gets a new date, so new reminders).
CREATE UNIQUE INDEX IF NOT EXISTS bis_renewal_reminders_stage_uidx
  ON public.bis_renewal_reminders (project_id, validity_date, stage) WHERE stage > 0;
CREATE INDEX IF NOT EXISTS bis_renewal_reminders_project_idx
  ON public.bis_renewal_reminders (project_id, created_at DESC);

ALTER TABLE public.bis_renewal_reminders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bis_renewal_reminders_select ON public.bis_renewal_reminders;
CREATE POLICY bis_renewal_reminders_select ON public.bis_renewal_reminders
  FOR SELECT TO authenticated USING ((SELECT public.app_can_view('/bis/license-renewals')));
REVOKE ALL ON public.bis_renewal_reminders FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.bis_renewal_reminders TO authenticated;
GRANT ALL ON public.bis_renewal_reminders TO service_role;
REVOKE ALL ON SEQUENCE public.bis_renewal_reminders_id_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.bis_renewal_reminders_id_seq TO service_role;

ALTER TABLE public.bis_projects ADD COLUMN IF NOT EXISTS renewal_reminders_paused boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.bis_projects.renewal_reminders_paused IS
  'No automatic renewal reminder emails for this licence while true.';

NOTIFY pgrst, 'reload schema';
