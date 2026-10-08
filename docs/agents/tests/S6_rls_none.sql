-- S6 follow-up: BIS "none" must be checked as role authenticated, not as the table owner.
-- Run: node docs/agents/tests/db-run.mjs docs/agents/tests/S6_rls_none.sql --rollback

CREATE TEMP TABLE s6_out (
  step text PRIMARY KEY,
  ok boolean,
  detail text
);

DO $body$
DECLARE
  v_staff uuid;
  v_path text;
  v_level text;
  v_n bigint;
  v_who text;
BEGIN
  SELECT id INTO v_staff
    FROM public.user_profiles
   WHERE role = 'staff'
     AND lower(trim(COALESCE(designation, ''))) NOT IN
         ('laboratory director', 'admin', 'administrator', 'director', 'super admin', 'managing director')
   ORDER BY id
   LIMIT 1;

  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  UPDATE public.user_profiles
     SET role = 'viewer', designation = 'Engineer'
   WHERE id = v_staff;

  FOREACH v_path IN ARRAY public.app_bis_paths() LOOP
    INSERT INTO public.module_access_rules (subject_type, subject_key, subject_label, module_key, access_level)
    VALUES ('user', v_staff::text, 'ZZ TEST', v_path, 'none')
    ON CONFLICT (subject_type, subject_key, module_key)
    DO UPDATE SET access_level = 'none';
  END LOOP;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);
  v_level := public.app_module_level('/bis/projects');
  INSERT INTO s6_out VALUES ('none_level', v_level = 'none', 'level=' || COALESCE(v_level, 'null'));

  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT current_user INTO v_who;
  SELECT count(*) INTO v_n FROM public.bis_projects;
  EXECUTE 'RESET ROLE';
  INSERT INTO s6_out VALUES ('session_user', v_who = 'authenticated', COALESCE(v_who, 'null'));
  INSERT INTO s6_out VALUES ('none_sees_no_rows', v_who = 'authenticated' AND v_n = 0, 'n=' || COALESCE(v_n::text, 'null'));
END/**/;
$body$;

SELECT step, ok, detail FROM s6_out ORDER BY step;
