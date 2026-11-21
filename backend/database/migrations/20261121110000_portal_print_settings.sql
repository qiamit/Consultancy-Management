-- Customer Portal print formats (owner, 21 Nov 2026): each record section gets print settings, set by Q Engineering in
-- Records Setup: title, page orientation, columns left out of the print, blank rows per page, signature boxes. The
-- customer prints the entries (or a blank register) in that format; the header (company, licence, IS) comes from the
-- licence. New column only; existing sections get {} (defaults: section name as title, all columns, auto page).

ALTER TABLE public.portal_rec_sections ADD COLUMN IF NOT EXISTS print_settings jsonb NOT NULL DEFAULT '{}'::jsonb;

-- portal_section as before, now with print_settings.
CREATE OR REPLACE FUNCTION public.portal_section(p_section_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_project uuid;
  v jsonb;
BEGIN
  SELECT project_id INTO v_project FROM public.portal_rec_sections WHERE id = p_section_id;
  IF v_project IS NULL OR NOT public.portal_can_see_licence(v_project)
     OR (SELECT state FROM public.portal_service_state(v_project)) = 'off' THEN
    RAISE EXCEPTION 'Not found' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object(
           'id', s.id, 'project_id', s.project_id, 'name', s.name, 'kind', s.kind,
           'print_settings', s.print_settings,
           'service', (SELECT jsonb_build_object('state', st.state, 'valid_till', st.valid_till)
                         FROM public.portal_service_state(s.project_id) st),
           'columns', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                                   'id', c.id, 'key', c.key, 'label', c.label, 'col_type', c.col_type, 'unit', c.unit,
                                   'spec_min', c.spec_min, 'spec_max', c.spec_max, 'config', c.config,
                                   'required', c.required) ORDER BY c.sort_order, c.label)
                                  FROM public.portal_rec_columns c WHERE c.section_id = s.id), '[]'))
    INTO v
    FROM public.portal_rec_sections s
   WHERE s.id = p_section_id;
  RETURN v;
END;
$$;
REVOKE ALL ON FUNCTION public.portal_section(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portal_section(uuid) TO authenticated;
