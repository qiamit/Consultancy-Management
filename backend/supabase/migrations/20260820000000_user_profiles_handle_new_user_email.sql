-- Persist login email on user_profiles when auth.users row is created.

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.user_profiles (
    id,
    email,
    full_name,
    mobile,
    designation,
    department_name,
    division,
    status
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'mobile', ''),
    COALESCE(NEW.raw_user_meta_data->>'designation', ''),
    COALESCE(NEW.raw_user_meta_data->>'department_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'division', ''),
    COALESCE(NEW.raw_user_meta_data->>'status', 'Active')
  )
  ON CONFLICT (id) DO UPDATE SET
    email = COALESCE(NULLIF(EXCLUDED.email, ''), public.user_profiles.email),
    full_name = COALESCE(EXCLUDED.full_name, public.user_profiles.full_name),
    mobile = COALESCE(NULLIF(EXCLUDED.mobile, ''), public.user_profiles.mobile),
    designation = COALESCE(NULLIF(EXCLUDED.designation, ''), public.user_profiles.designation),
    department_name = COALESCE(NULLIF(EXCLUDED.department_name, ''), public.user_profiles.department_name),
    division = COALESCE(NULLIF(EXCLUDED.division, ''), public.user_profiles.division),
    status = COALESCE(NULLIF(EXCLUDED.status, ''), public.user_profiles.status),
    updated_at = now();
  RETURN NEW;
END;
$function$;

-- Backfill profiles that still have empty email from auth.users.
UPDATE public.user_profiles p
SET email = u.email,
    updated_at = now()
FROM auth.users u
WHERE p.id = u.id
  AND COALESCE(p.email, '') = ''
  AND COALESCE(u.email, '') <> '';

NOTIFY pgrst, 'reload schema';
