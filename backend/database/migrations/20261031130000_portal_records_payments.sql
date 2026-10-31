-- Customer Portal records service: the yearly rate per licence (Lab Settings → Bank Details) and the history of
-- payment requests sent and payments received for each licence. A received payment also makes a Payment Receipt
-- in Finance (transactions); receipt_id points at it.

ALTER TABLE public.lab_settings ADD COLUMN IF NOT EXISTS portal_records_yearly_rate numeric(12,2);

CREATE TABLE IF NOT EXISTS public.portal_service_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.bis_projects(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('request', 'payment')),
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  paid_on date,
  period_from date,
  period_to date,
  mode text,
  reference text,
  receipt_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  sent_to text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS portal_service_payments_project_idx ON public.portal_service_payments (project_id, created_at DESC);

ALTER TABLE public.portal_service_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS portal_service_payments_staff_read ON public.portal_service_payments;
CREATE POLICY portal_service_payments_staff_read ON public.portal_service_payments FOR SELECT TO authenticated
  USING ((SELECT public.app_is_admin()) OR (SELECT public.app_can_view('/masters/clients')));
DROP POLICY IF EXISTS portal_service_payments_admin_write ON public.portal_service_payments;
CREATE POLICY portal_service_payments_admin_write ON public.portal_service_payments FOR ALL TO authenticated
  USING ((SELECT public.app_is_admin())) WITH CHECK ((SELECT public.app_is_admin()));

-- Customers never read this table directly.
SELECT public.app_apply_customer_lockout();
