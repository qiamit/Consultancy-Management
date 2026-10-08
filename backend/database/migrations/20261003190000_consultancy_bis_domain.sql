-- Consultancy Pro domain tables (BIS operations) on Railway Postgres / GoTrue auth.

DO $$ BEGIN
  CREATE TYPE public.bis_project_kind AS ENUM (
    'new_license',
    'renewal',
    'inclusion',
    'maintenance'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.project_status AS ENUM (
    'lead',
    'in_progress',
    'submitted',
    'completed',
    'on_hold',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.bis_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients (id) ON DELETE SET NULL,
  project_kind public.bis_project_kind NOT NULL DEFAULT 'new_license',
  title text NOT NULL,
  status public.project_status NOT NULL DEFAULT 'lead',
  license_number text,
  start_date date,
  target_date date,
  notes text,
  is_code_id uuid REFERENCES public.is_codes (id) ON DELETE SET NULL,
  cm_l_digits text,
  license_validity_date date,
  case_handled_by text,
  case_referred_by text,
  billing_amount numeric(14, 2) NOT NULL DEFAULT 0,
  billing_frequency text NOT NULL DEFAULT 'Yearly',
  portal_user_id text,
  portal_password text,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bis_projects_client_id_idx ON public.bis_projects (client_id);
CREATE INDEX IF NOT EXISTS bis_projects_created_at_idx ON public.bis_projects (created_at DESC);

CREATE TABLE IF NOT EXISTS public.bis_new_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients (id) ON DELETE SET NULL,
  project_kind text NOT NULL DEFAULT 'application',
  title text NOT NULL,
  status public.project_status NOT NULL DEFAULT 'in_progress',
  license_number text,
  start_date date,
  target_date date,
  notes text,
  is_code_id uuid REFERENCES public.is_codes (id) ON DELETE SET NULL,
  cm_l_digits text,
  license_validity_date date,
  case_handled_by text NOT NULL DEFAULT 'Amit Kumar',
  case_referred_by text NOT NULL DEFAULT 'QE',
  billing_amount numeric(14, 2) NOT NULL DEFAULT 0,
  billing_frequency text NOT NULL DEFAULT 'Yearly',
  portal_user_id text,
  portal_password text,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bis_new_applications_client_id_idx ON public.bis_new_applications (client_id);
CREATE INDEX IF NOT EXISTS bis_new_applications_created_at_idx ON public.bis_new_applications (created_at DESC);

CREATE TABLE IF NOT EXISTS public.company_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  company_name text DEFAULT 'Q Engineering',
  address text,
  gst_number text,
  phone text,
  email text DEFAULT 'info@qengineering.in',
  logo_path text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.company_settings (id, company_name, email)
VALUES (1, 'Q Engineering', 'info@qengineering.in')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.app_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  site_title text NOT NULL DEFAULT 'Consultancy Pro',
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.app_settings (id, site_title)
VALUES (1, 'Consultancy Pro')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.bis_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bis_new_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS consultancy_bis_projects_all ON public.bis_projects;
CREATE POLICY consultancy_bis_projects_all
  ON public.bis_projects FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS consultancy_bis_new_applications_all ON public.bis_new_applications;
CREATE POLICY consultancy_bis_new_applications_all
  ON public.bis_new_applications FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS consultancy_company_settings_all ON public.company_settings;
CREATE POLICY consultancy_company_settings_all
  ON public.company_settings FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS consultancy_app_settings_all ON public.app_settings;
CREATE POLICY consultancy_app_settings_all
  ON public.app_settings FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
