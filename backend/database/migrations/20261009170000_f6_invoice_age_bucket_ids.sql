-- F6: one page of open tax invoice ids for an ageing bucket.
-- Same outstanding rule as F3 and the same buckets as F5.
-- Does not rewrite saved documents.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.invoice_ids_for_age_bucket(
  p_bucket text,
  p_as_of date DEFAULT CURRENT_DATE,
  p_search text DEFAULT '',
  p_limit integer DEFAULT 10,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  invoice_id uuid,
  total_count bigint
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH as_of AS (
    SELECT COALESCE(p_as_of, CURRENT_DATE) AS d
  ),
  needle AS (
    SELECT NULLIF(btrim(COALESCE(p_search, '')), '') AS q
  ),
  open_rows AS (
    SELECT
      i.id,
      i.tax_date,
      i.created_at,
      public.invoice_age_bucket(i.tax_date, (SELECT d FROM as_of)) AS bucket,
      ROUND(GREATEST(
        0,
        COALESCE(i.grand_total, 0) - COALESCE(r.received, 0) - COALESCE(c.credited, 0)
      ), 2) AS outstanding
    FROM public.finance_tax_invoices i
    LEFT JOIN LATERAL (
      SELECT SUM(t.amount) AS received
      FROM public.transactions t
      WHERE t.payment_flow = 'in'
        AND t.client_id = i.client_id
        AND btrim(COALESCE(t.extra->>'invoice_reference_no', t.extra->>'against_invoice_no', ''))
          = btrim(i.tax_invoice_number)
    ) r ON true
    LEFT JOIN LATERAL (
      SELECT SUM(cn.grand_total) AS credited
      FROM public.finance_credit_notes cn
      WHERE cn.client_id = i.client_id
        AND cn.credit_note_status IS DISTINCT FROM 'cancelled'
        AND btrim(COALESCE(cn.extra->>'reference_no', '')) = btrim(i.tax_invoice_number)
    ) c ON true
    WHERE p_bucket IN ('current', 'd31_60', 'd61_90', 'over_90')
      AND i.tax_status IS DISTINCT FROM 'cancelled'
      AND btrim(COALESCE(i.tax_invoice_number, '')) <> ''
      AND (
        (SELECT q FROM needle) IS NULL
        OR i.tax_invoice_number ILIKE '%' || (SELECT q FROM needle) || '%'
        OR EXISTS (
          SELECT 1
          FROM public.clients cl
          WHERE cl.id = i.client_id
            AND cl.company_name ILIKE '%' || (SELECT q FROM needle) || '%'
        )
      )
  ),
  matched AS (
    SELECT id, tax_date, created_at
    FROM open_rows
    WHERE outstanding > 0.009
      AND bucket = p_bucket
  )
  SELECT
    m.id,
    COUNT(*) OVER () AS total_count
  FROM matched m
  ORDER BY m.tax_date DESC NULLS LAST, m.created_at DESC NULLS LAST, m.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

REVOKE ALL ON FUNCTION public.invoice_ids_for_age_bucket(text, date, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invoice_ids_for_age_bucket(text, date, text, integer, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
