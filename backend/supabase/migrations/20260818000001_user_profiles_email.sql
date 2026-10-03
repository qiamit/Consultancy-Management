-- Store login email on user_profiles so User Management can list/edit without Edge Functions.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT '';

UPDATE public.user_profiles p
SET email = COALESCE(NULLIF(u.email, ''), ident.ident_email, p.email, '')
FROM auth.users u
LEFT JOIN LATERAL (
  SELECT i.identity_data->>'email' AS ident_email
  FROM auth.identities i
  WHERE i.user_id = u.id
  ORDER BY i.updated_at DESC NULLS LAST
  LIMIT 1
) ident ON true
WHERE p.id = u.id;

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

  IF lower(COALESCE(caller_designation, '')) <> 'laboratory director' THEN
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

  IF lower(COALESCE(caller_designation, '')) <> 'laboratory director' THEN
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

REVOKE ALL ON FUNCTION public.update_team_user(uuid, text, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_team_user(uuid, text, text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_team_user(uuid, text, text, text, text, text, text, text) TO service_role;

NOTIFY pgrst, 'reload schema';
