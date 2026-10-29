-- BIS lists sort by "last edited". A project counts as edited when its own row changes or when any of its
-- module data (Application steps, CMPF tables, charts …) or attached files change, so bis_projects.updated_at
-- follows all of them. audit_row_change ignores updated_at-only updates, so this adds no audit rows.

DROP TRIGGER IF EXISTS bis_projects_touch_updated_at ON public.bis_projects;
CREATE TRIGGER bis_projects_touch_updated_at
  BEFORE UPDATE ON public.bis_projects
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.bis_project_touch_from_child()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.bis_projects
     SET updated_at = now()
   WHERE id = COALESCE(
     CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.bis_project_id END,
     CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.bis_project_id END
   );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS bis_project_module_data_touch_project ON public.bis_project_module_data;
CREATE TRIGGER bis_project_module_data_touch_project
  AFTER INSERT OR UPDATE OR DELETE ON public.bis_project_module_data
  FOR EACH ROW EXECUTE FUNCTION public.bis_project_touch_from_child();

DROP TRIGGER IF EXISTS bis_project_files_touch_project ON public.bis_project_files;
CREATE TRIGGER bis_project_files_touch_project
  AFTER INSERT OR UPDATE OR DELETE ON public.bis_project_files
  FOR EACH ROW EXECUTE FUNCTION public.bis_project_touch_from_child();

CREATE INDEX IF NOT EXISTS bis_projects_updated_at_idx ON public.bis_projects (updated_at DESC);
