-- Include mobile + division from auth metadata when a user is created.
-- Also upsert on conflict so create-user edge function can fill fields after the trigger.

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.user_profiles (
    id,
    full_name,
    mobile,
    designation,
    department_name,
    division,
    status
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'mobile', ''),
    COALESCE(NEW.raw_user_meta_data->>'designation', ''),
    COALESCE(NEW.raw_user_meta_data->>'department_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'division', ''),
    COALESCE(NEW.raw_user_meta_data->>'status', 'Active')
  )
  ON CONFLICT (id) DO UPDATE SET
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
