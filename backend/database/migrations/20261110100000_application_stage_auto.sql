-- Application stage (BIS New Application list): the stages in order, the early ones set by the app itself.
--   Under Preparation → Test Request Submitted → Test Report Uploaded → Application Submitted  (automatic)
--   → Query Raised by BIS / Closure Notice Issued → Application Scrutinized → Inspection Scheduled → Inspection Done
--                                                                                                  (set by hand)
-- The automatic stages come from the application's own data:
--   Test Request Submitted: a sample of OSL Sample Requirements has its Manak Test Request PDF.
--   Test Report Uploaded:   every sample with a Test Request also has its Test Report.
--   Application Submitted:  the application has its Manak application number.
-- A stage only moves forward by itself: a stage set by hand that is later in the order is kept.

-- The allowed stages (the live database has a check with the five old ones), and the old names of the same stages.
ALTER TABLE public.bis_projects DROP CONSTRAINT IF EXISTS bis_projects_application_stage_ck;
UPDATE public.bis_projects SET application_stage = 'Test Request Submitted' WHERE application_stage = 'Test Request Done';
UPDATE public.bis_projects SET application_stage = 'Test Report Uploaded' WHERE application_stage = 'Report Uploaded';
UPDATE public.bis_projects SET application_stage = 'Under Preparation' WHERE coalesce(trim(application_stage), '') = '';
ALTER TABLE public.bis_projects ADD CONSTRAINT bis_projects_application_stage_ck CHECK (
  application_stage IN (
    'Under Preparation', 'Test Request Submitted', 'Test Report Uploaded', 'Application Submitted',
    'Query Raised by BIS', 'Closure Notice Issued', 'Application Scrutinized', 'Inspection Scheduled',
    'Inspection Done'
  )
) NOT VALID;
ALTER TABLE public.bis_projects VALIDATE CONSTRAINT bis_projects_application_stage_ck;

CREATE OR REPLACE FUNCTION public.bis_application_stage_rank(p_stage text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT coalesce(
    array_position(
      ARRAY[
        'Under Preparation', 'Test Request Submitted', 'Test Report Uploaded', 'Application Submitted',
        'Query Raised by BIS', 'Closure Notice Issued', 'Application Scrutinized', 'Inspection Scheduled',
        'Inspection Done'
      ]::text[],
      p_stage
    ),
    0
  );
$$;

-- The stage the application's data shows (null when it shows none).
CREATE OR REPLACE FUNCTION public.bis_auto_application_stage(p_project_id uuid, p_application_number text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH samples AS (
    SELECT
      coalesce(r->>'testRequestStoragePath', '') <> '' AS has_request,
      coalesce(r->>'testReportStoragePath', '') <> '' AS has_report
    FROM public.bis_project_module_data m,
      jsonb_array_elements(CASE WHEN jsonb_typeof(m.payload->'rows') = 'array' THEN m.payload->'rows' ELSE '[]'::jsonb END) r
    WHERE m.bis_project_id = p_project_id
      AND m.module_kind = 'osl-sample-requirements'
  )
  SELECT CASE
    WHEN coalesce(regexp_replace(p_application_number, '\D', '', 'g'), '') <> '' THEN 'Application Submitted'
    WHEN NOT EXISTS (SELECT 1 FROM samples WHERE has_request) THEN NULL
    WHEN NOT EXISTS (SELECT 1 FROM samples WHERE has_request AND NOT has_report) THEN 'Test Report Uploaded'
    ELSE 'Test Request Submitted'
  END;
$$;

REVOKE ALL ON FUNCTION public.bis_auto_application_stage(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bis_application_stage_rank(text) TO authenticated;

-- Every save of an application (and every save of its modules, which touches the application) moves the stage forward
-- to what its data shows.
CREATE OR REPLACE FUNCTION public.bis_projects_advance_stage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auto text;
BEGIN
  IF lower(coalesce(NEW.project_kind, '')) <> 'application' THEN
    RETURN NEW;
  END IF;
  NEW.application_stage := coalesce(nullif(trim(NEW.application_stage), ''), 'Under Preparation');
  IF NEW.application_stage = 'Test Request Done' THEN NEW.application_stage := 'Test Request Submitted'; END IF;
  IF NEW.application_stage = 'Report Uploaded' THEN NEW.application_stage := 'Test Report Uploaded'; END IF;
  v_auto := public.bis_auto_application_stage(NEW.id, NEW.application_number);
  IF v_auto IS NOT NULL AND public.bis_application_stage_rank(v_auto) > public.bis_application_stage_rank(NEW.application_stage) THEN
    NEW.application_stage := v_auto;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bis_projects_advance_stage ON public.bis_projects;
CREATE TRIGGER bis_projects_advance_stage
  BEFORE INSERT OR UPDATE ON public.bis_projects
  FOR EACH ROW EXECUTE FUNCTION public.bis_projects_advance_stage();

-- Applications whose data is already further than their stage (no updated_at change: the list sorts by it).
ALTER TABLE public.bis_projects DISABLE TRIGGER bis_projects_touch_updated_at;
UPDATE public.bis_projects p
   SET application_stage = a.stage
  FROM (
    SELECT id, public.bis_auto_application_stage(id, application_number) AS stage, application_stage
    FROM public.bis_projects
    WHERE lower(coalesce(project_kind, '')) = 'application'
  ) a
 WHERE p.id = a.id
   AND a.stage IS NOT NULL
   AND public.bis_application_stage_rank(a.stage) > public.bis_application_stage_rank(a.application_stage);
ALTER TABLE public.bis_projects ENABLE TRIGGER bis_projects_touch_updated_at;
