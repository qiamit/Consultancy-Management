ALTER TABLE public.bis_projects
  ADD COLUMN IF NOT EXISTS installed_capacity text,
  ADD COLUMN IF NOT EXISTS actual_capacity text,
  ADD COLUMN IF NOT EXISTS production_rate text,
  ADD COLUMN IF NOT EXISTS production_value text,
  ADD COLUMN IF NOT EXISTS production_unit text;
