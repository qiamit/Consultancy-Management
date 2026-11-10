-- Standards index: the category of a document's IS folder, from the Mac folder layout
--   IS Standards/1 Specifications/…        -> Specification
--   IS Standards/2 Test Methods/…          -> Test Method
--   IS Standards/3 General and Reference/… -> General and Reference
--   IS Standards/_Review/…                 -> Review (not decided yet)
-- Null for folders still in the old layout. Filled by deploy/standards-index/sync_app.py. The Standards Library's
-- "role" builds on it later.

ALTER TABLE public.standard_docs ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.standard_docs DROP CONSTRAINT IF EXISTS standard_docs_category_ck;
ALTER TABLE public.standard_docs ADD CONSTRAINT standard_docs_category_ck
  CHECK (category IS NULL OR category IN ('Specification', 'Test Method', 'General and Reference', 'Review'));
CREATE INDEX IF NOT EXISTS standard_docs_category_idx ON public.standard_docs (category);
