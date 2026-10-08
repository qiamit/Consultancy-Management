-- S6 permission checks. Run: node docs/agents/tests/db-run.mjs docs/agents/tests/S6_rls.sql --rollback
-- Writes a ZZ TEST project and a ZZ TEST client inside the transaction. The runner always rolls back.
-- Results are booleans and counts. The marker value is never selected.

CREATE TEMP TABLE s6_out (
  step text PRIMARY KEY,
  ok boolean,
  detail text
);
GRANT ALL ON s6_out TO authenticated, anon;

DO $body$
DECLARE
  v_admin uuid;
  v_staff uuid;
  v_project uuid;
  v_client_live uuid;
  v_client_arch uuid;
  v_match boolean;
  v_flag boolean;
  v_is_admin boolean;
  v_level text;
  v_n bigint;
  v_arch bigint;
  v_plain bigint;
BEGIN
  SELECT id INTO v_admin
    FROM public.user_profiles
   WHERE role = 'admin'
   ORDER BY id
   LIMIT 1;
  SELECT id INTO v_staff
    FROM public.user_profiles
   WHERE role = 'staff'
     AND lower(trim(COALESCE(designation, ''))) NOT IN
         ('laboratory director', 'admin', 'administrator', 'director', 'super admin', 'managing director')
   ORDER BY id
   LIMIT 1;
  INSERT INTO s6_out VALUES (
    'users_found',
    v_admin IS NOT NULL AND v_staff IS NOT NULL,
    CASE WHEN v_staff IS NULL THEN 'no non-director staff' ELSE 'ok' END
  );
  IF v_admin IS NULL OR v_staff IS NULL THEN
    RETURN;
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  v_is_admin := public.app_is_admin();
  INSERT INTO s6_out VALUES ('admin_flag', v_is_admin, v_is_admin::text);

  BEGIN
    PERFORM public.set_user_role(v_admin, 'viewer');
    INSERT INTO s6_out VALUES ('self_demote_refused', false, 'call succeeded');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO s6_out VALUES ('self_demote_refused', SQLSTATE = '42501', SQLSTATE);
  END/**/;

  INSERT INTO public.bis_projects (project_kind, title)
  VALUES ('Project', 'ZZ TEST S6')
  RETURNING id INTO v_project;

  PERFORM public.bis_portal_secret_set(v_project, 'ZZTEST-S6-MARKER');
  SELECT (portal_password IS NULL), portal_password_set
    INTO v_match, v_flag
    FROM public.bis_projects
   WHERE id = v_project;
  INSERT INTO s6_out VALUES ('column_stays_null', v_match, 'null=' || v_match::text);
  INSERT INTO s6_out VALUES ('flag_after_set', v_flag, 'flag=' || v_flag::text);

  v_match := public.bis_portal_secret_get(v_project, 'reveal') = 'ZZTEST-S6-MARKER';
  INSERT INTO s6_out VALUES ('admin_reveal_matches', v_match, 'match=' || COALESCE(v_match::text, 'null'));

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);
  BEGIN
    PERFORM public.bis_portal_secret_get(v_project, 'reveal');
    INSERT INTO s6_out VALUES ('staff_reveal_refused', false, 'call succeeded');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO s6_out VALUES ('staff_reveal_refused', SQLSTATE = '42501', SQLSTATE);
  END/**/;

  v_match := public.bis_portal_secret_get(v_project, 'extension_login') = 'ZZTEST-S6-MARKER';
  INSERT INTO s6_out VALUES ('staff_login_matches', v_match, 'match=' || COALESCE(v_match::text, 'null'));

  BEGIN
    PERFORM public.set_user_role(v_admin, 'staff');
    INSERT INTO s6_out VALUES ('staff_set_role_refused', false, 'call succeeded');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO s6_out VALUES ('staff_set_role_refused', SQLSTATE = '42501', SQLSTATE);
  END/**/;

  BEGIN
    PERFORM 1 FROM public.get_audit_history('clients', v_admin::text, 5);
    INSERT INTO s6_out VALUES ('staff_history_refused', false, 'call succeeded');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO s6_out VALUES ('staff_history_refused', SQLSTATE = '42501', SQLSTATE);
  END/**/;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  BEGIN
    PERFORM 1 FROM public.get_audit_history('clients', v_admin::text, 5);
    INSERT INTO s6_out VALUES ('admin_history_ok', true, 'no error');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO s6_out VALUES ('admin_history_ok', false, SQLSTATE);
  END/**/;

  PERFORM public.bis_portal_secret_set(v_project, '');
  SELECT portal_password_set INTO v_flag FROM public.bis_projects WHERE id = v_project;
  SELECT count(*) INTO v_n FROM private.bis_portal_secrets WHERE project_id = v_project;
  INSERT INTO s6_out VALUES ('cleared', NOT v_flag AND v_n = 0, 'flag=' || v_flag::text || ' rows=' || v_n::text);

  SELECT count(*) INTO v_n
    FROM public.portal_secret_access_log
   WHERE project_id = v_project
     AND action IN ('set', 'reveal', 'extension_login', 'clear');
  INSERT INTO s6_out VALUES ('access_log_events', v_n = 4, 'n=' || v_n::text);

  -- Finding 1: viewer + director designation still counts as admin.
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  UPDATE public.user_profiles
     SET role = 'viewer', designation = 'Laboratory Director'
   WHERE id = v_staff;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);
  v_is_admin := public.app_is_admin();
  INSERT INTO s6_out VALUES ('finding1_viewer_director_is_admin', v_is_admin, 'is_admin=' || v_is_admin::text);

  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  UPDATE public.user_profiles
     SET role = 'viewer', designation = 'Engineer'
   WHERE id = v_staff;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);
  v_is_admin := public.app_is_admin();
  v_level := public.app_module_level('/bis/projects');
  INSERT INTO s6_out VALUES ('viewer_not_admin', NOT v_is_admin, 'is_admin=' || v_is_admin::text);
  INSERT INTO s6_out VALUES ('viewer_bis_capped', v_level IN ('view', 'none'), 'level=' || COALESCE(v_level, 'null'));

  BEGIN
    PERFORM public.bis_portal_secret_set(v_project, 'ZZTEST-S6-MARKER');
    INSERT INTO s6_out VALUES ('viewer_set_refused', false, 'call succeeded');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO s6_out VALUES ('viewer_set_refused', SQLSTATE = '42501', SQLSTATE);
  END/**/;

  INSERT INTO public.module_access_rules (subject_type, subject_key, subject_label, module_key, access_level)
  VALUES ('user', v_staff::text, 'ZZ TEST', '/bis', 'none')
  ON CONFLICT (subject_type, subject_key, module_key)
  DO UPDATE SET access_level = 'none';
  v_level := public.app_module_level('/bis/projects');
  INSERT INTO s6_out VALUES ('none_level', v_level = 'none', 'level=' || COALESCE(v_level, 'null'));

  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT count(*) INTO v_n FROM public.bis_projects;
    EXECUTE 'RESET ROLE';
    INSERT INTO s6_out VALUES ('none_sees_no_rows', v_n = 0, 'n=' || COALESCE(v_n::text, 'null'));
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    INSERT INTO s6_out VALUES ('none_sees_no_rows', false, SQLSTATE);
  END/**/;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);
  BEGIN
    PERFORM public.bis_portal_secret_get(v_project, 'extension_login');
    INSERT INTO s6_out VALUES ('none_login_refused', false, 'call succeeded');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO s6_out VALUES ('none_login_refused', SQLSTATE = '42501', SQLSTATE);
  END/**/;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);

  BEGIN
    INSERT INTO public.clients (company_name, archived_at)
    VALUES ('ZZ TEST CLIENT S6 ARCHIVED', now())
    RETURNING id INTO v_client_arch;
    INSERT INTO public.clients (company_name)
    VALUES ('ZZ TEST CLIENT S6 LIVE')
    RETURNING id INTO v_client_live;
    SELECT count(*), count(*) FILTER (WHERE archived_at IS NOT NULL)
      INTO v_n, v_arch
      FROM public.search_clients('ZZ TEST CLIENT S6', 50, 0, false, NULL);
    INSERT INTO s6_out VALUES (
      'search_hides_archived',
      v_n = 1 AND v_arch = 0 AND v_client_live IS NOT NULL AND v_client_arch IS NOT NULL,
      'n=' || v_n::text || ' archived=' || v_arch::text
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO s6_out VALUES ('search_hides_archived', false, SQLSTATE || ' ' || left(SQLERRM, 80));
  END/**/;

  SELECT count(*) INTO v_plain FROM public.bis_projects WHERE portal_password IS NOT NULL;
  INSERT INTO s6_out VALUES ('still_no_plaintext', v_plain = 0, 'n=' || v_plain::text);

  BEGIN
    EXECUTE 'SET LOCAL ROLE anon';
    PERFORM public.bis_portal_secret_get(v_project, 'reveal');
    EXECUTE 'RESET ROLE';
    INSERT INTO s6_out VALUES ('anon_get_denied', false, 'call succeeded');
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    INSERT INTO s6_out VALUES ('anon_get_denied', SQLSTATE = '42501', SQLSTATE);
  END/**/;
END/**/;
$body$;

SELECT step, ok, detail FROM s6_out ORDER BY step;
