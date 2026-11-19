-- Reference Standards added by hand to an IS Code (IS Files → Reference Standards → Add Reference). The references
-- found in the Standard's own text come from standard_refs; these are the extra ones staff want linked (a test
-- method the Standard does not name, a related product standard). Kept by number and Part, so a newer edition of
-- the referenced standard is picked up by itself after a sync.

CREATE TABLE IF NOT EXISTS public.is_code_reference_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_code_id uuid NOT NULL REFERENCES public.is_codes(id) ON DELETE CASCADE,
  ref_base text NOT NULL CHECK (length(trim(ref_base)) BETWEEN 2 AND 60),
  ref_part text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  UNIQUE (is_code_id, ref_base, ref_part)
);
CREATE INDEX IF NOT EXISTS is_code_reference_links_code_idx ON public.is_code_reference_links (is_code_id);

ALTER TABLE public.is_code_reference_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS is_code_reference_links_staff ON public.is_code_reference_links;
CREATE POLICY is_code_reference_links_staff ON public.is_code_reference_links FOR ALL TO authenticated
  USING (NOT (SELECT public.app_is_customer()))
  WITH CHECK (NOT (SELECT public.app_is_customer()));
REVOKE ALL ON public.is_code_reference_links FROM anon;
GRANT SELECT, INSERT, DELETE ON public.is_code_reference_links TO authenticated;
