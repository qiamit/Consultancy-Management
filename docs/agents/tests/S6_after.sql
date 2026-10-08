-- S6 leftover proof after the rollback suite. Read-only.
SELECT count(*) FILTER (WHERE role = 'viewer') AS viewer_n,
       count(*) FILTER (WHERE COALESCE(designation, '') ILIKE 'ZZ TEST%') AS zz_designation_n,
       count(*) FILTER (WHERE role = 'admin') AS admin_n,
       count(*) FILTER (WHERE role = 'staff') AS staff_n
  FROM public.user_profiles;

SELECT count(*) AS zz_clients FROM public.clients WHERE company_name ILIKE 'ZZ TEST%';
SELECT count(*) AS zz_projects FROM public.bis_projects WHERE title ILIKE 'ZZ TEST%';

SELECT subject_type, module_key, access_level, count(*) AS n
  FROM public.module_access_rules
 GROUP BY 1, 2, 3
 ORDER BY 1, 2, 3;
