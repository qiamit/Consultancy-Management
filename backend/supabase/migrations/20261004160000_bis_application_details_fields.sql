-- Application Details module fields on bis_projects (View Documents → Application Details).

ALTER TABLE public.bis_projects
  ADD COLUMN IF NOT EXISTS application_process text,
  ADD COLUMN IF NOT EXISTS application_number text,
  ADD COLUMN IF NOT EXISTS application_date date,
  ADD COLUMN IF NOT EXISTS granted_date date,
  ADD COLUMN IF NOT EXISTS branch_name text,
  ADD COLUMN IF NOT EXISTS branch_state text,
  ADD COLUMN IF NOT EXISTS branch_head_name text,
  ADD COLUMN IF NOT EXISTS branch_head_designation text,
  ADD COLUMN IF NOT EXISTS inspection_officer_name text,
  ADD COLUMN IF NOT EXISTS inspection_officer_designation text,
  ADD COLUMN IF NOT EXISTS dealing_officer_name text,
  ADD COLUMN IF NOT EXISTS dealing_officer_designation text,
  ADD COLUMN IF NOT EXISTS type_of_inspection text;

COMMENT ON COLUMN public.bis_projects.application_process IS
  'simplified | normal — default simplified in app UI';
COMMENT ON COLUMN public.bis_projects.application_number IS
  'Digits / suffix for CM/A- display prefix';
