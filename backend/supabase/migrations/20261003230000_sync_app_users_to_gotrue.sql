-- Sync legacy Consultancy Pro app_users + profiles → GoTrue auth.users + user_profiles
-- so User Management shows every team member (and they can sign in with existing passwords).

-- ── 1) auth.users from app_users ──────────────────────────────────────────────
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  last_sign_in_at,
  banned_until,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  is_super_admin,
  is_sso_user,
  is_anonymous,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change,
  email_change_token_current,
  phone_change,
  phone_change_token,
  reauthentication_token
)
SELECT
  '00000000-0000-0000-0000-000000000000'::uuid,
  a.id,
  'authenticated',
  'authenticated',
  a.email::text,
  a.password_hash,
  COALESCE(a.email_confirmed_at, a.created_at, now()),
  a.last_sign_in_at,
  a.banned_until,
  jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
  COALESCE(a.raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
    'full_name', COALESCE(a.raw_user_meta_data->>'full_name', p.full_name, split_part(a.email::text, '@', 1)),
    'mobile', COALESCE(a.raw_user_meta_data->>'mobile', p.mobile),
    'email_verified', true,
    'designation', CASE
      WHEN lower(COALESCE(p.role, '')) = 'admin' THEN 'Admin'
      WHEN lower(COALESCE(p.role, '')) IN ('inspection_engineer', 'inspection engineer') THEN 'Inspection Engineer'
      WHEN lower(COALESCE(p.role, '')) IN ('staff', '') THEN 'Staff'
      ELSE initcap(replace(COALESCE(NULLIF(p.role, ''), 'Staff'), '_', ' '))
    END,
    'department_name', 'Management',
    'division', 'Consultancy'
  ),
  COALESCE(a.created_at, now()),
  COALESCE(a.updated_at, now()),
  false,
  false,
  false,
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  ''
FROM public.app_users a
LEFT JOIN public.profiles p ON p.id = a.id
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = a.id)
  AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = lower(a.email::text));

-- ── 2) auth.identities (email provider) ───────────────────────────────────────
INSERT INTO auth.identities (
  provider_id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
SELECT
  u.id::text,
  u.id,
  jsonb_build_object(
    'sub', u.id::text,
    'email', u.email,
    'email_verified', true,
    'phone_verified', false
  ),
  'email',
  u.last_sign_in_at,
  u.created_at,
  u.updated_at
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM auth.identities i
  WHERE i.user_id = u.id AND i.provider = 'email'
);

-- ── 3) user_profiles upsert from profiles + app_users ─────────────────────────
INSERT INTO public.user_profiles (
  id, full_name, email, designation, department_name, division, status, mobile, created_at, updated_at
)
SELECT
  u.id,
  COALESCE(
    NULLIF(p.full_name, ''),
    NULLIF(u.raw_user_meta_data->>'full_name', ''),
    split_part(COALESCE(u.email, 'user'), '@', 1)
  ),
  u.email,
  CASE
    WHEN lower(COALESCE(p.role, '')) = 'admin' THEN 'Admin'
    WHEN lower(COALESCE(p.role, '')) IN ('inspection_engineer', 'inspection engineer') THEN 'Inspection Engineer'
    ELSE COALESCE(
      NULLIF(u.raw_user_meta_data->>'designation', ''),
      NULLIF(up.designation, ''),
      initcap(replace(COALESCE(NULLIF(p.role, ''), 'Staff'), '_', ' '))
    )
  END,
  COALESCE(NULLIF(up.department_name, ''), NULLIF(u.raw_user_meta_data->>'department_name', ''), 'Management'),
  COALESCE(NULLIF(up.division, ''), NULLIF(u.raw_user_meta_data->>'division', ''), 'Consultancy'),
  CASE WHEN a.banned_until IS NOT NULL AND a.banned_until > now() THEN 'Inactive' ELSE 'Active' END,
  COALESCE(NULLIF(p.mobile, ''), NULLIF(u.raw_user_meta_data->>'mobile', ''), NULLIF(up.mobile, '')),
  COALESCE(u.created_at, now()),
  now()
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
LEFT JOIN public.app_users a ON a.id = u.id
LEFT JOIN public.user_profiles up ON up.id = u.id
ON CONFLICT (id) DO UPDATE SET
  full_name = COALESCE(EXCLUDED.full_name, public.user_profiles.full_name),
  email = COALESCE(EXCLUDED.email, public.user_profiles.email),
  designation = COALESCE(NULLIF(EXCLUDED.designation, ''), public.user_profiles.designation),
  department_name = COALESCE(NULLIF(EXCLUDED.department_name, ''), public.user_profiles.department_name),
  division = COALESCE(NULLIF(EXCLUDED.division, ''), public.user_profiles.division),
  mobile = COALESCE(NULLIF(EXCLUDED.mobile, ''), public.user_profiles.mobile),
  status = COALESCE(EXCLUDED.status, public.user_profiles.status),
  updated_at = now();

