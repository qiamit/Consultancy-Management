-- F5: age of an open tax invoice, counted from the invoice date.
-- Buckets: current (0–30), d31_60, d61_90, over_90.
-- Summary uses the F3 outstanding rule and skips settled or cancelled invoices.
-- Does not rewrite saved documents.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.invoice_age_bucket(p_invoice_date date, p_as_of date)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_invoice_date IS NULL OR p_as_of IS NULL OR p_as_of < p_invoice_date THEN 'current'
    WHEN (p_as_of - p_invoice_date) <= 30 THEN 'current'
    WHEN (p_as_of - p_invoice_date) <= 60 THEN 'd31_60'
    WHEN (p_as_of - p_invoice_date) <= 90 THEN 'd61_90'
    ELSE 'over_90'
  END;
$$;

CREATE OR REPLACE FUNCTION public.invoice_ageing_summary(p_as_of date DEFAULT CURRENT_DATE)
RETURNS TABLE (
  bucket text,
  invoice_count integer,
  outstanding numeric
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH as_of AS (
    SELECT COALESCE(p_as_of, CURRENT_DATE) AS d
  ),
  open_rows AS (
    SELECT
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
    WHERE i.tax_status IS DISTINCT FROM 'cancelled'
      AND btrim(COALESCE(i.tax_invoice_number, '')) <> ''
  ),
  summed AS (
    SELECT
      bucket,
      COUNT(*)::integer AS invoice_count,
      ROUND(COALESCE(SUM(outstanding), 0), 2) AS outstanding
    FROM open_rows
    WHERE outstanding > 0.009
    GROUP BY bucket
  )
  SELECT
    b.bucket,
    COALESCE(s.invoice_count, 0),
    COALESCE(s.outstanding, 0)
  FROM (
    VALUES ('current'), ('d31_60'), ('d61_90'), ('over_90')
  ) AS b(bucket)
  LEFT JOIN summed s ON s.bucket = b.bucket
  ORDER BY CASE b.bucket
    WHEN 'current' THEN 1
    WHEN 'd31_60' THEN 2
    WHEN 'd61_90' THEN 3
    ELSE 4
  END;
$$;

REVOKE ALL ON FUNCTION public.invoice_age_bucket(date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.invoice_ageing_summary(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invoice_age_bucket(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.invoice_ageing_summary(date) TO authenticated;

NOTIFY pgrst, 'reload schema';
