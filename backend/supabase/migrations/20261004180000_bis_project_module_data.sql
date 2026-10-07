-- Structured Module Edit payloads per BIS document kind (JSON).

CREATE TABLE IF NOT EXISTS public.bis_project_module_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bis_project_id uuid NOT NULL REFERENCES public.bis_projects(id) ON DELETE CASCADE,
  module_kind text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bis_project_module_data_project_kind_uidx UNIQUE (bis_project_id, module_kind)
);

CREATE INDEX IF NOT EXISTS idx_bis_project_module_data_project
  ON public.bis_project_module_data USING btree (bis_project_id);

ALTER TABLE public.bis_project_module_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bis_project_module_data_authenticated_all ON public.bis_project_module_data;
CREATE POLICY bis_project_module_data_authenticated_all
  ON public.bis_project_module_data
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP TRIGGER IF EXISTS bis_project_module_data_touch_updated_at ON public.bis_project_module_data;
CREATE TRIGGER bis_project_module_data_touch_updated_at
  BEFORE UPDATE ON public.bis_project_module_data
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

COMMENT ON TABLE public.bis_project_module_data IS
  'Editable module payloads for View Documents Module Edit (top management, staff, etc.)';
