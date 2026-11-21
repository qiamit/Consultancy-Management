-- "Standard Revised — Review" on locked Required Tests (owner's RAG update rules, 19 Nov 2026):
-- when an IS Code's own Standard gets a new edition or a new amendment in the Standards Library after its Required
-- Tests list was locked, the list shows "Standard Revised — Review" with what changed, until an admin marks it
-- reviewed (or the list is unlocked and locked again). No notifications or What's New list (owner's choice).
--
-- Basis = what the library held for the IS Code's own Standard (folder + Part + Sec) when the list was locked:
--   edition    : year of the latest Current Standard
--   amendments : amendments of that edition (Current / Included amendment files, or the "- 0N" of a merged file,
--                whichever is more), so a merged "- 02" replacing "- 00" + Amd 1 + Amd 2 is not a revision
--   file       : that Standard's file name (shown only)

ALTER TABLE public.is_code_required_test_lists
  ADD COLUMN IF NOT EXISTS standard_basis jsonb,
  ADD COLUMN IF NOT EXISTS standard_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS standard_reviewed_by uuid;

CREATE OR REPLACE FUNCTION public.is_code_standard_basis(p_is_code_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH c AS (
    SELECT coalesce(substring(coalesce(part_no, '') FROM '(\d+)'), '') AS part,
           coalesce(substring(coalesce(section_no, '') FROM '(\d+)'), '') AS sec
    FROM public.is_codes
    WHERE id = p_is_code_id
  ),
  own AS (
    SELECT d.kind, d.relpath, d.folder, d.edition_year
    FROM public.standard_docs d, c
    WHERE d.folder = ANY (public.standard_folders_for_is_code(p_is_code_id))
      AND d.source = 'library'
      AND d.active
      AND d.relpath NOT LIKE '%::%'
      AND d.kind IN ('Standard', 'Amendment')
      AND coalesce(d.version_status, 'Current') IN ('Current', 'Included')
      AND coalesce(d.part, '') = c.part
      AND coalesce(d.section, '') = c.sec
  ),
  std AS (
    SELECT o.relpath, o.folder, o.edition_year
    FROM own o
    WHERE o.kind = 'Standard' AND o.edition_year IS NOT NULL
    ORDER BY o.edition_year DESC, o.relpath DESC
    LIMIT 1
  )
  SELECT jsonb_build_object(
           'folder', s.folder,
           'edition', s.edition_year,
           'amendments', greatest(
             (SELECT count(*) FROM own a WHERE a.kind = 'Amendment' AND coalesce(a.edition_year, s.edition_year) >= s.edition_year),
             coalesce(substring(s.relpath FROM ' - (\d{1,2})\.pdf$')::int, 0)
           ),
           'file', regexp_replace(s.relpath, '^.*/', '')
         )
  FROM std s;
$$;
REVOKE ALL ON FUNCTION public.is_code_standard_basis(uuid) FROM PUBLIC, anon, authenticated;

-- Locked lists (all, or the given IS Codes): the basis at lock / review, the library now, and whether it was revised.
CREATE OR REPLACE FUNCTION public.required_tests_standard_check(p_is_code_ids uuid[] DEFAULT NULL)
RETURNS TABLE(is_code_id uuid, basis jsonb, library_now jsonb, revised boolean, reviewed_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.app_is_customer() THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT x.is_code_id, x.standard_basis, x.cur,
         coalesce(
           x.standard_basis IS NOT NULL AND x.cur IS NOT NULL AND (
             (x.cur ->> 'edition')::int > (x.standard_basis ->> 'edition')::int
             OR ((x.cur ->> 'edition')::int = (x.standard_basis ->> 'edition')::int
                 AND (x.cur ->> 'amendments')::int > (x.standard_basis ->> 'amendments')::int)
           ),
           false
         ),
         x.standard_reviewed_at
  FROM (
    SELECT l.is_code_id, l.standard_basis, l.standard_reviewed_at, public.is_code_standard_basis(l.is_code_id) AS cur
    FROM public.is_code_required_test_lists l
    WHERE l.locked_at IS NOT NULL
      AND (p_is_code_ids IS NULL OR l.is_code_id = ANY (p_is_code_ids))
  ) x;
END;
$$;
REVOKE ALL ON FUNCTION public.required_tests_standard_check(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.required_tests_standard_check(uuid[]) TO authenticated;

-- An admin has looked at the revised Standard: the library as it is now becomes the list's basis.
CREATE OR REPLACE FUNCTION public.mark_required_tests_standard_reviewed(p_is_code_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v jsonb;
BEGIN
  IF NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Only an admin can mark the revised Standard as reviewed.';
  END IF;
  v := public.is_code_standard_basis(p_is_code_id);
  PERFORM set_config('qe.standard_review', '1', true);
  UPDATE public.is_code_required_test_lists
     SET standard_basis = v, standard_reviewed_at = now(), standard_reviewed_by = auth.uid()
   WHERE is_code_id = p_is_code_id AND locked_at IS NOT NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This Required Tests list is not locked.';
  END IF;
  PERFORM set_config('qe.standard_review', '', true);
  RETURN v;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_required_tests_standard_reviewed(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_required_tests_standard_reviewed(uuid) TO authenticated;

-- The lists locked today keep the library as it is now as their basis (no flag on release day).
UPDATE public.is_code_required_test_lists
   SET standard_basis = public.is_code_standard_basis(is_code_id)
 WHERE locked_at IS NOT NULL AND standard_basis IS NULL;

-- Locking takes the basis; unlocking drops it. Nobody sets the basis by hand (only the admin's Mark Reviewed).
CREATE OR REPLACE FUNCTION public.required_test_lists_standard_basis()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(current_setting('qe.standard_review', true), '') = '1' THEN
    RETURN NEW;
  END IF;
  IF NEW.locked_at IS NULL THEN
    NEW.standard_basis := NULL;
    NEW.standard_reviewed_at := NULL;
    NEW.standard_reviewed_by := NULL;
  ELSIF TG_OP = 'INSERT' OR OLD.locked_at IS NULL THEN
    NEW.standard_basis := public.is_code_standard_basis(NEW.is_code_id);
    NEW.standard_reviewed_at := NULL;
    NEW.standard_reviewed_by := NULL;
  ELSE
    NEW.standard_basis := OLD.standard_basis;
    NEW.standard_reviewed_at := OLD.standard_reviewed_at;
    NEW.standard_reviewed_by := OLD.standard_reviewed_by;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS required_test_lists_standard_basis ON public.is_code_required_test_lists;
CREATE TRIGGER required_test_lists_standard_basis
  BEFORE INSERT OR UPDATE ON public.is_code_required_test_lists
  FOR EACH ROW EXECUTE FUNCTION public.required_test_lists_standard_basis();
