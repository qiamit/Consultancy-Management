-- One list of tests per IS Code. The Required Tests of the IS Code Master and the Test Parameter master were two lists
-- of the same thing; they become one: public.test_parameters (the table BIS Application / Licence Factory Test Reports
-- and the Customer Portal records already read). The Required Tests window of the IS Code Master edits it; the Test
-- Parameter page is retired. is_code_required_test_lists keeps the lock and notes of each IS Code's list.

-- 1. The Required Tests fields.
ALTER TABLE public.test_parameters ADD COLUMN IF NOT EXISTS applies_to text NOT NULL DEFAULT '';
ALTER TABLE public.test_parameters ADD COLUMN IF NOT EXISTS tested_by text NOT NULL DEFAULT 'Lab';
ALTER TABLE public.test_parameters ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'Manual Entry';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'test_parameters_tested_by_check') THEN
    ALTER TABLE public.test_parameters ADD CONSTRAINT test_parameters_tested_by_check CHECK (tested_by IN ('Lab', 'Factory'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'test_parameters_source_check') THEN
    ALTER TABLE public.test_parameters ADD CONSTRAINT test_parameters_source_check
      CHECK (source IN ('Manual Entry', 'AI Suggestion', 'Past Checks'));
  END IF;
END $$;

-- 2. The old column pairs (test_name / item_name, unit / unit_value, specified_value / specific_requirement) stay
-- equal: the named column (item_name, unit_value, specific_requirement) wins when it has a value. Before, the alias
-- was only filled when empty, so an edited name left the alias stale (the Customer Portal reads the alias).
CREATE OR REPLACE FUNCTION public.sync_test_parameters_lims_aliases()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF coalesce(btrim(NEW.item_name), '') <> '' THEN
    NEW.test_name := NEW.item_name;
  ELSE
    NEW.item_name := NEW.test_name;
  END IF;
  IF coalesce(btrim(NEW.unit_value), '') <> '' THEN
    NEW.unit := NEW.unit_value;
  ELSE
    NEW.unit_value := NEW.unit;
  END IF;
  IF coalesce(btrim(NEW.specific_requirement), '') <> '' THEN
    NEW.specified_value := NEW.specific_requirement;
  ELSE
    NEW.specific_requirement := NEW.specified_value;
  END IF;
  RETURN NEW;
END;
$$;

UPDATE public.test_parameters
SET item_name = item_name
WHERE test_name IS DISTINCT FROM coalesce(nullif(btrim(item_name), ''), test_name)
   OR unit IS DISTINCT FROM coalesce(nullif(btrim(unit_value), ''), unit)
   OR specified_value IS DISTINCT FROM coalesce(nullif(btrim(specific_requirement), ''), specified_value);

-- 3. Move the Required Tests rows in. A test the IS Code already has (same name) keeps its row and takes the
-- Required Tests fields; the others are added after the IS Code's existing tests, in their order.
UPDATE public.test_parameters t
SET applies_to = r.applies_to,
    tested_by = r.tested_by,
    source = r.source,
    clause_no = CASE WHEN btrim(t.clause_no) = '' THEN r.clause ELSE t.clause_no END,
    specific_requirement = CASE WHEN coalesce(btrim(t.specific_requirement), '') = '' THEN r.requirement ELSE t.specific_requirement END
FROM public.is_code_required_tests r
WHERE r.is_code_id = t.is_code_id
  AND t.archived_at IS NULL
  AND lower(btrim(coalesce(t.item_name, t.test_name))) = lower(btrim(r.test_name));

INSERT INTO public.test_parameters
  (is_code_id, is_code_label, test_name, item_name, clause_no, specific_requirement, specified_value,
   applies_to, tested_by, source, display_order, created_by)
SELECT r.is_code_id,
       coalesce(
         (SELECT t.is_code_label FROM public.test_parameters t WHERE t.is_code_id = r.is_code_id AND t.is_code_label IS NOT NULL LIMIT 1),
         (SELECT btrim(c.is_number)
                 || CASE WHEN coalesce(btrim(c.part_no), '') !~ '^(part[-\s]*)?0*$' THEN ' (Part ' || regexp_replace(btrim(c.part_no), '^part[-\s]*', '', 'i') || ')' ELSE '' END
                 || CASE WHEN coalesce(btrim(c.revision_year::text), '') <> '' THEN ': ' || btrim(c.revision_year::text) ELSE '' END
          FROM public.is_codes c WHERE c.id = r.is_code_id)),
       r.test_name, r.test_name, r.clause, r.requirement, r.requirement,
       r.applies_to, r.tested_by, r.source,
       coalesce((SELECT max(t.display_order) FROM public.test_parameters t WHERE t.is_code_id = r.is_code_id), 0) + 1 + r.sort_order,
       r.created_by
FROM public.is_code_required_tests r
WHERE NOT EXISTS (
  SELECT 1 FROM public.test_parameters t
  WHERE t.is_code_id = r.is_code_id AND t.archived_at IS NULL
    AND lower(btrim(coalesce(t.item_name, t.test_name))) = lower(btrim(r.test_name))
);

COMMENT ON TABLE public.is_code_required_tests IS
  'Merged into test_parameters on 15 Nov 2026 (migration 20261115120000); no longer read or written by the app. Kept for reference.';

-- 4. A locked list cannot be changed (unlock it first). The test itself is guarded: adding, removing or changing the
-- name, clause, method, unit, requirement or who tests it. Other fields (MU, accreditation) stay editable.
CREATE OR REPLACE FUNCTION public.test_parameters_lock_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_code uuid := coalesce(NEW.is_code_id, OLD.is_code_id);
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.is_code_id IS NOT DISTINCT FROM OLD.is_code_id
     AND NEW.item_name IS NOT DISTINCT FROM OLD.item_name
     AND NEW.clause_no IS NOT DISTINCT FROM OLD.clause_no
     AND NEW.test_method IS NOT DISTINCT FROM OLD.test_method
     AND NEW.unit_value IS NOT DISTINCT FROM OLD.unit_value
     AND NEW.specific_requirement IS NOT DISTINCT FROM OLD.specific_requirement
     AND NEW.applies_to IS NOT DISTINCT FROM OLD.applies_to
     AND NEW.tested_by IS NOT DISTINCT FROM OLD.tested_by
     AND NEW.archived_at IS NOT DISTINCT FROM OLD.archived_at THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM public.is_code_required_test_lists l WHERE l.is_code_id = v_code AND l.locked_at IS NOT NULL)
     OR (TG_OP = 'UPDATE' AND OLD.is_code_id IS DISTINCT FROM NEW.is_code_id AND EXISTS (
       SELECT 1 FROM public.is_code_required_test_lists l WHERE l.is_code_id = OLD.is_code_id AND l.locked_at IS NOT NULL)) THEN
    RAISE EXCEPTION 'The Required Tests of this IS Code are locked. Unlock the list in IS Code Master to change it.';
  END IF;
  RETURN coalesce(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS aa_test_parameters_lock_guard ON public.test_parameters;
CREATE TRIGGER aa_test_parameters_lock_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.test_parameters
  FOR EACH ROW EXECUTE FUNCTION public.test_parameters_lock_guard();
