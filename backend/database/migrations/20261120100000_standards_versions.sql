-- RAG step 1 (docs/standards-rag-update-rules.md): version facts on every library document, worked out by the indexer
-- on each sync, and the BIS facts of Standards List.xlsx (Status, Revision Year, Amendments, Reaffirmed Year).
--   version_status: Current      — the latest edition of its number / Part / Sec (or an amendment of it)
--                   Superseded   — an older edition, or an amendment of one (kept, shown under History)
--                   Withdrawn    — Standards List says the standard is withdrawn
--                   Included     — an amendment already merged into the edition's file ("- 02" = Amd 1 and 2)
-- Search, Required Tests and the Conformity Check keep choosing documents as before; the tags are for the IS Files
-- window, the coming RAG chunks and a later "Current Only" default.

ALTER TABLE public.standard_docs
  ADD COLUMN IF NOT EXISTS part text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS section text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS amendment_no integer,
  ADD COLUMN IF NOT EXISTS version_status text
    CHECK (version_status IS NULL OR version_status IN ('Current', 'Superseded', 'Withdrawn', 'Included')),
  ADD COLUMN IF NOT EXISTS superseded_by text;

CREATE INDEX IF NOT EXISTS standard_docs_version_idx ON public.standard_docs (folder, part, section, version_status);

ALTER TABLE public.standard_list
  ADD COLUMN IF NOT EXISTS part text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS section text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS revision_year integer,
  ADD COLUMN IF NOT EXISTS amendments integer,
  ADD COLUMN IF NOT EXISTS reaffirmed_year integer;

-- IS Code Master: which IS Codes have a Standard in the library (the green / red View Files button), now that the
-- files open from the library and not from uploads.
CREATE OR REPLACE FUNCTION public.is_codes_with_library_files()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT c.id
  FROM public.is_codes c
  WHERE EXISTS (
    SELECT 1 FROM public.standard_docs d
    WHERE d.folder = 'IS ' || substring(coalesce(c.is_number, '') FROM '(\d+)') AND d.kind = 'Standard'
  );
$$;
REVOKE ALL ON FUNCTION public.is_codes_with_library_files() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_codes_with_library_files() TO authenticated;
