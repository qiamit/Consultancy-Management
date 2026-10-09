-- S6b DB sanity. Read-only. Counts only. No secret columns.
SELECT (SELECT count(*) FROM public.clients) AS clients,
       (SELECT count(*) FROM public.is_codes) AS is_codes,
       (SELECT count(*) FROM public.test_parameters) AS test_parameters,
       (SELECT count(*) FROM public.bis_projects) AS bis_projects;

SELECT count(*) AS zz_clients FROM public.clients WHERE company_name ILIKE 'ZZ TEST%';

SELECT count(*) FILTER (WHERE portal_password IS NOT NULL) AS plaintext_not_null,
       count(*) FILTER (WHERE portal_password_set) AS flag_true_n
  FROM public.bis_projects;

SELECT to_regclass('public.portal_secret_access_log') IS NOT NULL AS access_log_exists;
