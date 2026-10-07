-- Application Details: Inspection Date (application projects).

ALTER TABLE public.bis_projects
  ADD COLUMN IF NOT EXISTS inspection_date date;

COMMENT ON COLUMN public.bis_projects.inspection_date IS
  'Inspection date captured in Application Details for Application projects';
