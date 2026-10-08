-- Compatibility layer: add LIMS-shaped tables/columns onto existing Consultancy Pro Postgres.
-- Safe to re-run (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Clients: columns expected by LIMS Client Master UI ───────────────────────
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS mobile text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS country_code text DEFAULT '+91';
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS district text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS remark text;

UPDATE public.clients
SET mobile = COALESCE(NULLIF(mobile, ''), NULLIF(phone, ''))
WHERE mobile IS NULL OR mobile = '';

UPDATE public.clients
SET remark = COALESCE(NULLIF(remark, ''), NULLIF(notes, ''))
WHERE remark IS NULL OR remark = '';

UPDATE public.clients
SET district = COALESCE(NULLIF(district, ''), NULLIF(city, ''))
WHERE district IS NULL OR district = '';

-- ── user_profiles (LIMS auth profile) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  full_name text,
  email text,
  designation text,
  department_name text,
  division text,
  status text NOT NULL DEFAULT 'Active',
  mobile text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS division text;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, full_name, email, designation, department_name, division, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(COALESCE(NEW.email, 'user'), '@', 1)),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'designation', 'Admin'),
    COALESCE(NEW.raw_user_meta_data->>'department_name', 'Management'),
    COALESCE(NEW.raw_user_meta_data->>'division', 'Consultancy'),
    'Active'
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Seed profiles for existing GoTrue users
INSERT INTO public.user_profiles (id, full_name, email, designation, department_name, division, status, mobile)
SELECT
  u.id,
  COALESCE(p.full_name, split_part(COALESCE(u.email, 'user'), '@', 1)),
  u.email,
  CASE
    WHEN lower(COALESCE(p.role, '')) = 'admin' THEN 'Admin'
    ELSE COALESCE(NULLIF(u.raw_user_meta_data->>'designation', ''), 'Admin')
  END,
  COALESCE(NULLIF(u.raw_user_meta_data->>'department_name', ''), 'Management'),
  COALESCE(NULLIF(u.raw_user_meta_data->>'division', ''), 'Consultancy'),
  'Active',
  p.mobile
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
ON CONFLICT (id) DO UPDATE SET
  full_name = COALESCE(EXCLUDED.full_name, public.user_profiles.full_name),
  email = COALESCE(EXCLUDED.email, public.user_profiles.email),
  designation = COALESCE(NULLIF(public.user_profiles.designation, ''), EXCLUDED.designation),
  updated_at = now();

-- ── Lab / company settings chrome ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lab_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_name text,
  lab_type text,
  lab_scale text,
  contact_person text,
  designation text,
  phone text,
  email text,
  address text,
  pin_code text,
  district text,
  state text,
  country text,
  country_code text DEFAULT '+91',
  website text,
  currency text DEFAULT '₹',
  date_format text DEFAULT 'DD/MM/YYYY',
  time_format text DEFAULT '12-hour',
  logo_path text,
  theme text DEFAULT 'light',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  seal_sign_path text,
  bank_name text,
  branch_name text,
  account_number text,
  ifsc text,
  upi text,
  cheque_copy_path text,
  qr_code_path text,
  report_scope_templates jsonb DEFAULT '{}'::jsonb,
  print_settings jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.lab_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL,
  file_path text,
  file_name text,
  file_size bigint,
  mime_type text,
  expiry_date date,
  remarks text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lab_accreditations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accreditation_body text NOT NULL,
  accreditation_number text,
  standard text DEFAULT 'ISO/IEC 17025:2017',
  valid_from date,
  valid_until date,
  scope_document_path text,
  remarks text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  certificate_file_path text,
  logo_file_path text
);

CREATE TABLE IF NOT EXISTS public.lab_prefixes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  prefix text NOT NULL,
  last_number integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lab_letterheads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_default boolean DEFAULT false,
  header_html text,
  footer_html text,
  logo_path text,
  watermark_path text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  template_type text,
  title text,
  file_path text,
  content_text text
);

