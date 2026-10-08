-- Counts only for the ZZ TEST license created in the UI. No secret columns.
SELECT action, count(*) AS n
  FROM public.portal_secret_access_log
 WHERE project_id = '92df2918-4390-461d-bb75-e8bff16eadbd'
 GROUP BY action
 ORDER BY action;

SELECT portal_password IS NULL AS plaintext_null,
       portal_password_set AS flag_set
  FROM public.bis_projects
 WHERE id = '92df2918-4390-461d-bb75-e8bff16eadbd';
