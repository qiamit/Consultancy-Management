-- F19: chart of accounts and a manual journal that must balance.
-- Sale and purchase documents stay their own books. The journal is for adjustments.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE IF NOT EXISTS public.finance_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_name text NOT NULL,
  account_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_accounts_name_nonempty CHECK (btrim(account_name) <> ''),
  CONSTRAINT finance_accounts_type_ck CHECK (account_type IN ('asset', 'liability', 'equity', 'income', 'expense'))
);

CREATE UNIQUE INDEX IF NOT EXISTS finance_accounts_name_uidx
  ON public.finance_accounts (lower(btrim(account_name)));

INSERT INTO public.finance_accounts (account_name, account_type)
SELECT v.account_name, v.account_type
FROM (VALUES
  ('Cash', 'asset'),
  ('Bank', 'asset'),
  ('Debtors', 'asset'),
  ('Creditors', 'liability'),
  ('Capital', 'equity'),
  ('Sales', 'income'),
  ('Purchases', 'expense')
) AS v(account_name, account_type)
WHERE NOT EXISTS (
  SELECT 1 FROM public.finance_accounts a WHERE lower(btrim(a.account_name)) = lower(v.account_name)
);

CREATE TABLE IF NOT EXISTS public.finance_journals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_number text NOT NULL,
  journal_date date NOT NULL DEFAULT CURRENT_DATE,
  journal_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_journals_number_nonempty CHECK (btrim(journal_number) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS finance_journals_number_uidx
  ON public.finance_journals (journal_number);

CREATE TABLE IF NOT EXISTS public.finance_journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_id uuid NOT NULL REFERENCES public.finance_journals (id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.finance_accounts (id),
  debit numeric NOT NULL DEFAULT 0,
  credit numeric NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  CONSTRAINT finance_journal_lines_side_ck CHECK (
    debit >= 0 AND credit >= 0 AND ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0))
  )
);

DROP TRIGGER IF EXISTS trg_finance_journals_updated_at ON public.finance_journals;
CREATE TRIGGER trg_finance_journals_updated_at
  BEFORE UPDATE ON public.finance_journals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.finance_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_journals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_journal_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS finance_accounts_select ON public.finance_accounts;
CREATE POLICY finance_accounts_select ON public.finance_accounts
  FOR SELECT TO authenticated
  USING ((SELECT public.app_is_admin()) OR (SELECT public.app_can_view('/finance/accounts')) OR (SELECT public.app_can_view('/finance/journal')));
DROP POLICY IF EXISTS finance_accounts_write ON public.finance_accounts;
CREATE POLICY finance_accounts_write ON public.finance_accounts
  FOR ALL TO authenticated
  USING ((SELECT public.app_is_admin()) OR (SELECT public.app_can_edit('/finance/accounts')))
  WITH CHECK ((SELECT public.app_is_admin()) OR (SELECT public.app_can_edit('/finance/accounts')));

DROP POLICY IF EXISTS finance_journals_select ON public.finance_journals;
CREATE POLICY finance_journals_select ON public.finance_journals
  FOR SELECT TO authenticated
  USING ((SELECT public.app_is_admin()) OR (SELECT public.app_can_view('/finance/journal')));
DROP POLICY IF EXISTS finance_journals_write ON public.finance_journals;
CREATE POLICY finance_journals_write ON public.finance_journals
  FOR ALL TO authenticated
  USING ((SELECT public.app_is_admin()) OR (SELECT public.app_can_edit('/finance/journal')))
  WITH CHECK ((SELECT public.app_is_admin()) OR (SELECT public.app_can_edit('/finance/journal')));

DROP POLICY IF EXISTS finance_journal_lines_all ON public.finance_journal_lines;
CREATE POLICY finance_journal_lines_all ON public.finance_journal_lines
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.finance_journals j WHERE j.id = journal_id))
  WITH CHECK (
    ((SELECT public.app_is_admin()) OR (SELECT public.app_can_edit('/finance/journal')))
    AND EXISTS (SELECT 1 FROM public.finance_journals j WHERE j.id = journal_id)
  );

REVOKE ALL ON public.finance_accounts FROM PUBLIC, anon;
REVOKE ALL ON public.finance_journals FROM PUBLIC, anon;
REVOKE ALL ON public.finance_journal_lines FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_accounts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_journals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_journal_lines TO authenticated;

INSERT INTO public.document_series (doc_type, prefix, next_number, pad_width) VALUES
  ('JOURNAL', 'QE/26-27/JN/', 1, 4)
ON CONFLICT (doc_type) DO NOTHING;

CREATE OR REPLACE FUNCTION public.save_journal_entry(
  p_journal_id uuid,
  p_number text,
  p_date date,
  p_name text,
  p_lines jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid := COALESCE(p_journal_id, gen_random_uuid());
  v_debit numeric := 0;
  v_credit numeric := 0;
  v_line jsonb;
BEGIN
  IF NOT public.app_can_edit('/finance/journal') THEN
    RAISE EXCEPTION 'No edit access for the journal';
  END IF;
  IF btrim(COALESCE(p_number, '')) = '' THEN
    RAISE EXCEPTION 'Journal number is required';
  END IF;
  IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' OR jsonb_array_length(p_lines) < 2 THEN
    RAISE EXCEPTION 'A journal needs at least two lines';
  END IF;
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    v_debit := v_debit + COALESCE((v_line->>'debit')::numeric, 0);
    v_credit := v_credit + COALESCE((v_line->>'credit')::numeric, 0);
  END LOOP;
  IF round(v_debit, 2) <> round(v_credit, 2) OR round(v_debit, 2) <= 0 THEN
    RAISE EXCEPTION 'Journal debit and credit must balance';
  END IF;

  INSERT INTO public.finance_journals (id, journal_number, journal_date, journal_name)
  VALUES (v_id, btrim(p_number), COALESCE(p_date, CURRENT_DATE), btrim(COALESCE(p_name, '')))
  ON CONFLICT (id) DO UPDATE
    SET journal_number = EXCLUDED.journal_number,
        journal_date = EXCLUDED.journal_date,
        journal_name = EXCLUDED.journal_name,
        updated_at = now();

  DELETE FROM public.finance_journal_lines WHERE journal_id = v_id;
  INSERT INTO public.finance_journal_lines (journal_id, account_id, debit, credit, sort_order)
  SELECT
    v_id,
    (line->>'account_id')::uuid,
    ROUND(COALESCE((line->>'debit')::numeric, 0), 2),
    ROUND(COALESCE((line->>'credit')::numeric, 0), 2),
    ordinality::integer
  FROM jsonb_array_elements(p_lines) WITH ORDINALITY AS src(line, ordinality);
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_journal_entry(uuid, text, date, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_journal_entry(uuid, text, date, text, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
