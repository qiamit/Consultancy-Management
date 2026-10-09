-- F7: a payment reminder is only for an open invoice in the Over 90 bucket.
-- The app still sends mail only after the user confirms. This function does not send mail.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.invoice_needs_reminder(
  p_invoice_date date,
  p_outstanding numeric,
  p_as_of date
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT public.invoice_age_bucket(p_invoice_date, p_as_of) = 'over_90'
    AND COALESCE(p_outstanding, 0) > 0.009;
$$;

REVOKE ALL ON FUNCTION public.invoice_needs_reminder(date, numeric, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invoice_needs_reminder(date, numeric, date) TO authenticated;

NOTIFY pgrst, 'reload schema';
