-- Required Tests of an IS Code: the tests the laboratory must report for a sample, with clause and requirement,
-- reviewed once by staff and locked. The AI Conformity Check can then take "missing tests" from this list instead
-- of guessing from a Product Manual. Filled by hand, by "Suggest With AI" (standards index) or from past checks.

CREATE TABLE IF NOT EXISTS public.is_code_required_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_code_id uuid NOT NULL REFERENCES public.is_codes(id) ON DELETE CASCADE,
  test_name text NOT NULL CHECK (length(trim(test_name)) BETWEEN 1 AND 300),
  clause text NOT NULL DEFAULT '',
  requirement text NOT NULL DEFAULT '',
  -- Grade / type / size the test or its limit applies to; empty = all.
  applies_to text NOT NULL DEFAULT '',
  tested_by text NOT NULL DEFAULT 'Lab' CHECK (tested_by IN ('Lab', 'Factory')),
  source text NOT NULL DEFAULT 'Manual Entry' CHECK (source IN ('Manual Entry', 'AI Suggestion', 'Past Checks')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid DEFAULT auth.uid()
);
CREATE INDEX IF NOT EXISTS is_code_required_tests_code_idx ON public.is_code_required_tests (is_code_id, sort_order);

-- One row per IS Code whose list was reviewed: locked lists are the ones the Conformity Check relies on.
CREATE TABLE IF NOT EXISTS public.is_code_required_test_lists (
  is_code_id uuid PRIMARY KEY REFERENCES public.is_codes(id) ON DELETE CASCADE,
  locked_at timestamptz,
  locked_by uuid,
  notes text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.is_code_required_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.is_code_required_test_lists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS is_code_required_tests_staff ON public.is_code_required_tests;
CREATE POLICY is_code_required_tests_staff ON public.is_code_required_tests FOR ALL TO authenticated
  USING (NOT (SELECT public.app_is_customer()))
  WITH CHECK (NOT (SELECT public.app_is_customer()));
DROP POLICY IF EXISTS is_code_required_test_lists_staff ON public.is_code_required_test_lists;
CREATE POLICY is_code_required_test_lists_staff ON public.is_code_required_test_lists FOR ALL TO authenticated
  USING (NOT (SELECT public.app_is_customer()))
  WITH CHECK (NOT (SELECT public.app_is_customer()));
REVOKE ALL ON public.is_code_required_tests, public.is_code_required_test_lists FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.is_code_required_tests, public.is_code_required_test_lists TO authenticated;

-- A locked list cannot be changed: unlock it first (is_code_required_test_lists.locked_at = null).
CREATE OR REPLACE FUNCTION public.is_code_required_tests_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_code uuid := coalesce(NEW.is_code_id, OLD.is_code_id);
BEGIN
  -- Deleting the IS Code itself (cascade) is allowed: the parent row is already gone then.
  IF EXISTS (SELECT 1 FROM public.is_code_required_test_lists l WHERE l.is_code_id = v_code AND l.locked_at IS NOT NULL)
     AND EXISTS (SELECT 1 FROM public.is_codes c WHERE c.id = v_code) THEN
    RAISE EXCEPTION 'The Required Tests of this IS Code are locked. Unlock the list to change it.';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
    NEW.updated_by := auth.uid();
  END IF;
  RETURN coalesce(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS is_code_required_tests_guard ON public.is_code_required_tests;
CREATE TRIGGER is_code_required_tests_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.is_code_required_tests
  FOR EACH ROW EXECUTE FUNCTION public.is_code_required_tests_guard();

-- Tests found in past AI Conformity Checks of samples of this IS Code (BIS projects, OSL sample requirements),
-- with how many checks reported each: a cross-check for the list.
CREATE OR REPLACE FUNCTION public.required_tests_from_past_checks(p_is_code_id uuid)
RETURNS TABLE (test_name text, clause text, requirement text, checks integer)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH results AS (
    SELECT
      trim(r->>'parameter') AS test_name,
      trim(coalesce(r->>'clause', '')) AS clause,
      trim(coalesce(r->>'requirement', '')) AS requirement
    FROM public.bis_projects p
    JOIN public.bis_project_module_data m ON m.bis_project_id = p.id AND m.module_kind = 'osl-sample-requirements'
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(m.payload->'rows', '[]'::jsonb)) AS s(row)
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(s.row->'conformityCheck'->'results', '[]'::jsonb)) AS x(r)
    WHERE p.is_code_id = p_is_code_id
      AND coalesce(trim(r->>'parameter'), '') <> ''
  )
  SELECT
    min(test_name) AS test_name,
    mode() WITHIN GROUP (ORDER BY clause) AS clause,
    mode() WITHIN GROUP (ORDER BY requirement) AS requirement,
    count(*)::integer AS checks
  FROM results
  GROUP BY lower(regexp_replace(test_name, '\s+', ' ', 'g'))
  ORDER BY count(*) DESC, min(test_name)
  LIMIT 200;
$$;
REVOKE ALL ON FUNCTION public.required_tests_from_past_checks(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.required_tests_from_past_checks(uuid) TO authenticated;