CREATE TABLE IF NOT EXISTS public.lab_master_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  value text NOT NULL,
  label text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.client_master_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  value text,
  label text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.is_code_master_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  value text,
  label text NOT NULL,
  created_at timestamptz DEFAULT now()
);

INSERT INTO public.lab_settings (lab_name, email, address, phone, logo_path)
SELECT
  COALESCE(cs.company_name, 'Q Engineering'),
  COALESCE(cs.email, 'info@qengineering.in'),
  cs.address,
  cs.phone,
  cs.logo_path
FROM public.company_settings cs
WHERE cs.id = 1
  AND NOT EXISTS (SELECT 1 FROM public.lab_settings LIMIT 1);

INSERT INTO public.lab_settings (lab_name, email)
SELECT 'Q Engineering', 'info@qengineering.in'
WHERE NOT EXISTS (SELECT 1 FROM public.lab_settings LIMIT 1);

-- ── Module access ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.module_access_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type text NOT NULL CHECK (subject_type IN ('division', 'department', 'designation', 'user')),
  subject_key text NOT NULL,
  subject_label text NOT NULL DEFAULT '',
  module_key text NOT NULL,
  access_level text NOT NULL DEFAULT 'none' CHECK (access_level IN ('none', 'view', 'edit')),
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT module_access_rules_subject_module_uq UNIQUE (subject_type, subject_key, module_key)
);

CREATE INDEX IF NOT EXISTS module_access_rules_subject_idx
  ON public.module_access_rules (subject_type, subject_key);
CREATE INDEX IF NOT EXISTS module_access_rules_module_idx
  ON public.module_access_rules (module_key);

-- ── AI settings (LIMS shape) ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_settings (
  id uuid PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000002'::uuid,
  default_model_id uuid,
  ai_enabled boolean NOT NULL DEFAULT true,
  temperature numeric NOT NULL DEFAULT 0.7,
  max_tokens integer NOT NULL DEFAULT 4096,
  system_prompt_prefix text,
  log_requests boolean NOT NULL DEFAULT false,
  updated_at timestamptz DEFAULT now(),
  agent_crud_enabled boolean NOT NULL DEFAULT true
);

INSERT INTO public.ai_settings (id) VALUES ('00000000-0000-0000-0000-000000000002'::uuid)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.ai_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  instructions text NOT NULL DEFAULT '',
  trigger_keywords text[] DEFAULT '{}'::text[],
  is_enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.ai_models ADD COLUMN IF NOT EXISTS api_base_url text;
ALTER TABLE public.ai_models ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

-- ── Public brand RPC ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_public_company_brand()
RETURNS TABLE (company_name text, logo_path text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(
      (SELECT lab_name FROM public.lab_settings ORDER BY created_at DESC NULLS LAST LIMIT 1),
      (SELECT company_name FROM public.company_settings WHERE id = 1),
      'Q Engineering'
    ) AS company_name,
    COALESCE(
      (SELECT logo_path FROM public.lab_settings ORDER BY created_at DESC NULLS LAST LIMIT 1),
      (SELECT logo_path FROM public.company_settings WHERE id = 1)
    ) AS logo_path;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_company_brand() TO anon, authenticated, service_role;

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_accreditations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_prefixes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_letterheads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_master_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_master_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.is_code_master_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.module_access_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_models ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'user_profiles','lab_settings','lab_documents','lab_accreditations','lab_prefixes',
    'lab_letterheads','lab_master_options','client_master_options','is_code_master_options',
    'module_access_rules','ai_settings','ai_skills','ai_models'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS consultancy_%s_all ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY consultancy_%s_all ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      t, t
    );
  END LOOP;
END $$;

-- Allow anon to read public brand / minimal lab name for login chrome
DROP POLICY IF EXISTS consultancy_lab_settings_anon_select ON public.lab_settings;
CREATE POLICY consultancy_lab_settings_anon_select
  ON public.lab_settings FOR SELECT TO anon
  USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, anon;

NOTIFY pgrst, 'reload schema';
