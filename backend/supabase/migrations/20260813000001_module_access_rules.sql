-- Configurable Module Access matrix (Laboratory Director).
-- subject_type: division | department | designation | user
-- access_level: none | view | edit

CREATE TABLE IF NOT EXISTS public.module_access_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type text NOT NULL
    CHECK (subject_type IN ('division', 'department', 'designation', 'user')),
  subject_key text NOT NULL,
  subject_label text NOT NULL DEFAULT '',
  module_key text NOT NULL,
  access_level text NOT NULL DEFAULT 'none'
    CHECK (access_level IN ('none', 'view', 'edit')),
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT module_access_rules_subject_module_uq
    UNIQUE (subject_type, subject_key, module_key)
);

CREATE INDEX IF NOT EXISTS module_access_rules_subject_idx
  ON public.module_access_rules (subject_type, subject_key);

CREATE INDEX IF NOT EXISTS module_access_rules_module_idx
  ON public.module_access_rules (module_key);

COMMENT ON TABLE public.module_access_rules IS
  'Laboratory Director module permissions by division / department / designation / user.';

COMMENT ON COLUMN public.module_access_rules.subject_key IS
  'Normalized match key: label for division/department/designation, auth user id for user.';

COMMENT ON COLUMN public.module_access_rules.module_key IS
  'App route path key, e.g. /samples/receiving';

ALTER TABLE public.module_access_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lims_module_access_rules_select ON public.module_access_rules;
CREATE POLICY lims_module_access_rules_select
  ON public.module_access_rules
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS lims_module_access_rules_insert ON public.module_access_rules;
CREATE POLICY lims_module_access_rules_insert
  ON public.module_access_rules
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS lims_module_access_rules_update ON public.module_access_rules;
CREATE POLICY lims_module_access_rules_update
  ON public.module_access_rules
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS lims_module_access_rules_delete ON public.module_access_rules;
CREATE POLICY lims_module_access_rules_delete
  ON public.module_access_rules
  FOR DELETE
  TO authenticated
  USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.module_access_rules TO authenticated;
