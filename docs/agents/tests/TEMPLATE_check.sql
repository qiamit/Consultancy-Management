-- <ID> DB checks. Run: node docs/agents/tests/db-run.mjs docs/agents/tests/<ID>_checks.sql   (read-only)
-- No BEGIN/COMMIT here: the runner wraps everything in a transaction and always rolls back.
-- Never SELECT secret columns (passwords etc.); never filter on real client names in reports.

-- 1) Sanity counts (compare with docs/agents/BASELINES.md)
SELECT (SELECT count(*) FROM public.clients) AS clients,
       (SELECT count(*) FROM public.is_codes) AS is_codes,
       (SELECT count(*) FROM public.test_parameters) AS test_parameters;

-- 2) Leftover test data (must be 0 after cleanup)
SELECT count(*) AS zz_test_clients FROM public.clients WHERE company_name ILIKE 'ZZ TEST%';

-- 3) Latest audit rows
SELECT table_name, action, changed_by, changed_at FROM public.audit_log ORDER BY id DESC LIMIT 10;
