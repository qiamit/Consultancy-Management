-- S10: Laboratory master. Client rows are kept. Apply when the app is idle.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE TABLE IF NOT EXISTS public.laboratories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_client_id uuid UNIQUE REFERENCES public.clients(id) ON DELETE SET NULL,
  name text NOT NULL,
  lab_type text NOT NULL DEFAULT 'BIS-recognised OSL',
  osl_code text,
  bis_recognition_no text,
  recognised_from date,
  recognised_upto date,
  nabl_cert_no text,
  nabl_valid_upto date,
  address text,
  state text,
  contact_name text,
  email text,
  mobile text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT laboratories_type_chk CHECK (
    lab_type IN ('BIS lab', 'BIS-recognised OSL', 'Empanelled', 'In-house', 'NABL', 'Calibration')
  )
);

CREATE INDEX IF NOT EXISTS laboratories_name_lower_idx ON public.laboratories (lower(name));

DROP TRIGGER IF EXISTS trg_laboratories_updated_at ON public.laboratories;
CREATE TRIGGER trg_laboratories_updated_at
  BEFORE UPDATE ON public.laboratories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.laboratories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS laboratories_select ON public.laboratories;
CREATE POLICY laboratories_select ON public.laboratories
  FOR SELECT TO authenticated
  USING (
    (SELECT public.app_can_view('/masters/laboratories'))
    OR (SELECT public.app_can_view('/bis/projects'))
  );
DROP POLICY IF EXISTS laboratories_insert ON public.laboratories;
CREATE POLICY laboratories_insert ON public.laboratories
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.app_can_edit('/masters/laboratories')));
DROP POLICY IF EXISTS laboratories_update ON public.laboratories;
CREATE POLICY laboratories_update ON public.laboratories
  FOR UPDATE TO authenticated
  USING ((SELECT public.app_can_edit('/masters/laboratories')))
  WITH CHECK ((SELECT public.app_can_edit('/masters/laboratories')));
DROP POLICY IF EXISTS laboratories_delete ON public.laboratories;
CREATE POLICY laboratories_delete ON public.laboratories
  FOR DELETE TO authenticated USING ((SELECT public.app_is_admin()));

REVOKE ALL ON public.laboratories FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.laboratories TO authenticated;

INSERT INTO public.laboratories (
  legacy_client_id, name, lab_type, address, state, email, mobile
)
SELECT
  c.id,
  c.company_name,
  CASE
    WHEN c.company_type = 'Calibration Laboratory' THEN 'Calibration'
    ELSE 'BIS-recognised OSL'
  END,
  c.address,
  c.state,
  c.email,
  c.mobile
FROM public.clients c
WHERE c.archived_at IS NULL
  AND c.company_name IS NOT NULL
  AND btrim(c.company_name) <> ''
  AND c.company_type IN ('Testing Laboratory', 'Calibration Laboratory')
  AND NOT EXISTS (
    SELECT 1 FROM public.laboratories l WHERE l.legacy_client_id = c.id
  );

NOTIFY pgrst, 'reload schema';
