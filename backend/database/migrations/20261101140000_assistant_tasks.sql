-- QE Assistant (Admin Agent) scheduled tasks: an admin asks the agent to do something once or on a schedule
-- ("every morning at 9, list the licences due this week"). The functions service runs due tasks read-only and
-- stores each run; changes the run prepares wait as proposals for the admin's Confirm in the app. Results are
-- shown in the assistant and, when notify_email is set, emailed to the admin.

CREATE TABLE IF NOT EXISTS public.assistant_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  instruction text NOT NULL CHECK (length(instruction) BETWEEN 1 AND 4000),
  -- once: run_at; daily: time_of_day (HH:MM, IST); weekly: weekdays (0 = Sunday) + time_of_day; hourly: every_hours.
  schedule_kind text NOT NULL CHECK (schedule_kind IN ('once', 'daily', 'weekly', 'hourly')),
  run_at timestamptz,
  time_of_day text CHECK (time_of_day IS NULL OR time_of_day ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  weekdays smallint[],
  every_hours smallint CHECK (every_hours IS NULL OR every_hours BETWEEN 1 AND 168),
  next_run_at timestamptz,
  enabled boolean NOT NULL DEFAULT true,
  notify_email text,
  last_run_at timestamptz,
  last_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assistant_tasks_due_idx ON public.assistant_tasks (next_run_at) WHERE enabled;
CREATE INDEX IF NOT EXISTS assistant_tasks_user_idx ON public.assistant_tasks (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.assistant_task_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.assistant_tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'ok', 'error')),
  output text,
  -- Steps taken and proposals waiting for Confirm (same shape as an Admin Agent answer).
  agent jsonb,
  emailed boolean NOT NULL DEFAULT false,
  seen boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS assistant_task_runs_user_idx ON public.assistant_task_runs (user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS assistant_task_runs_task_idx ON public.assistant_task_runs (task_id, started_at DESC);

-- Admin-only: own rows. Runs are written by the functions service (service role); the admin reads them and marks
-- them seen.
ALTER TABLE public.assistant_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS assistant_tasks_own ON public.assistant_tasks;
CREATE POLICY assistant_tasks_own ON public.assistant_tasks FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()) AND (SELECT public.app_is_admin()))
  WITH CHECK (user_id = (SELECT auth.uid()) AND (SELECT public.app_is_admin()));
REVOKE ALL ON public.assistant_tasks FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assistant_tasks TO authenticated;

ALTER TABLE public.assistant_task_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS assistant_task_runs_own_read ON public.assistant_task_runs;
CREATE POLICY assistant_task_runs_own_read ON public.assistant_task_runs FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) AND (SELECT public.app_is_admin()));
DROP POLICY IF EXISTS assistant_task_runs_own_seen ON public.assistant_task_runs;
CREATE POLICY assistant_task_runs_own_seen ON public.assistant_task_runs FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()) AND (SELECT public.app_is_admin()))
  WITH CHECK (user_id = (SELECT auth.uid()) AND (SELECT public.app_is_admin()));
-- Default privileges may grant everything to authenticated: take it all back, then grant only reads.
REVOKE ALL ON public.assistant_task_runs FROM anon, authenticated;
GRANT SELECT ON public.assistant_task_runs TO authenticated;
-- The admin may only mark a run seen and record which of its proposed changes they confirmed (agent); everything
-- else is written by the service.
GRANT UPDATE (seen, agent) ON public.assistant_task_runs TO authenticated;

-- Customers never read these tables.
SELECT public.app_apply_customer_lockout();