-- ── 4) Migrate legacy profiles.module_access → module_access_rules (per user) ─
WITH key_map(old_key, module_key) AS (
  VALUES
    ('dashboard', '/'),
    ('clients', '/masters/clients'),
    ('is_codes', '/masters/is-codes'),
    ('products', '/masters/product-services'),
    ('test_parameters', '/masters/test-parameter'),
    ('finance', '/finance/sale/quotation'),
    ('bis_projects', '/bis/projects'),
    ('bis_applications', '/bis/new-applications'),
    ('bis_new_inclusion', '/bis/new-inclusion'),
    ('bis_license_renewals', '/bis/license-renewals'),
    ('license_stop_marking', '/bis/stop-marking'),
    ('bis_surveillance', '/bis/surveillance'),
    ('bis_sample_failure_reply', '/bis/sample-failure-reply'),
    ('our_bis_licenses', '/bis/our-licenses'),
    ('expired_licenses', '/bis/expired-licenses'),
    ('email', '/tools/email'),
    ('cms', '/tools/cms')
),
expanded AS (
  SELECT
    p.id AS user_id,
    COALESCE(NULLIF(p.full_name, ''), u.email, p.id::text) AS subject_label,
    km.module_key,
    lower(kv.value #>> '{}') AS access_level
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(p.module_access) = 'object' THEN p.module_access ELSE '{}'::jsonb END) kv
  JOIN key_map km ON km.old_key = kv.key
  WHERE lower(kv.value #>> '{}') IN ('view', 'edit')
)
INSERT INTO public.module_access_rules (
  subject_type, subject_key, subject_label, module_key, access_level, updated_at
)
SELECT
  'user',
  e.user_id::text,
  e.subject_label,
  e.module_key,
  e.access_level,
  now()
FROM expanded e
WHERE NOT EXISTS (
  SELECT 1 FROM public.module_access_rules r
  WHERE r.subject_type = 'user'
    AND r.subject_key = e.user_id::text
    AND r.module_key = e.module_key
);

-- ── 5) Allow Admin (and other full-access roles) to call list_team_users ─────
CREATE OR REPLACE FUNCTION public.list_team_users()
RETURNS TABLE (
  id uuid,
  email text,
  full_name text,
  mobile text,
  designation text,
  department_name text,
  division text,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, auth
AS $$
DECLARE
  caller_designation text;
BEGIN
  SELECT trim(both FROM COALESCE(up.designation, ''))
  INTO caller_designation
  FROM public.user_profiles up
  WHERE up.id = auth.uid();

  IF lower(COALESCE(caller_designation, '')) NOT IN (
    'laboratory director',
    'admin',
    'administrator',
    'director',
    'super admin',
    'managing director'
  ) THEN
    RAISE EXCEPTION 'Forbidden'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    COALESCE(NULLIF(p.email, ''), u.email, ''::text),
    COALESCE(p.full_name, ''::text),
    COALESCE(p.mobile, ''::text),
    COALESCE(p.designation, ''::text),
    COALESCE(p.department_name, ''::text),
    COALESCE(p.division, ''::text),
    COALESCE(p.status, 'Active'::text)
  FROM public.user_profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  ORDER BY p.full_name ASC NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_team_users() TO authenticated;

CREATE OR REPLACE FUNCTION public.update_team_user(
  p_user_id uuid,
  p_full_name text DEFAULT NULL,
  p_mobile text DEFAULT NULL,
  p_designation text DEFAULT NULL,
  p_department_name text DEFAULT NULL,
  p_division text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_email text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, auth
AS $$
DECLARE
  caller_designation text;
  next_email text;
BEGIN
  SELECT trim(both FROM COALESCE(up.designation, ''))
  INTO caller_designation
  FROM public.user_profiles up
  WHERE up.id = auth.uid();

  IF lower(COALESCE(caller_designation, '')) NOT IN (
    'laboratory director',
    'admin',
    'administrator',
    'director',
    'super admin',
    'managing director'
  ) THEN
    RAISE EXCEPTION 'Forbidden'
      USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id is required';
  END IF;

  UPDATE public.user_profiles
  SET
    full_name = COALESCE(p_full_name, full_name),
    mobile = COALESCE(p_mobile, mobile),
    designation = COALESCE(p_designation, designation),
    department_name = COALESCE(p_department_name, department_name),
    division = COALESCE(p_division, division),
    status = COALESCE(p_status, status),
    email = COALESCE(NULLIF(trim(p_email), ''), email),
    updated_at = now()
  WHERE id = p_user_id;

  next_email := NULLIF(trim(COALESCE(p_email, '')), '');
  IF next_email IS NOT NULL THEN
    UPDATE auth.users
    SET
      email = next_email,
      updated_at = now()
    WHERE id = p_user_id;

    UPDATE auth.identities
    SET
      identity_data = coalesce(identity_data, '{}'::jsonb)
        || jsonb_build_object('email', next_email),
      updated_at = now()
    WHERE user_id = p_user_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_team_user(uuid, text, text, text, text, text, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
