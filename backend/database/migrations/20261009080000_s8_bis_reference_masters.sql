-- S8: BIS reference masters. Schemes, offices, and licence statuses.
-- Existing projects stay valid when the new ids are null. Apply when the app is idle.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE TABLE IF NOT EXISTS public.certification_schemes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  licence_prefix text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bis_offices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  office_type text NOT NULL,
  region text,
  city text,
  state text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bis_offices_type_chk CHECK (office_type IN ('HQ', 'RO', 'BO'))
);

CREATE TABLE IF NOT EXISTS public.licence_statuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_certification_schemes_updated_at ON public.certification_schemes;
CREATE TRIGGER trg_certification_schemes_updated_at
  BEFORE UPDATE ON public.certification_schemes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_bis_offices_updated_at ON public.bis_offices;
CREATE TRIGGER trg_bis_offices_updated_at
  BEFORE UPDATE ON public.bis_offices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_licence_statuses_updated_at ON public.licence_statuses;
CREATE TRIGGER trg_licence_statuses_updated_at
  BEFORE UPDATE ON public.licence_statuses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.certification_schemes (code, name, licence_prefix, sort_order) VALUES
  ('scheme-i', 'Scheme-I (ISI)', 'CM/L-', 10),
  ('scheme-ii', 'Scheme-II (CRS)', 'R-', 20),
  ('scheme-iv', 'Scheme-IV', NULL, 30),
  ('scheme-x', 'Scheme-X', NULL, 40),
  ('fmcs', 'FMCS', NULL, 50),
  ('hallmarking', 'Hallmarking', NULL, 60)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.bis_offices (code, name, office_type, region, city, state) VALUES
  ('HQ', 'Bureau of Indian Standards, Manak Bhavan', 'HQ', NULL, 'New Delhi', 'Delhi'),
  ('CRO', 'Central Regional Office', 'RO', 'CRO', 'Delhi', 'Delhi'),
  ('ERO', 'Eastern Regional Office', 'RO', 'ERO', 'Kolkata', 'West Bengal'),
  ('NRO', 'Northern Regional Office', 'RO', 'NRO', 'Chandigarh', 'Chandigarh'),
  ('SRO', 'Southern Regional Office', 'RO', 'SRO', 'Chennai', 'Tamil Nadu'),
  ('WRO', 'Western Regional Office', 'RO', 'WRO', 'Mumbai', 'Maharashtra')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.licence_statuses (code, name, sort_order) VALUES
  ('operative', 'Operative', 10),
  ('deferred', 'Deferred', 20),
  ('under_stop_marking', 'Under Stop Marking', 30),
  ('suspended', 'Suspended', 40),
  ('expired', 'Expired', 50),
  ('cancelled', 'Cancelled', 60)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.bis_projects ADD COLUMN IF NOT EXISTS certification_scheme_id uuid REFERENCES public.certification_schemes(id) ON DELETE SET NULL;
ALTER TABLE public.bis_projects ADD COLUMN IF NOT EXISTS bis_office_id uuid REFERENCES public.bis_offices(id) ON DELETE SET NULL;
ALTER TABLE public.bis_projects ADD COLUMN IF NOT EXISTS licence_status_id uuid REFERENCES public.licence_statuses(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS bis_projects_certification_scheme_id_idx ON public.bis_projects (certification_scheme_id);
CREATE INDEX IF NOT EXISTS bis_projects_bis_office_id_idx ON public.bis_projects (bis_office_id);
CREATE INDEX IF NOT EXISTS bis_projects_licence_status_id_idx ON public.bis_projects (licence_status_id);

ALTER TABLE public.certification_schemes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bis_offices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.licence_statuses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS certification_schemes_select ON public.certification_schemes;
CREATE POLICY certification_schemes_select ON public.certification_schemes
  FOR SELECT TO authenticated
  USING ((SELECT public.app_is_admin()) OR (SELECT public.app_can_view('/bis/projects')));
DROP POLICY IF EXISTS certification_schemes_write ON public.certification_schemes;
CREATE POLICY certification_schemes_write ON public.certification_schemes
  FOR ALL TO authenticated
  USING ((SELECT public.app_is_admin()))
  WITH CHECK ((SELECT public.app_is_admin()));

DROP POLICY IF EXISTS bis_offices_select ON public.bis_offices;
CREATE POLICY bis_offices_select ON public.bis_offices
  FOR SELECT TO authenticated
  USING ((SELECT public.app_is_admin()) OR (SELECT public.app_can_view('/bis/projects')));
DROP POLICY IF EXISTS bis_offices_write ON public.bis_offices;
CREATE POLICY bis_offices_write ON public.bis_offices
  FOR ALL TO authenticated
  USING ((SELECT public.app_is_admin()))
  WITH CHECK ((SELECT public.app_is_admin()));

DROP POLICY IF EXISTS licence_statuses_select ON public.licence_statuses;
CREATE POLICY licence_statuses_select ON public.licence_statuses
  FOR SELECT TO authenticated
  USING ((SELECT public.app_is_admin()) OR (SELECT public.app_can_view('/bis/projects')));
DROP POLICY IF EXISTS licence_statuses_write ON public.licence_statuses;
CREATE POLICY licence_statuses_write ON public.licence_statuses
  FOR ALL TO authenticated
  USING ((SELECT public.app_is_admin()))
  WITH CHECK ((SELECT public.app_is_admin()));

REVOKE ALL ON public.certification_schemes FROM PUBLIC, anon;
REVOKE ALL ON public.bis_offices FROM PUBLIC, anon;
REVOKE ALL ON public.licence_statuses FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.certification_schemes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bis_offices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.licence_statuses TO authenticated;

NOTIFY pgrst, 'reload schema';
