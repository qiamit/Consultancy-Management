-- Cleanup check. Counts only.
SELECT count(*) AS zz_projects
  FROM public.bis_projects
 WHERE COALESCE(title, '') ILIKE 'ZZ TEST%'
    OR id = '92df2918-4390-461d-bb75-e8bff16eadbd';

SELECT count(*) AS zz_clients,
       count(*) FILTER (WHERE archived_at IS NOT NULL) AS zz_archived
  FROM public.clients
 WHERE company_name ILIKE 'ZZ TEST%';

SELECT count(*) AS zz_quotations
  FROM public.quotations
 WHERE COALESCE(client_name, '') ILIKE 'ZZ TEST%'
    OR client_id IN (SELECT id FROM public.clients WHERE company_name ILIKE 'ZZ TEST%');

SELECT count(*) AS clients FROM public.clients;
