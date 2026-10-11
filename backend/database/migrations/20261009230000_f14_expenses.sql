-- F14: expenses and category master. Categories are edited in Lab Settings and on the expense form.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE IF NOT EXISTS public.expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT expense_categories_name_nonempty CHECK (btrim(name) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS expense_categories_name_uidx
  ON public.expense_categories (lower(btrim(name)));

INSERT INTO public.expense_categories (name)
SELECT v.name
FROM (VALUES ('Salary'), ('Travel'), ('Taxes'), ('Rent'), ('Other')) AS v(name)
WHERE NOT EXISTS (
  SELECT 1 FROM public.expense_categories c WHERE lower(btrim(c.name)) = lower(v.name)
);

CREATE TABLE IF NOT EXISTS public.finance_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_number text NOT NULL,
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  client_id uuid REFERENCES public.clients (id) ON DELETE SET NULL,
  category_id uuid REFERENCES public.expense_categories (id) ON DELETE SET NULL,
  amount numeric NOT NULL DEFAULT 0,
  notes text,
  expense_status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT finance_expenses_number_nonempty CHECK (btrim(expense_number) <> ''),
  CONSTRAINT finance_expenses_amount_ck CHECK (amount >= 0),
  CONSTRAINT finance_expenses_status_ck CHECK (expense_status = ANY (ARRAY['pending'::text, 'accepted'::text, 'cancelled'::text]))
);

CREATE UNIQUE INDEX IF NOT EXISTS finance_expenses_number_uidx
  ON public.finance_expenses (expense_number);

DROP TRIGGER IF EXISTS trg_finance_expenses_updated_at ON public.finance_expenses;
CREATE TRIGGER trg_finance_expenses_updated_at
  BEFORE UPDATE ON public.finance_expenses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS expense_categories_select ON public.expense_categories;
CREATE POLICY expense_categories_select ON public.expense_categories
  FOR SELECT TO authenticated
  USING (
    (SELECT public.app_is_admin())
    OR (SELECT public.app_can_view('/finance/expense'))
    OR (SELECT public.app_can_view('/settings/lab'))
  );
DROP POLICY IF EXISTS expense_categories_write ON public.expense_categories;
CREATE POLICY expense_categories_write ON public.expense_categories
  FOR ALL TO authenticated
  USING (
    (SELECT public.app_is_admin())
    OR (SELECT public.app_can_edit('/finance/expense'))
    OR (SELECT public.app_can_edit('/settings/lab'))
  )
  WITH CHECK (
    (SELECT public.app_is_admin())
    OR (SELECT public.app_can_edit('/finance/expense'))
    OR (SELECT public.app_can_edit('/settings/lab'))
  );

DROP POLICY IF EXISTS finance_expenses_select ON public.finance_expenses;
CREATE POLICY finance_expenses_select ON public.finance_expenses
  FOR SELECT TO authenticated
  USING ((SELECT public.app_is_admin()) OR (SELECT public.app_can_view('/finance/expense')));
DROP POLICY IF EXISTS finance_expenses_write ON public.finance_expenses;
CREATE POLICY finance_expenses_write ON public.finance_expenses
  FOR ALL TO authenticated
  USING ((SELECT public.app_is_admin()) OR (SELECT public.app_can_edit('/finance/expense')))
  WITH CHECK ((SELECT public.app_is_admin()) OR (SELECT public.app_can_edit('/finance/expense')));

REVOKE ALL ON public.expense_categories FROM PUBLIC, anon;
REVOKE ALL ON public.finance_expenses FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_categories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_expenses TO authenticated;

INSERT INTO public.document_series (doc_type, prefix, next_number, pad_width) VALUES
  ('EXPENSE', 'QE/26-27/EX/', 1, 4)
ON CONFLICT (doc_type) DO NOTHING;

NOTIFY pgrst, 'reload schema';
