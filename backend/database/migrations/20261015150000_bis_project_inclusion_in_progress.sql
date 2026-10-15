-- Mark an existing BIS license row while an Inclusion workflow is active.
-- Older Inclusion rows are retained in the Inclusion work list, but are not
-- treated as separate licenses in the general license registers.
ALTER TABLE public.bis_projects
  ADD COLUMN IF NOT EXISTS inclusion_in_progress boolean NOT NULL DEFAULT false;
ALTER TABLE public.bis_projects
  ADD COLUMN IF NOT EXISTS inclusion_scope_draft text;

UPDATE public.bis_projects
SET inclusion_in_progress = true
WHERE lower(coalesce(project_kind, '')) = 'inclusion'
  AND inclusion_in_progress IS DISTINCT FROM true;

NOTIFY pgrst, 'reload schema';
