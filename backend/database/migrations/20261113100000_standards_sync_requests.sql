-- Standards Library: "Sync Now" from the app.
--
-- The standards folder lives on the owner's Mac (OneDrive), so the server cannot read it. The app only records a
-- request here; the Mac checks every 10 minutes over its SSH connection (standards-sync.sh poll), runs the sync
-- (copy to the server + index only new / changed files) and closes the request with the result. Each check also
-- updates standard_sync_agent.last_seen, so the page can show when the Mac last checked.

CREATE TABLE IF NOT EXISTS public.standard_sync_requests (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  requested_at timestamptz NOT NULL DEFAULT now(),
  requested_by uuid DEFAULT auth.uid(),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'done', 'failed', 'cancelled')),
  picked_at timestamptz,
  finished_at timestamptz,
  message text
);

CREATE INDEX IF NOT EXISTS standard_sync_requests_status_idx ON public.standard_sync_requests (status, id);

ALTER TABLE public.standard_sync_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS standard_sync_requests_staff_read ON public.standard_sync_requests;
CREATE POLICY standard_sync_requests_staff_read ON public.standard_sync_requests FOR SELECT TO authenticated
  USING (NOT (SELECT public.app_is_customer()));

-- One row: the Mac that runs the sync.
CREATE TABLE IF NOT EXISTS public.standard_sync_agent (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  host text NOT NULL DEFAULT '',
  last_seen timestamptz
);

ALTER TABLE public.standard_sync_agent ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS standard_sync_agent_staff_read ON public.standard_sync_agent;
CREATE POLICY standard_sync_agent_staff_read ON public.standard_sync_agent FOR SELECT TO authenticated
  USING (NOT (SELECT public.app_is_customer()));

GRANT SELECT ON public.standard_sync_requests, public.standard_sync_agent TO authenticated;

-- Admin only. A request already waiting or running is returned instead of a second one.
CREATE OR REPLACE FUNCTION public.request_standards_sync()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rid bigint;
BEGIN
  IF NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Only an Admin Can Start a Standards Sync' USING ERRCODE = '42501';
  END IF;
  SELECT id INTO rid FROM public.standard_sync_requests
   WHERE status IN ('pending', 'running') ORDER BY id LIMIT 1;
  IF rid IS NOT NULL THEN
    RETURN rid;
  END IF;
  INSERT INTO public.standard_sync_requests (requested_by) VALUES (auth.uid()) RETURNING id INTO rid;
  RETURN rid;
END;
$$;

-- Admin only: withdraw a request the Mac has not picked up yet.
CREATE OR REPLACE FUNCTION public.cancel_standards_sync(p_id bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Only an Admin Can Cancel a Standards Sync' USING ERRCODE = '42501';
  END IF;
  UPDATE public.standard_sync_requests
     SET status = 'cancelled', finished_at = now(), message = 'Cancelled in the App.'
   WHERE id = p_id AND status = 'pending';
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.request_standards_sync() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_standards_sync(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_standards_sync() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_standards_sync(bigint) TO authenticated;
