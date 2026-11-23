-- standard_docs.kind also takes 'Guideline' (BIS Guidelines folder, indexer since PR #183). The CHECK from
-- 20261109110000_standards_index.sql allowed only the five kinds of that time, so the first index run of 23 Nov 2026
-- read every guideline file and could not save it.

ALTER TABLE public.standard_docs DROP CONSTRAINT IF EXISTS standard_docs_kind_check;
ALTER TABLE public.standard_docs ADD CONSTRAINT standard_docs_kind_check
  CHECK (kind IN ('Standard', 'Amendment', 'Product Manual', 'Old version', 'Extra (other)', 'Guideline'));
