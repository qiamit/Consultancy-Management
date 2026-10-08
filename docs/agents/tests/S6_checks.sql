-- S6 DB checks. Run: node docs/agents/tests/db-run.mjs docs/agents/tests/S6_checks.sql
-- Counts and flags only. Never select password, ciphertext, or audit JSON values.

-- 1) Sanity counts (compare with docs/agents/BASELINES.md)
SELECT (SELECT count(*) FROM public.clients) AS clients,
       (SELECT count(*) FROM public.is_codes) AS is_codes,
       (SELECT count(*) FROM public.test_parameters) AS test_parameters,
       (SELECT count(*) FROM public.bis_projects) AS bis_projects,
       (SELECT count(*) FROM public.user_profiles) AS user_profiles,
       (SELECT count(*) FROM public.lab_settings) AS lab_settings;

-- 2) Migration applied
SELECT filename, applied_at
  FROM public.app_schema_migrations
 WHERE filename LIKE '%s6_portal_secrets%';

-- 3) Plaintext gone; flags match the secrets table (no secret columns selected)
SELECT count(*) FILTER (WHERE portal_password IS NOT NULL) AS plaintext_not_null,
       count(*) FILTER (WHERE COALESCE(portal_password, '') <> '') AS plaintext_nonempty,
       count(*) FILTER (WHERE portal_password_set) AS flag_true_n,
       count(*) AS projects
  FROM public.bis_projects;

SELECT count(*) AS vault_n
  FROM private.bis_portal_secrets;

SELECT count(*) AS flag_mismatch
  FROM public.bis_projects b
 WHERE b.portal_password_set
       IS DISTINCT FROM EXISTS (
         SELECT 1 FROM private.bis_portal_secrets s WHERE s.project_id = b.id
       );

-- 4) Access log: migrate count and action totals (no values)
SELECT action, count(*) AS n
  FROM public.portal_secret_access_log
 GROUP BY action
 ORDER BY action;

-- 5) bis_new_applications (finding 2): row count and leftover plaintext count only
SELECT to_regclass('public.bis_new_applications') IS NOT NULL AS table_exists;

SELECT count(*) AS rows,
       count(*) FILTER (WHERE portal_password IS NOT NULL) AS plaintext_not_null
  FROM public.bis_new_applications;

-- 6) audit_log must not keep secret-looking keys
SELECT count(*) AS bad_key_n
  FROM public.audit_log a
 WHERE EXISTS (
         SELECT 1
           FROM jsonb_object_keys(CASE WHEN jsonb_typeof(a.old_data) = 'object' THEN a.old_data ELSE '{}'::jsonb END) k
          WHERE k ~* '(^|_)(password|passwd|pwd|secret|secret_enc|api_key|apikey|token|access_token|refresh_token|private_key|key_hex)$'
             OR k IN ('encrypted_password', 'password_hash')
       )
    OR EXISTS (
         SELECT 1
           FROM jsonb_object_keys(CASE WHEN jsonb_typeof(a.new_data) = 'object' THEN a.new_data ELSE '{}'::jsonb END) k
          WHERE k ~* '(^|_)(password|passwd|pwd|secret|secret_enc|api_key|apikey|token|access_token|refresh_token|private_key|key_hex)$'
             OR k IN ('encrypted_password', 'password_hash')
       );

-- 7) anon EXECUTE on public/private functions (expect only the two website RPCs)
SELECT n.nspname AS schema, p.proname AS function_name
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname IN ('public', 'private')
   AND has_function_privilege('anon', p.oid, 'EXECUTE')
 ORDER BY 1, 2;

-- 8) anon must not use schema private
SELECT has_schema_privilege('anon', 'private', 'USAGE') AS hidden_schema_usage,
       has_table_privilege('anon', 'private.bis_portal_secrets', 'SELECT') AS hidden_table_select,
       has_table_privilege('anon', 'private.app_keys', 'SELECT') AS hidden_keys_select;

-- 9) BIS write policies that are still USING/CHECK true
SELECT schemaname, tablename, policyname, cmd
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename LIKE 'bis%'
   AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
   AND (qual = 'true' OR with_check = 'true')
 ORDER BY tablename, policyname;

-- 10) Role distribution (counts only)
SELECT COALESCE(role, '(null)') AS role, count(*) AS n
  FROM public.user_profiles
 GROUP BY 1
 ORDER BY 1;

-- 11) Leftover ZZ TEST rows (expect 0 before this session creates any)
SELECT count(*) AS zz_test_clients FROM public.clients WHERE company_name ILIKE 'ZZ TEST%';
SELECT count(*) AS zz_test_projects
  FROM public.bis_projects
 WHERE COALESCE(title, '') ILIKE 'ZZ TEST%'
    OR COALESCE(application_number, '') ILIKE 'ZZ TEST%';

-- 12) Columns a rollback insert must supply
SELECT column_name
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'bis_projects'
   AND is_nullable = 'NO'
   AND column_default IS NULL
 ORDER BY 1;

-- 13) How many staff already have an admin-style designation (finding 1). Counts only.
SELECT count(*) FILTER (
         WHERE role = 'staff'
           AND lower(trim(COALESCE(designation, ''))) IN
               ('laboratory director', 'admin', 'administrator', 'director', 'super admin', 'managing director')
       ) AS staff_director_title,
       count(*) FILTER (WHERE role = 'staff') AS staff_n,
       count(*) FILTER (WHERE role = 'admin') AS admin_n,
       count(*) FILTER (WHERE role = 'viewer') AS viewer_n
  FROM public.user_profiles;
