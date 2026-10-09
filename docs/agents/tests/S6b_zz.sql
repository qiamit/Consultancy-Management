-- S6b: one ZZ TEST client, payment term and remark only.
SELECT company_name,
       payment_term,
       remark,
       archived_at IS NOT NULL AS archived
  FROM public.clients
 WHERE company_name = 'ZZ TEST CLIENT S6B';
